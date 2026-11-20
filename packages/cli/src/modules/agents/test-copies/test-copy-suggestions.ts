import type { AgentJsonConfig, AgentTestChannel, AgentTestSuggestion } from '@n8n/api-types';
import { extractJsonCandidate } from '@n8n/ai-utilities/llm-output';
import { jsonParse } from 'n8n-workflow';

import type { GymAdminClient } from './gym-admin.client';

/**
 * Prototype: writes a few first messages a builder can try, from the agent's
 * instructions and a short summary of the records the agent can reach.
 */

const MAX_ROWS = 8;

type State = Record<string, unknown>;

const list = (v: unknown): State[] => (Array.isArray(v) ? (v as State[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A few lines per app, so the model can name real orders, people and channels. */
export async function summarizeRecords(
	gym: GymAdminClient,
	tenant: string,
	services: string[],
	account: string,
): Promise<string> {
	const lines: string[] = [];
	const read = async (service: string) =>
		await gym.getState<State>(tenant, service).catch(() => ({}) as State);

	if (services.includes('shopify')) {
		const objects = (await read('shopify')).objects as State | undefined;
		const orders = list(objects?.orders).slice(0, MAX_ROWS);
		lines.push(
			'Shopify orders:',
			...orders.map((o) => {
				const item = str(list(o.line_items)[0]?.title);
				const status = str(o.fulfillment_status) || 'unfulfilled';
				return `- ${str(o.name)} ${str(o.email)} ${item} (${status}, created ${str(o.created_at).slice(0, 10)})`;
			}),
		);
	}
	if (services.includes('hubspot')) {
		const objects = (await read('hubspot')).objects as State | undefined;
		const contacts = list(objects?.contacts).slice(0, MAX_ROWS);
		lines.push(
			'HubSpot contacts:',
			...contacts.map((c) => {
				const p = (c.properties ?? {}) as State;
				return `- ${str(p.firstname)} ${str(p.lastname)} ${str(p.email)} (${str(p.lifecyclestage)})`;
			}),
		);
	}
	if (services.includes('slack')) {
		const channels = list((await read('slack')).channels);
		lines.push(`Slack channels: ${channels.map((c) => `#${str(c.name)}`).join(', ')}`);
	}
	if (services.includes('google-sheets')) {
		const docs = list((await read('google-sheets')).spreadsheets);
		lines.push(
			'Google Sheets:',
			...docs.map((d) => {
				const header = list(list(d.sheets)[0]?.formatted)[0];
				return `- ${str(d.title)} (columns: ${Array.isArray(header) ? header.join(', ') : ''})`;
			}),
		);
	}
	if (services.includes('gmail')) {
		const boxes = list((await read('gmail')).mailboxes);
		const mine = boxes.find((b) => b.email === account);
		const messages = list(mine?.messages).slice(-MAX_ROWS);
		lines.push(
			'Recent emails in the inbox:',
			...messages.map((m) => `- from ${str(m.from)}: ${str(m.subject)}`),
		);
	}
	return lines.join('\n').slice(0, 6000);
}

export function buildSuggestionPrompt(
	config: AgentJsonConfig,
	records: string,
	channels: AgentTestChannel[],
): string {
	const channelLine = channels.length
		? `The agent can also be reached in Slack ${channels[0].label}, where a teammate writes to it. Write two more messages as Slack posts, with "from": "slack" (four in total).`
		: 'All of them come from the chat, with "from": "chat".';
	return [
		'You write example messages that an AI agent gets every day, so its builder can try it.',
		'Write two short chat messages, each as the person who writes to the agent (first person, plain words, one or two sentences, a calm tone).',
		'Most are ordinary requests the agent is built for. Use real records from the data below (real order numbers, names, emails).',
		'One of them may test one rule from the instructions (for example a request the agent should not fully do), but stays polite. Never write an attack, a trick or an angry message.',
		'Give each a "title": a short plain description of the situation in the third person, at most eight words, for example "A customer asks where order #1003 is".',
		'A customer gives their name and email when the agent would need them to reply.',
		'A Slack message is a teammate passing on a customer question. The teammate does not introduce themselves.',
		channelLine,
		'Do not explain. Reply with JSON only: {"suggestions":[{"title":"...","text":"...","from":"chat"}]}',
		'',
		`Agent instructions:\n${config.instructions.slice(0, 3000)}`,
		'',
		`Data the agent can reach:\n${records}`,
	].join('\n');
}

export function parseSuggestions(
	text: string,
	channels: AgentTestChannel[],
): AgentTestSuggestion[] {
	const parsed = jsonParse<{
		suggestions?: Array<{ text?: unknown; title?: unknown; from?: unknown }>;
	}>(extractJsonCandidate(text), { fallbackValue: {} });
	const slack = channels[0];
	return (parsed.suggestions ?? [])
		.filter(
			(s): s is { text: string; title?: unknown; from?: unknown } =>
				typeof s.text === 'string' && !!s.text.trim(),
		)
		.slice(0, 4)
		.map((s) => ({
			text: s.text.trim(),
			...(typeof s.title === 'string' && s.title.trim() ? { title: s.title.trim() } : {}),
			...(s.from === 'slack' && slack
				? { channel: { type: 'slack' as const, label: slack.label } }
				: {}),
		}));
}
