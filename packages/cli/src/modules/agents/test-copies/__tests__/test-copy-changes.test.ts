import { describeWrite, isWrite, parseMime } from '../test-copy-changes';

const mime = (headers: string, body: string) =>
	Buffer.from(`${headers}\r\n\r\n${body}`).toString('base64url');

describe('isWrite', () => {
	it('treats GET and search POSTs as reads', () => {
		expect(isWrite('GET', new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages'))).toBe(
			false,
		);
		expect(isWrite('POST', new URL('https://api.hubapi.com/crm/v3/objects/contacts/search'))).toBe(
			false,
		);
		expect(isWrite('POST', new URL('https://slack.com/api/conversations.history'))).toBe(false);
	});

	it('treats sends and updates as writes', () => {
		expect(isWrite('POST', new URL('https://slack.com/api/chat.postMessage'))).toBe(true);
		expect(isWrite('PATCH', new URL('https://api.hubapi.com/crm/v3/objects/contacts/1'))).toBe(
			true,
		);
	});
});

describe('describeWrite', () => {
	it('reads the recipient, subject and body of a Gmail send', () => {
		const raw = mime(
			'From: riley@harborpine.test\r\nTo: dana.lee@example.com\r\nSubject: Your order\r\nContent-Type: text/plain',
			'Hi Dana,\r\nIt ships today.',
		);
		const change = describeWrite({
			method: 'POST',
			url: new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/send'),
			body: { raw },
			toolCallId: 'call-1',
		});
		expect(change).toMatchObject({
			kind: 'email',
			status: 'notSent',
			title: 'Email to dana.lee@example.com',
			toolCallId: 'call-1',
			email: { to: ['dana.lee@example.com'], subject: 'Your order' },
		});
		expect(change?.email?.body).toContain('It ships today.');
	});

	it('names the Slack channel from its id', () => {
		const change = describeWrite(
			{
				method: 'POST',
				url: new URL('https://slack.com/api/chat.postMessage'),
				body: 'channel=C1&text=Order%20late',
			},
			{ slackChannels: new Map([['C1', 'support']]) },
		);
		expect(change).toMatchObject({
			title: 'Message in #support',
			message: { channel: 'support', text: 'Order late', inThread: false },
		});
	});

	it('shows a sheet row with its columns and the rows above it', () => {
		const change = describeWrite(
			{
				method: 'POST',
				url: new URL('https://sheets.googleapis.com/v4/spreadsheets/abc/values/Log!A:C:append'),
				body: { values: [['16 Nov', '#1042', 'late']] },
			},
			{
				sheetTitle: 'Support log',
				sheetRows: [
					['Date', 'Order', 'Status'],
					['15 Nov', '#1040', 'done'],
				],
			},
		);
		expect(change?.row).toEqual({
			sheet: 'Support log',
			columns: ['Date', 'Order', 'Status'],
			values: ['16 Nov', '#1042', 'late'],
			contextRows: [['15 Nov', '#1040', 'done']],
		});
	});

	it('gives each HubSpot field its value before and after', () => {
		const change = describeWrite(
			{
				method: 'POST',
				url: new URL(
					'https://api.hubapi.com/contacts/v1/contact/createOrUpdate/email/dana%40example.com',
				),
				body: { properties: [{ property: 'lifecyclestage', value: 'customer' }] },
			},
			{ hubspotBefore: { lifecyclestage: 'lead' }, hubspotLabel: 'Dana Lee' },
		);
		expect(change).toMatchObject({
			title: 'Contact Dana Lee updated',
			record: { fields: [{ name: 'lifecyclestage', before: 'lead', after: 'customer' }] },
		});
	});
});

describe('parseMime', () => {
	it('reads the text part of a multipart message', () => {
		const raw = mime(
			'To: a@b.test\r\nSubject: Hi\r\nContent-Type: multipart/alternative; boundary="x"',
			'--x\r\nContent-Type: text/plain\r\n\r\nPlain body\r\n--x\r\nContent-Type: text/html\r\n\r\n<p>Html</p>\r\n--x--',
		);
		expect(parseMime(raw).body).toBe('Plain body');
	});

	it('decodes a quoted-printable body', () => {
		const raw = mime(
			'To: a@b.test\r\nSubject: Hi\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable',
			'I=E2=80=99m sorry for the long=\r\n wait.',
		);
		expect(parseMime(raw).body).toBe('I\u2019m sorry for the long wait.');
	});
});
