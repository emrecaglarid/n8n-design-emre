import { formatTestChannelMessage, type AgentTestChange } from '@n8n/api-types';
import { describe, expect, it } from 'vitest';

import {
	assignChannelSends,
	getChannelMessages,
	getCountNoun,
	getInitials,
	getTurnChanges,
	groupChangesByApp,
	splitBoldText,
} from './testCopy.utils';

function change(overrides: Partial<AgentTestChange>): AgentTestChange {
	return {
		id: 'c',
		app: 'Gmail',
		appKey: 'gmail',
		kind: 'email',
		status: 'notSent',
		title: 'Email',
		createdAt: '2026-11-16T10:00:00.000Z',
		...overrides,
	};
}

describe('groupChangesByApp', () => {
	it('groups by app, newest change first, and puts the newest group first', () => {
		const changes = [
			change({ id: 'mail-1', createdAt: '2026-11-16T10:00:00.000Z' }),
			change({
				id: 'slack-1',
				app: 'Slack',
				appKey: 'slack',
				createdAt: '2026-11-16T10:01:00.000Z',
			}),
			change({ id: 'mail-2', createdAt: '2026-11-16T10:02:00.000Z' }),
		];

		const groups = groupChangesByApp(changes);

		expect(groups.map((group) => group.app)).toEqual(['Gmail', 'Slack']);
		expect(groups[0].changes.map((item) => item.id)).toEqual(['mail-2', 'mail-1']);
		expect(groups[1].changes.map((item) => item.id)).toEqual(['slack-1']);
	});

	it('puts the later server item first when two changes have the same time', () => {
		const groups = groupChangesByApp([change({ id: 'a' }), change({ id: 'b' })]);

		expect(groups[0].changes.map((item) => item.id)).toEqual(['b', 'a']);
	});
});

describe('assignChannelSends', () => {
	it('matches sends to user messages in order and by text', () => {
		const result = assignChannelSends(
			[
				{ id: 'u1', text: 'Hi' },
				{ id: 'u2', text: 'Where is my order?' },
				{ id: 'u3', text: 'Where is my order?' },
			],
			[{ text: 'Where is my order?', label: '#support', senderName: 'Dana' }],
		);

		expect([...result.keys()]).toEqual(['u2']);
	});
});

describe('getTurnChanges', () => {
	it('puts each change under the last assistant item with tool calls of its turn', () => {
		const result = getTurnChanges(
			[
				{ id: 'u1', role: 'user', toolCallIds: [] },
				{ id: 'a1', role: 'assistant', toolCallIds: ['read', 'write'] },
				{ id: 'a2', role: 'assistant', toolCallIds: [] },
				{ id: 'u2', role: 'user', toolCallIds: [] },
				{ id: 'a3', role: 'assistant', toolCallIds: ['read'] },
			],
			[change({ id: 'email', toolCallId: 'write' })],
			new Set(),
		);

		expect([...result.changes.keys()]).toEqual(['a1']);
		expect(result.changes.get('a1')?.map((item) => item.id)).toEqual(['email']);
		expect(result.replies.size).toBe(0);
	});

	it('keeps each channel reply apart from the tool writes of the turn it answered', () => {
		const result = getTurnChanges(
			[
				{ id: 'u1', role: 'user', toolCallIds: [] },
				{ id: 'a1', role: 'assistant', toolCallIds: [] },
				{ id: 'u2', role: 'user', toolCallIds: [] },
				{ id: 'a2', role: 'assistant', toolCallIds: ['write'] },
				{ id: 'u3', role: 'user', toolCallIds: [] },
				{ id: 'a3', role: 'assistant', toolCallIds: [] },
			],
			[
				change({ id: 'reply-2', createdAt: '2026-11-16T10:05:00.000Z' }),
				change({ id: 'row', toolCallId: 'write', createdAt: '2026-11-16T10:01:00.000Z' }),
				change({ id: 'reply-1', createdAt: '2026-11-16T10:02:00.000Z' }),
			],
			new Set(['u2', 'u3']),
		);

		expect(result.changes.get('a1')).toBeUndefined();
		expect(result.changes.get('a2')?.map((item) => item.id)).toEqual(['row']);
		expect(result.replies.get('a2')?.id).toBe('reply-1');
		expect(result.replies.get('a3')?.id).toBe('reply-2');
	});
});

describe('getCountNoun', () => {
	it('names one kind of change and falls back to changes for a mix', () => {
		expect(getCountNoun([change({ kind: 'message' }), change({ kind: 'message' })])).toBe(
			'message',
		);
		expect(
			getCountNoun([
				change({ kind: 'record', record: { object: 'Contact', label: 'Dana', fields: [] } }),
			]),
		).toBe('contact');
		expect(getCountNoun([change({ kind: 'email' }), change({ kind: 'row' })])).toBe('change');
	});
});

describe('getInitials', () => {
	it('uses the first and last name', () => {
		expect(getInitials('Riley Chen')).toBe('RC');
		expect(getInitials('Support bot v2')).toBe('SV');
		expect(getInitials('Dana')).toBe('D');
	});
});

describe('splitBoldText', () => {
	it('drops the bold markers and keeps the text', () => {
		expect(splitBoldText('Order **#1006** is late')).toEqual([
			{ text: 'Order ', bold: false },
			{ text: '#1006', bold: true },
			{ text: ' is late', bold: false },
		]);
	});
});

describe('getTurnChanges with times', () => {
	it('gives a reply to the last turn that started before it, also after a reload', () => {
		const result = getTurnChanges(
			[
				{ id: 'u1', role: 'user', toolCallIds: [], createdAt: Date.parse('2026-11-16T10:00:00Z') },
				{ id: 'a1', role: 'assistant', toolCallIds: [] },
				{ id: 'u2', role: 'user', toolCallIds: [], createdAt: Date.parse('2026-11-16T10:10:00Z') },
				{ id: 'a2', role: 'assistant', toolCallIds: [] },
			],
			[change({ id: 'reply', createdAt: '2026-11-16T10:03:00.000Z' })],
			new Set(),
		);

		expect([...result.replies.keys()]).toEqual(['a1']);
	});
});

describe('getChannelMessages', () => {
	it('reads saved messages first and uses the local record only for unsaved ones', () => {
		const result = getChannelMessages(
			[
				{ id: 'saved', text: formatTestChannelMessage('#support', 'Riley Chen', 'Order #1006?') },
				{ id: 'chat', text: 'Hi' },
				{ id: 'optimistic', text: 'Order #1007?' },
			],
			[{ text: 'Order #1007?', label: '#support', senderName: 'Riley Chen' }],
		);

		expect(result.get('saved')).toEqual({
			label: '#support',
			senderName: 'Riley Chen',
			text: 'Order #1006?',
		});
		expect(result.has('chat')).toBe(false);
		expect(result.get('optimistic')?.text).toBe('Order #1007?');
	});
});

describe('getTurnChanges reply place', () => {
	it('puts the reply under the assistant item that shows the reply text', () => {
		const result = getTurnChanges(
			[
				{ id: 'u1', role: 'user', toolCallIds: [] },
				{ id: 'tools', role: 'assistant', toolCallIds: ['write'] },
				{ id: 'text', role: 'assistant', toolCallIds: [], hasText: true },
			],
			[
				change({ id: 'row', toolCallId: 'write' }),
				change({ id: 'reply', kind: 'message', createdAt: '2026-11-16T10:05:00.000Z' }),
			],
			new Set(['u1']),
		);

		expect(result.changes.get('tools')?.map((item) => item.id)).toEqual(['row']);
		expect(result.replies.get('text')?.id).toBe('reply');
	});
});
