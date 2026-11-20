import type {
	AgentJsonConfig,
	AgentTestChange,
	AgentTestChannelContext,
	AgentTestCopyInfo,
	AgentTestSuggestion,
} from '@n8n/api-types';
import { formatTestChannelMessage, parseTestChannelMessage } from '@n8n/api-types';
import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { INode, IHttpRequestOptions, IWorkflowExecuteAdditionalData } from 'n8n-workflow';
import { UserError } from 'n8n-workflow';
import { createHash, randomUUID } from 'node:crypto';

import { GymAdminClient } from './gym-admin.client';
import { describeWrite, isWrite, parseBody, type WriteContext } from './test-copy-changes';
import { TestCopyCredentialsHelper } from './test-copy-credentials-helper';
import { buildSuggestionPrompt, parseSuggestions, summarizeRecords } from './test-copy-suggestions';

/**
 * Prototype: each test chat (thread) runs its tool calls against its own
 * temporary copy of the apps, held by the AI gym. The copy starts from a source
 * account (a gym tenant that stands in for the builder's real apps). Reads see
 * the copy, writes stay in it, and every write is listed as a change.
 *
 * Everything here is in memory and single-main only. See working/notes.md.
 */

interface TestCopy {
	threadId: string;
	tenant: string;
	/** The copy's own shop subdomain, so a replay can point back at the source's. */
	subdomain: string;
	createdAt: number;
	/** Credential type to the data the copy issued for it. */
	credentials: Map<string, Record<string, unknown>>;
	slackChannels?: Map<string, string>;
	/** The ts of the last inbound channel message, so a reply lands in its thread. */
	lastInbound?: { channel: string; ts: string };
}

const COPY_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface Replay {
	method: string;
	url: string;
	body: unknown;
	/** The credential type whose account carries the change out. */
	type: string;
}

/** Which credential carries out a request, by the app it goes to. */
function credentialTypeFor(url: URL): string | undefined {
	const host = url.hostname;
	if (/\/gmail\/v1\//.test(url.pathname)) return 'gmailOAuth2';
	if (host === 'sheets.googleapis.com') return 'googleSheetsOAuth2Api';
	if (host === 'slack.com') return 'slackApi';
	if (/hubapi\.com$/.test(host)) return 'hubspotAppToken';
	if (host.endsWith('.myshopify.com')) return 'shopifyAccessTokenApi';
	return undefined;
}

/** Gets a new access token with the credential's refresh token. Not written back (prototype). */
async function refreshAccessToken(data: Record<string, unknown>): Promise<string | undefined> {
	const oauth = data.oauthTokenData as { refresh_token?: unknown } | undefined;
	const refreshToken = oauth?.refresh_token;
	if (typeof refreshToken !== 'string') return undefined;
	const tokenUrl =
		typeof data.accessTokenUrl === 'string'
			? data.accessTokenUrl
			: 'https://oauth2.googleapis.com/token';
	const res = await fetch(tokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: String(data.clientId ?? ''),
			client_secret: String(data.clientSecret ?? ''),
		}).toString(),
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) return undefined;
	const json = (await res.json()) as { access_token?: unknown };
	return typeof json.access_token === 'string' ? json.access_token : undefined;
}

/** The token a credential sends with each request. */
function bearerOf(data: Record<string, unknown>): string | undefined {
	const oauth = data.oauthTokenData as { access_token?: unknown } | undefined;
	const value = oauth?.access_token ?? data.accessToken ?? data.appToken ?? data.apiToken;
	return typeof value === 'string' ? value : undefined;
}

/** Credentials that a service does not issue by default, as [service, gym credential id]. */
const EXTRA_CREDENTIALS: Array<[string, string]> = [['shopify', 'access_token']];

/** The secret token values in a credential, at any depth. */
function tokenValues(data: unknown): string[] {
	if (!data || typeof data !== 'object') return [];
	return Object.entries(data as Record<string, unknown>).flatMap(([key, value]) =>
		typeof value === 'string'
			? /token/i.test(key) && value.length > 8
				? [value]
				: []
			: tokenValues(value),
	);
}

/** Credential types whose apps the copy covers. Other node tools can't run in a test. */
const SERVICE_FOR_CREDENTIAL: Record<string, string> = {
	gmailOAuth2: 'gmail',
	googleSheetsOAuth2Api: 'google-sheets',
	googleCalendarOAuth2Api: 'google-calendar',
	slackApi: 'slack',
	slackOAuth2Api: 'slack',
	hubspotAppToken: 'hubspot',
	hubspotOAuth2Api: 'hubspot',
	notionApi: 'notion',
	shopifyAccessTokenApi: 'shopify',
	shopifyOAuth2Api: 'shopify',
	zendeskApi: 'zendesk',
	linearApi: 'linear',
};

@Service()
export class TestCopyService {
	readonly enabled = process.env.N8N_ENV_FEAT_AGENT_TEST_COPIES === 'true';

	private readonly gym = new GymAdminClient(
		process.env.AGENT_TEST_COPIES_GYM_ADMIN_URL ?? 'http://127.0.0.1:19090',
		process.env.AGENT_TEST_COPIES_GYM_TOKEN ?? 'harness',
	);

	private readonly sourceTenant = process.env.AGENT_TEST_COPIES_SOURCE_TENANT ?? 'harborpine';

	private readonly account = process.env.AGENT_TEST_COPIES_ACCOUNT ?? 'riley@harborpine.test';

	private readonly senderName = process.env.AGENT_TEST_COPIES_SENDER_NAME ?? 'Riley Chen';

	private readonly slackChannelLabel = process.env.AGENT_TEST_COPIES_SLACK_CHANNEL ?? '#support';

	private readonly gymHostPatterns = (process.env.GYM_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);

	private readonly copies = new Map<string, Promise<TestCopy>>();

	private readonly changes = new Map<string, AgentTestChange[]>();

	/** The exact request behind each change, so the builder can carry it out for real. */
	private readonly replays = new Map<string, Replay>();

	/** Threads that are test chats. A tool call in one of them never runs without its copy. */
	private readonly testThreads = new Set<string>();

	private readonly pendingChannel = new Map<string, AgentTestChannelContext>();

	constructor(private readonly logger: Logger) {
		if (this.enabled) {
			setInterval(() => void this.reap(), 60 * 60 * 1000).unref();
		}
	}

	isTestThread(threadId: string | undefined): threadId is string {
		return this.enabled && !!threadId && this.testThreads.has(threadId);
	}

	/** Marks a thread as a test chat and makes its copy. Throws when the copy can't be made. */
	async startTurn(threadId: string): Promise<void> {
		if (!this.enabled) return;
		this.testThreads.add(threadId);
		await this.ensureCopy(threadId);
	}

	private async ensureCopy(threadId: string): Promise<TestCopy> {
		let copy = this.copies.get(threadId);
		if (!copy) {
			copy = this.createCopy(threadId);
			this.copies.set(threadId, copy);
			copy.catch(() => this.copies.delete(threadId));
		}
		return await copy;
	}

	private async createCopy(threadId: string): Promise<TestCopy> {
		const started = Date.now();
		const tenant = `tc-${threadId.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`.slice(0, 63);
		const snapshot = await this.gym.exportSnapshot(this.sourceTenant);
		// A fork must not carry the source's tokens: the gym picks the tenant by token.
		// The subdomain index stays, renamed: Shopify and Zendesk pick the shop by subdomain.
		const subdomain = `c${threadId
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.slice(0, 12)}`;
		snapshot.creds = snapshot.creds
			.filter((c) => (c as { kind?: string }).kind === 'index:subdomain')
			.map((c) => ({ ...(c as object), value: subdomain }));
		snapshot.events = [];
		snapshot.meta = { ...snapshot.meta, admin_token: `${tenant}-${randomUUID()}` };
		// Tokens are derived from the seed: a seed of its own gives the copy tokens of its own.
		snapshot.ids = { ...(snapshot.ids as object), seed: tenant };
		// Records keep the id of the tenant they belong to (Sheets checks it on every read).
		const src = this.sourceTenant;
		const forked = JSON.parse(
			JSON.stringify({ ...snapshot, tenant })
				.replaceAll(`"tenant":"${src}"`, `"tenant":"${tenant}"`)
				.replaceAll(`"subdomain":"${src}"`, `"subdomain":"${subdomain}"`)
				.replaceAll(`"domain":"${src}"`, `"domain":"${subdomain}"`)
				.replaceAll(`${src}.myshopify.com`, `${subdomain}.myshopify.com`)
				.replaceAll(`${src}.zendesk.com`, `${subdomain}.zendesk.com`),
		) as typeof snapshot;
		await this.gym.importSnapshot(tenant, forked);

		const credentials = new Map<string, Record<string, unknown>>();
		const issue = async (service: string, credential?: string) => {
			try {
				const issued = await this.gym.issueCredential(tenant, service, this.account, credential);
				if (issued) credentials.set(issued.type, issued.data);
			} catch (error) {
				this.logger.debug(`[test-copy] no credential for ${service}`, { error });
			}
		};
		for (const service of snapshot.meta.services ?? []) await issue(service);
		for (const [service, credential] of EXTRA_CREDENTIALS) await issue(service, credential);

		// Fail closed: a credential that shares a token with the source would reach the source.
		const source = await this.gym.getTenant(this.sourceTenant);
		const sourceTokens = new Set(
			Object.values(source.n8n_credentials ?? {}).flatMap((data) => tokenValues(data)),
		);
		for (const [type, data] of credentials) {
			if (tokenValues(data).some((t) => sourceTokens.has(t))) {
				this.logger.warn(`[test-copy] dropped ${type}: it shares a token with the source`);
				credentials.delete(type);
			}
		}
		this.logger.info(
			`[test-copy] made ${tenant} in ${Date.now() - started} ms with ${[...credentials.keys()].join(', ')}`,
		);
		return { threadId, tenant, subdomain, createdAt: Date.now(), credentials };
	}

	async discard(threadId: string): Promise<void> {
		const copy = this.copies.get(threadId);
		this.copies.delete(threadId);
		if (!copy) return;
		try {
			await this.gym.deleteTenant((await copy).tenant);
		} catch (error) {
			this.logger.warn('[test-copy] could not delete a copy', { error });
		}
	}

	private async reap(): Promise<void> {
		for (const [threadId, copy] of this.copies) {
			const c = await copy.catch(() => undefined);
			if (c && Date.now() - c.createdAt > COPY_LIFETIME_MS) await this.discard(threadId);
		}
	}

	listChanges(threadId: string): AgentTestChange[] {
		return [...(this.changes.get(threadId) ?? [])].reverse();
	}

	private addChange(threadId: string, change: AgentTestChange): boolean {
		const list = this.changes.get(threadId) ?? [];
		// The request hook can see one request twice (auth retry, helper layers): keep one change.
		const key = (c: AgentTestChange) =>
			JSON.stringify([c.toolCallId, c.title, c.email, c.message, c.row, c.record, c.other]);
		if (change.toolCallId && list.some((c) => key(c) === key(change))) return false;
		list.push(change);
		this.changes.set(threadId, list);
		return true;
	}

	/** A tool call failed, so its writes did not happen. */
	dropChangesOf(threadId: string, toolCallId: string | undefined): void {
		if (!toolCallId) return;
		const list = this.changes.get(threadId);
		if (list)
			this.changes.set(
				threadId,
				list.filter((c) => c.toolCallId !== toolCallId),
			);
	}

	/**
	 * Returns the decorator for one node-tool call in a test chat, or undefined
	 * for any other run. The decorator swaps in the copy's credentials and
	 * watches every request the node sends.
	 */
	async toolConfigurator(
		threadId: string | undefined,
		toolCallId: string | undefined,
		toolName: string,
	): Promise<((additionalData: IWorkflowExecuteAdditionalData) => void) | undefined> {
		if (!this.isTestThread(threadId)) return undefined;
		const copy = await this.ensureCopy(threadId);
		return (additionalData) => {
			additionalData.credentialsHelper = new TestCopyCredentialsHelper(
				additionalData.credentialsHelper,
				copy.credentials,
			);
			const previous = additionalData.evalLlmMockHandler;
			additionalData.evalLlmMockHandler = async (requestOptions, node) => {
				await this.onRequest(copy, requestOptions, node, toolCallId, toolName);
				return previous ? await previous(requestOptions, node) : undefined;
			};
		};
	}

	/** Blocks hosts the copy does not cover and records writes. Returns nothing, so the request goes on to the copy. */
	private async onRequest(
		copy: TestCopy,
		requestOptions: IHttpRequestOptions,
		node: INode,
		toolCallId: string | undefined,
		toolName: string,
	): Promise<void> {
		const url = resolveUrl(requestOptions);
		if (!url || !this.coversHost(url.hostname)) {
			throw new UserError(
				`${node.name} can't run in a test: ${url?.hostname ?? 'this app'} has no test copy`,
			);
		}
		const method = (requestOptions.method ?? 'GET').toUpperCase();
		if (!isWrite(method, url)) return;
		const write = { method, url, body: requestOptions.body, toolCallId, toolName };
		const context = await this.contextFor(copy, write.url, write.body).catch((error: unknown) => {
			this.logger.debug('[test-copy] no context for a change', { error });
			return {};
		});
		const change = describeWrite(write, context);
		if (!change || !this.addChange(copy.threadId, change)) return;
		const replayUrl = new URL(url);
		for (const [k, v] of Object.entries(requestOptions.qs ?? {})) {
			if (v !== undefined && v !== null) replayUrl.searchParams.set(k, String(v));
		}
		replayUrl.hostname = replayUrl.hostname.replace(copy.subdomain, this.sourceTenant);
		const type = credentialTypeFor(replayUrl);
		if (type)
			this.replays.set(change.id, {
				method,
				url: replayUrl.toString(),
				body: requestOptions.body,
				type,
			});
	}

	/**
	 * Carries out one change for real: the same request the agent made, sent to the
	 * source account with its own credential. In this prototype the source account
	 * stands in for the builder's real apps.
	 */
	async applyChange(
		threadId: string,
		changeId: string,
		resolveCredential: (
			toolName: string | undefined,
			type: string,
		) => Promise<Record<string, unknown> | undefined>,
	): Promise<AgentTestChange> {
		const change = this.changes.get(threadId)?.find((c) => c.id === changeId);
		const replay = this.replays.get(changeId);
		if (!change || !replay) throw new UserError('This change can no longer be carried out');
		if (change.appliedAt) return change;
		// The builder's own credential, the one the tool is set up with.
		const credential = await resolveCredential(change.toolName, replay.type);
		const token = credential ? bearerOf(credential) : undefined;
		if (!token) throw new UserError(`No ${replay.type} account to carry this change out with`);
		const isForm = typeof replay.body === 'string' && !replay.body.trim().startsWith('{');
		const headers: Record<string, string> = {
			'content-type': isForm
				? 'application/x-www-form-urlencoded'
				: 'application/json; charset=utf-8',
			...(replay.type.startsWith('shopify')
				? { 'x-shopify-access-token': token }
				: { authorization: `Bearer ${token}` }),
		};
		const send = async (bearer: string) =>
			await fetch(replay.url, {
				method: replay.method,
				headers: replay.type.startsWith('shopify')
					? { ...headers, 'x-shopify-access-token': bearer }
					: { ...headers, authorization: `Bearer ${bearer}` },
				body:
					replay.body === undefined
						? undefined
						: typeof replay.body === 'string'
							? replay.body
							: JSON.stringify(replay.body),
				signal: AbortSignal.timeout(20_000),
			});
		let res = await send(token);
		// A stored OAuth token may have expired: refresh it once, like n8n does before a node call.
		if (res.status === 401 && credential) {
			const fresh = await refreshAccessToken(credential).catch(() => undefined);
			if (fresh) res = await send(fresh);
		}
		const text = await res.text();
		const slackFailed = /"ok":\s*false/.test(text) && replay.url.includes('slack.com');
		if (!res.ok || slackFailed) {
			this.logger.warn('[test-copy] could not carry out a change', {
				status: res.status,
				body: text.slice(0, 300),
			});
			throw new UserError(`${change.app} did not accept it (${res.status})`);
		}
		change.appliedAt = new Date().toISOString();
		return change;
	}

	coversHost(hostname: string): boolean {
		const host = hostname.toLowerCase();
		return this.gymHostPatterns.some((p) =>
			p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p,
		);
	}

	private async contextFor(copy: TestCopy, url: URL, rawBody: unknown): Promise<WriteContext> {
		if (url.hostname === 'slack.com') {
			return { slackChannels: await this.slackChannels(copy) };
		}
		if (url.hostname === 'sheets.googleapis.com') {
			const id = /\/spreadsheets\/([^/]+)/.exec(url.pathname)?.[1];
			const range = decodeURIComponent(url.pathname.split('/values/')[1] ?? '').split(':')[0];
			const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
			const state = await this.gym.getState<{
				spreadsheets: Array<{
					spreadsheetId: string;
					title: string;
					sheets: Array<{ title: string; formatted: string[][] }>;
				}>;
			}>(copy.tenant, 'google-sheets');
			const doc = state.spreadsheets.find((s) => s.spreadsheetId === id);
			const sheet = doc?.sheets.find((s) => s.title === sheetName) ?? doc?.sheets[0];
			return { sheetRows: sheet?.formatted, sheetTitle: doc?.title ?? sheet?.title };
		}
		if (/hubapi\.com$/.test(url.hostname)) {
			const body = parseBody(rawBody);
			const byId = /\/contacts\/(\d+)/.exec(url.pathname)?.[1];
			const byEmail = /\/email\/([^/]+)/.exec(url.pathname)?.[1];
			const email = byEmail ? decodeURIComponent(byEmail) : undefined;
			const state = await this.gym.getState<{
				objects: { contacts: Array<{ id: string; properties: Record<string, string> }> };
			}>(copy.tenant, 'hubspot');
			const contact = state.objects.contacts.find(
				(c) => c.id === byId || (email && c.properties.email === email),
			);
			const p = contact?.properties;
			const label = p
				? [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email
				: (email ?? (typeof body.email === 'string' ? body.email : undefined));
			return { hubspotBefore: p, hubspotLabel: label };
		}
		return {};
	}

	private async slackChannels(copy: TestCopy): Promise<Map<string, string>> {
		if (!copy.slackChannels) {
			const state = await this.gym.getState<{ channels: Array<{ id: string; name: string }> }>(
				copy.tenant,
				'slack',
			);
			copy.slackChannels = new Map(state.channels.map((c) => [c.id, c.name]));
		}
		return copy.slackChannels;
	}

	/** Agent info for the test pane: which tools can't run, and which channels a test can start from. */
	describe(config: AgentJsonConfig): AgentTestCopyInfo {
		if (!this.enabled) return { enabled: false, unsupportedTools: [], channels: [] };
		const unsupported: Array<{ name: string }> = [];
		let usesSlack = false;
		for (const tool of config.tools ?? []) {
			if (tool.type !== 'node') {
				unsupported.push({ name: tool.type === 'custom' ? tool.id : (tool.name ?? tool.type) });
				continue;
			}
			const types = Object.keys(tool.node.credentials ?? {});
			if (types.some((t) => t.startsWith('slack'))) usesSlack = true;
			if (types.length === 0 || types.some((t) => !SERVICE_FOR_CREDENTIAL[t])) {
				unsupported.push({ name: tool.name });
			}
		}
		const hasSlackIntegration = JSON.stringify(config).includes('"slack"');
		return {
			enabled: true,
			unsupportedTools: unsupported,
			channels:
				usesSlack || hasSlackIntegration
					? [{ type: 'slack', label: this.slackChannelLabel, senderName: this.senderName }]
					: [],
		};
	}

	private readonly suggestionCache = new Map<string, Promise<AgentTestSuggestion[]>>();

	/**
	 * First messages a builder can try, written by the agent's own model from its
	 * instructions and the records it can reach. Cached per agent config.
	 */
	async suggest(
		config: AgentJsonConfig,
		generate: (prompt: string) => Promise<string>,
	): Promise<AgentTestSuggestion[]> {
		if (!this.enabled) return [];
		const key = createHash('sha256').update(JSON.stringify(config)).digest('hex');
		let cached = this.suggestionCache.get(key);
		if (!cached) {
			cached = (async () => {
				const services = new Set<string>();
				for (const tool of config.tools ?? []) {
					if (tool.type !== 'node') continue;
					for (const type of Object.keys(tool.node.credentials ?? {})) {
						const service = SERVICE_FOR_CREDENTIAL[type];
						if (service) services.add(service);
					}
				}
				const records = await summarizeRecords(
					this.gym,
					this.sourceTenant,
					[...services],
					this.account,
				);
				const { channels } = this.describe(config);
				const text = await generate(buildSuggestionPrompt(config, records, channels));
				return parseSuggestions(text, channels);
			})();
			this.suggestionCache.set(key, cached);
			cached.catch(() => this.suggestionCache.delete(key));
		}
		return await cached;
	}

	/** Remembers that the next turn of a thread comes from a channel, not the chat. */
	setPendingChannel(threadId: string, channel: AgentTestChannelContext | undefined): void {
		if (channel) this.pendingChannel.set(threadId, channel);
		else this.pendingChannel.delete(threadId);
	}

	/**
	 * Puts the builder's message into the copy's channel, as the builder, and
	 * returns the message the agent gets, with the context a channel run gives.
	 */
	/** The stored form of a channel message: one context line, then the text. */
	formatChannelMessage(channel: AgentTestChannelContext, text: string): string {
		if (!this.enabled) return text;
		return formatTestChannelMessage(channel.label, this.senderName, text);
	}

	async deliverChannelMessage(threadId: string, message: string): Promise<string> {
		const channel = this.pendingChannel.get(threadId);
		if (!channel) return message;
		const copy = await this.ensureCopy(threadId);
		const name = channel.label.replace(/^#/, '');
		const parsed = parseTestChannelMessage(message);
		const text = parsed?.text ?? message;
		const [result] = await this.gym
			.postEvents(copy.tenant, [
				{
					service: 'slack',
					type: 'post_message',
					// Follow-ups go into the thread the first message started, as in Slack.
					params: {
						as: this.account,
						channel: name,
						text,
						...(copy.lastInbound?.channel === name ? { thread_ts: copy.lastInbound.ts } : {}),
					},
				},
			])
			.catch((error: unknown) => {
				this.logger.warn('[test-copy] could not put the message in the channel', { error });
				return [];
			});
		if (result?.ts && !copy.lastInbound)
			copy.lastInbound = { channel: name, ts: String(result.ts) };
		return parsed ? message : this.formatChannelMessage(channel, message);
	}

	/** After a channel turn, the agent's reply goes to the channel thread in the copy. */
	async deliverChannelReply(threadId: string, reply: string): Promise<void> {
		const channel = this.pendingChannel.get(threadId);
		this.pendingChannel.delete(threadId);
		if (!channel || !reply.trim()) return;
		const copy = await this.ensureCopy(threadId);
		const name = channel.label.replace(/^#/, '');
		await this.gym
			.postEvents(copy.tenant, [
				{
					service: 'slack',
					type: 'post_message',
					params: { as: 'bot', channel: name, text: reply, thread_ts: copy.lastInbound?.ts },
				},
			])
			.catch((error: unknown) => {
				this.logger.warn('[test-copy] could not post the reply in the channel', { error });
			});
		const id = randomUUID();
		// "Send now" posts the reply in the real channel (the real thread does not exist in this prototype).
		this.replays.set(id, {
			method: 'POST',
			url: 'https://slack.com/api/chat.postMessage',
			body: { channel: name, text: reply },
			type: 'slackApi',
		});
		this.addChange(threadId, {
			id,
			app: 'Slack',
			appKey: 'slack',
			kind: 'message',
			status: 'notSent',
			title: `Reply in #${name}`,
			createdAt: new Date().toISOString(),
			message: { channel: name, text: reply, inThread: true },
		});
	}
}

function resolveUrl(options: IHttpRequestOptions): URL | undefined {
	const raw = options.url ?? (options as { uri?: string }).uri;
	if (!raw) return undefined;
	try {
		return new URL(raw, options.baseURL);
	} catch {
		return undefined;
	}
}
