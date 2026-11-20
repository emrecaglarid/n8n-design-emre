import type { AgentTestChange, AgentTestChangeRecordField } from '@n8n/api-types';
import { randomUUID } from 'node:crypto';

/** A write request that a tool sent to an app, as the request hook saw it. */
export interface CapturedWrite {
	method: string;
	url: URL;
	body: unknown;
	toolCallId?: string;
	toolName?: string;
}

/** What the copy looked like before the write, for apps that show before and after. */
export interface WriteContext {
	/** Channel id to channel name, for Slack. */
	slackChannels?: Map<string, string>;
	/** Spreadsheet rows (header first) of the sheet the write targets. */
	sheetRows?: string[][];
	sheetTitle?: string;
	/** HubSpot contact properties before the write. */
	hubspotBefore?: Record<string, string>;
	hubspotLabel?: string;
}

const READ_POST_PATHS = [/\/search$/, /\/batch\/read$/, /:batchGet$/, /\/query$/];
const SLACK_READ_METHODS = /^(conversations|users|auth|team|bots|emoji|reactions\.get|files\.info)/;

/** Writes change data or reach people. Reads that use POST (search APIs) are not writes. */
export function isWrite(method: string, url: URL): boolean {
	const m = method.toUpperCase();
	if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
	if (url.hostname === 'slack.com') {
		const apiMethod = url.pathname.replace(/^\/api\//, '');
		return !SLACK_READ_METHODS.test(apiMethod);
	}
	return !READ_POST_PATHS.some((re) => re.test(url.pathname));
}

export function parseBody(body: unknown): Record<string, unknown> {
	if (!body) return {};
	if (typeof body === 'string') {
		try {
			const parsed: unknown = JSON.parse(body);
			if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
		} catch {
			return Object.fromEntries(new URLSearchParams(body));
		}
		return {};
	}
	if (body instanceof URLSearchParams) return Object.fromEntries(body);
	if (typeof body === 'object') return body as Record<string, unknown>;
	return {};
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Turns a captured write into the change the test pane shows. */
export function describeWrite(
	write: CapturedWrite,
	ctx: WriteContext = {},
): AgentTestChange | undefined {
	const base = {
		id: randomUUID(),
		toolCallId: write.toolCallId,
		toolName: write.toolName,
		createdAt: new Date().toISOString(),
	};
	const body = parseBody(write.body);
	const { hostname, pathname } = write.url;

	if (
		/^(gmail|www)\.googleapis\.com$/.test(hostname) &&
		/\/gmail\/v1\/users\/[^/]+\/messages\/send$/.test(pathname)
	) {
		const email = parseMime(str(body.raw));
		return {
			...base,
			app: 'Gmail',
			appKey: 'gmail',
			kind: 'email',
			status: 'notSent',
			title: `Email to ${email.to.join(', ') || 'unknown recipient'}`,
			email,
		};
	}

	if (hostname === 'slack.com' && /chat\.(postMessage|scheduleMessage)$/.test(pathname)) {
		const raw = str(body.channel);
		const name = ctx.slackChannels?.get(raw) ?? raw.replace(/^#/, '');
		return {
			...base,
			app: 'Slack',
			appKey: 'slack',
			kind: 'message',
			status: 'notSent',
			title: body.thread_ts ? `Reply in #${name}` : `Message in #${name}`,
			message: { channel: name, text: str(body.text), inThread: Boolean(body.thread_ts) },
		};
	}

	// Sheets grows the grid before an append: a step of the append, not a change of its own.
	if (
		hostname === 'sheets.googleapis.com' &&
		/:batchUpdate$/.test(pathname) &&
		!pathname.includes('/values')
	) {
		return undefined;
	}

	if (hostname === 'sheets.googleapis.com' && /\/values\//.test(pathname)) {
		const values = extractSheetValues(body);
		const rows = ctx.sheetRows ?? [];
		const columns = rows[0] ?? values.map((_, i) => String.fromCharCode(65 + i));
		const sheet = ctx.sheetTitle ?? decodeURIComponent(pathname.split('/values/')[1] ?? 'Sheet');
		return {
			...base,
			app: 'Google Sheets',
			appKey: 'googleSheets',
			kind: 'row',
			status: 'notSaved',
			title: `Row added to ${sheet}`,
			row: { sheet, columns, values, contextRows: rows.slice(1).slice(-3) },
		};
	}

	if (/hubapi\.com$/.test(hostname) && /contact/.test(pathname)) {
		const after = extractHubspotProperties(body);
		const before = ctx.hubspotBefore ?? {};
		const fields: AgentTestChangeRecordField[] = Object.entries(after).map(([name, value]) => ({
			name,
			before: before[name] ?? null,
			after: value,
		}));
		const label =
			ctx.hubspotLabel ??
			[after.firstname ?? before.firstname, after.lastname ?? before.lastname]
				.filter(Boolean)
				.join(' ') ??
			'contact';
		return {
			...base,
			app: 'HubSpot',
			appKey: 'hubspot',
			kind: 'record',
			status: 'notSaved',
			title: `Contact ${label || 'record'} updated`,
			record: { object: 'Contact', label: label || 'Contact', fields },
		};
	}

	const appKey = hostname.endsWith('myshopify.com') ? 'shopify' : 'other';
	return {
		...base,
		app: appKey === 'shopify' ? 'Shopify' : hostname,
		appKey,
		kind: 'other',
		status: 'notSaved',
		title: `${write.method.toUpperCase()} ${pathname}`,
		other: { method: write.method.toUpperCase(), url: write.url.toString(), body },
	};
}

function extractSheetValues(body: Record<string, unknown>): string[] {
	const pick = (v: unknown): string[] =>
		Array.isArray(v) && Array.isArray(v[0]) ? (v[0] as unknown[]).map(str) : [];
	if (Array.isArray(body.values)) return pick(body.values);
	if (Array.isArray(body.data)) {
		const first = (body.data as Array<{ values?: unknown }>)[0];
		return pick(first?.values);
	}
	return [];
}

function extractHubspotProperties(body: Record<string, unknown>): Record<string, string> {
	const props = body.properties;
	if (Array.isArray(props)) {
		// Legacy contacts API: [{ property, value }]
		return Object.fromEntries(
			(props as Array<{ property?: unknown; value?: unknown }>).map((p) => [
				str(p.property),
				str(p.value),
			]),
		);
	}
	if (props && typeof props === 'object') {
		return Object.fromEntries(
			Object.entries(props as Record<string, unknown>).map(([k, v]) => [k, str(v)]),
		);
	}
	return {};
}

/** Reads the headers and the text body of a base64url-encoded RFC 822 message. */
export function parseMime(raw: string): NonNullable<AgentTestChange['email']> {
	const text = raw ? Buffer.from(raw, 'base64url').toString('utf8') : '';
	const [head, ...rest] = text.split(/\r?\n\r?\n/);
	const headers = new Map<string, string>();
	for (const line of (head ?? '').replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
	}
	const list = (v?: string) =>
		(v ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	let body = rest.join('\n\n');
	const boundary = /boundary="?([^";]+)"?/i.exec(headers.get('content-type') ?? '')?.[1];
	if (boundary) {
		const parts = body.split(`--${boundary}`);
		const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p));
		const html = parts.find((p) => /content-type:\s*text\/html/i.test(p));
		const part = plain ?? html ?? '';
		const [partHead, ...partBody] = part.split(/\r?\n\r?\n/);
		body = partBody.join('\n\n');
		body = decodeTransfer(body, partHead ?? '');
		if (!plain && html) body = body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
	} else {
		body = decodeTransfer(body, head ?? '');
	}
	if (/text\/html/i.test(headers.get('content-type') ?? '')) {
		body = body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
	}
	return {
		from: headers.get('from'),
		to: list(headers.get('to')),
		cc: list(headers.get('cc')),
		subject: decodeMimeWord(headers.get('subject') ?? ''),
		body: body.trim(),
	};
}

/** Decodes a body by its Content-Transfer-Encoding header (base64 or quoted-printable). */
function decodeTransfer(body: string, head: string): string {
	if (/content-transfer-encoding:\s*base64/i.test(head)) {
		return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
	}
	if (/content-transfer-encoding:\s*quoted-printable/i.test(head)) {
		const bytes = body
			.replace(/=\r?\n/g, '')
			.replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
		return Buffer.from(bytes, 'latin1').toString('utf8');
	}
	return body;
}

function decodeMimeWord(value: string): string {
	return value.replace(/=\?utf-8\?b\?([^?]+)\?=/gi, (_, b64: string) =>
		Buffer.from(b64, 'base64').toString('utf8'),
	);
}
