import { parseTestChannelMessage, type AgentTestChange } from '@n8n/api-types';

export type AgentTestChangeAppKey = AgentTestChange['appKey'];

/** Node types that give each app its icon. */
export const TEST_COPY_APP_NODE_TYPES: Record<AgentTestChangeAppKey, string | undefined> = {
	gmail: 'n8n-nodes-base.gmail',
	slack: 'n8n-nodes-base.slack',
	googleSheets: 'n8n-nodes-base.googleSheets',
	hubspot: 'n8n-nodes-base.hubspot',
	shopify: 'n8n-nodes-base.shopify',
	other: undefined,
};

export interface AgentTestChangeGroup {
	key: string;
	app: string;
	appKey: AgentTestChangeAppKey;
	changes: AgentTestChange[];
}

function timeOf(change: AgentTestChange): number {
	const time = Date.parse(change.createdAt);
	return Number.isNaN(time) ? 0 : time;
}

/** Newest first. Changes with the same time keep the reverse server order. */
export function sortChangesNewestFirst(changes: AgentTestChange[]): AgentTestChange[] {
	return changes
		.map((change, index) => ({ change, index }))
		.sort((a, b) => timeOf(b.change) - timeOf(a.change) || b.index - a.index)
		.map(({ change }) => change);
}

/** Groups by app. The group with the newest change comes first. */
export function groupChangesByApp(changes: AgentTestChange[]): AgentTestChangeGroup[] {
	const groups = new Map<string, AgentTestChangeGroup>();
	for (const change of sortChangesNewestFirst(changes)) {
		const key = `${change.appKey}:${change.app}`;
		let group = groups.get(key);
		if (!group) {
			group = { key, app: change.app, appKey: change.appKey, changes: [] };
			groups.set(key, group);
		}
		group.changes.push(change);
	}
	return [...groups.values()];
}

export interface TestChannelSend {
	text: string;
	label: string;
	senderName: string;
}

/**
 * Matches the messages that were sent from a channel to the user messages of the
 * chat, in order and by text. The chat does not keep the channel of a message.
 */
export function assignChannelSends(
	userMessages: Array<{ id: string; text: string }>,
	sends: TestChannelSend[],
): Map<string, TestChannelSend> {
	const result = new Map<string, TestChannelSend>();
	let cursor = 0;
	for (const send of sends) {
		const text = send.text.trim();
		for (let i = cursor; i < userMessages.length; i++) {
			if (userMessages[i].text.trim() === text) {
				result.set(userMessages[i].id, send);
				cursor = i + 1;
				break;
			}
		}
	}
	return result;
}

/**
 * Finds the user messages that were sent from a channel, with the text to show.
 * The saved message carries a context line, which is the source of truth. A
 * message sent in this tab that is not saved yet falls back to the local record.
 */
export function getChannelMessages(
	userMessages: Array<{ id: string; text: string }>,
	localSends: TestChannelSend[],
): Map<string, TestChannelSend> {
	const result = new Map<string, TestChannelSend>();
	const unparsed: Array<{ id: string; text: string }> = [];
	for (const message of userMessages) {
		const parsed = parseTestChannelMessage(message.text);
		if (parsed) result.set(message.id, parsed);
		else unparsed.push(message);
	}
	for (const [id, send] of assignChannelSends(unparsed, localSends)) result.set(id, send);
	return result;
}

export interface TestCopyTurnItem {
	id: string;
	role: 'user' | 'assistant';
	toolCallIds: string[];
	/** Epoch ms when a user message was sent. */
	createdAt?: number;
	/** The assistant item shows reply text. */
	hasText?: boolean;
}

export interface TestCopyTurns {
	/** Tool writes of each turn, under the assistant item with its tool calls. */
	changes: Map<string, AgentTestChange[]>;
	/** The reply a turn posted in a channel thread, under the assistant item with its text. */
	replies: Map<string, AgentTestChange>;
}

function oldestFirst(changes: AgentTestChange[]): AgentTestChange[] {
	return [...sortChangesNewestFirst(changes)].reverse();
}

/**
 * Picks the turn of each channel reply: the last turn that started before the
 * reply. Without times, the n-th reply goes to the n-th channel turn.
 */
function assignReplies(
	turns: Array<{ createdAt?: number; isChannel: boolean }>,
	replies: AgentTestChange[],
): Map<number, AgentTestChange[]> {
	const result = new Map<number, AgentTestChange[]>();
	const add = (turn: number, reply: AgentTestChange) =>
		result.set(turn, [...(result.get(turn) ?? []), reply]);
	const channelTurns = turns.flatMap((turn, index) => (turn.isChannel ? [index] : []));

	replies.forEach((reply, replyIndex) => {
		const time = Date.parse(reply.createdAt);
		let turn = -1;
		if (!Number.isNaN(time)) {
			turn = turns.findLastIndex((item) => item.createdAt !== undefined && item.createdAt <= time);
		}
		if (turn < 0) turn = channelTurns[replyIndex] ?? -1;
		if (turn >= 0) add(turn, reply);
	});
	return result;
}

/**
 * Finds the changes of each turn and the assistant item that shows them: the
 * last one with tool calls, or else the last one. A turn starts with a user
 * message. A reply posted in a channel has no tool call, so it goes to the turn
 * it answered, apart from the tool writes.
 */
export function getTurnChanges(
	items: TestCopyTurnItem[],
	changes: AgentTestChange[],
	channelMessageIds: Set<string>,
): TestCopyTurns {
	const byToolCallId = new Map<string, AgentTestChange[]>();
	for (const change of changes) {
		if (!change.toolCallId) continue;
		byToolCallId.set(change.toolCallId, [...(byToolCallId.get(change.toolCallId) ?? []), change]);
	}

	const turns: Array<{ createdAt?: number; isChannel: boolean; assistant: TestCopyTurnItem[] }> =
		[];
	for (const item of items) {
		if (item.role === 'user') {
			turns.push({
				createdAt: item.createdAt,
				isChannel: channelMessageIds.has(item.id),
				assistant: [],
			});
		} else {
			turns.at(-1)?.assistant.push(item);
		}
	}

	const replies = assignReplies(turns, oldestFirst(changes.filter((change) => !change.toolCallId)));

	const result: TestCopyTurns = { changes: new Map(), replies: new Map() };
	turns.forEach((turn, index) => {
		const anchor =
			turn.assistant.findLast((item) => item.toolCallIds.length > 0) ?? turn.assistant.at(-1);
		if (!anchor) return;
		const turnChanges = turn.assistant.flatMap((item) =>
			item.toolCallIds.flatMap((id) => byToolCallId.get(id) ?? []),
		);
		if (turnChanges.length > 0) result.changes.set(anchor.id, oldestFirst(turnChanges));

		// The reply shows as the agent's message, so it is not one of the turn's changes.
		const reply = replies.get(index)?.at(-1);
		const textItem = turn.assistant.findLast((item) => item.hasText) ?? turn.assistant.at(-1);
		if (reply && textItem) result.replies.set(textItem.id, reply);
	});
	return result;
}

/** What the changes of one app are, so the count can name them. */
export type TestCopyCountNoun = 'email' | 'message' | 'row' | 'contact' | 'record' | 'change';

export function getCountNoun(changes: AgentTestChange[]): TestCopyCountNoun {
	const kinds = new Set(changes.map((change) => change.kind));
	if (kinds.size !== 1) return 'change';
	const [kind] = kinds;
	if (kind === 'email' || kind === 'message' || kind === 'row') return kind;
	if (kind === 'record') {
		const objects = new Set(changes.map((change) => change.record?.object.toLowerCase()));
		return objects.size === 1 && objects.has('contact') ? 'contact' : 'record';
	}
	return 'change';
}

export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
	return letters
		.map((part) => part.charAt(0).toUpperCase())
		.join('')
		.slice(0, 2);
}

export function formatTestCopyTime(time: string | number): string {
	const date = new Date(time);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Splits `**bold**` runs out of a message, so the text shows without the markers. */
export function splitBoldText(text: string): Array<{ text: string; bold: boolean }> {
	return text
		.split(/(\*\*[^*\n]+\*\*)/)
		.filter((part) => part.length > 0)
		.map((part) =>
			part.startsWith('**') && part.endsWith('**') && part.length > 4
				? { text: part.slice(2, -2), bold: true }
				: { text: part, bold: false },
		);
}
