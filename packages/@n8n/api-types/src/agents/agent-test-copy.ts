/**
 * Test copies (prototype, behind the `N8N_ENV_FEAT_AGENT_TEST_COPIES` flag).
 *
 * A test chat runs its tool calls against a temporary copy of the apps.
 * Reads return the copied data plus the changes of this test. Writes stay in
 * the copy. These types describe what the test pane shows about those writes.
 */

export type AgentTestChangeKind = 'email' | 'message' | 'row' | 'record' | 'other';

export interface AgentTestChangeEmail {
	from?: string;
	to: string[];
	cc?: string[];
	subject: string;
	body: string;
}

export interface AgentTestChangeMessage {
	/** Channel name without `#`, or a direct message label. */
	channel: string;
	text: string;
	/** Set when the message is a reply in a thread. */
	inThread?: boolean;
	senderName?: string;
}

export interface AgentTestChangeRow {
	sheet: string;
	columns: string[];
	values: string[];
	/** A few rows above the new row, so the row shows in context. */
	contextRows: string[][];
}

export interface AgentTestChangeRecordField {
	name: string;
	before: string | null;
	after: string | null;
}

export interface AgentTestChangeRecord {
	object: string;
	label: string;
	fields: AgentTestChangeRecordField[];
}

export interface AgentTestChangeOther {
	method: string;
	url: string;
	body?: unknown;
}

export interface AgentTestChange {
	id: string;
	/** The tool call that made the change. Missing for a reply that the channel posted. */
	toolCallId?: string;
	toolName?: string;
	/** Display name of the app, for example `Gmail`. */
	app: string;
	/** Stable key of the app, used for icons. */
	appKey: 'gmail' | 'slack' | 'googleSheets' | 'hubspot' | 'shopify' | 'other';
	kind: AgentTestChangeKind;
	/** `notSent` for emails and messages, `notSaved` for data. */
	status: 'notSent' | 'notSaved';
	/** One line, for example `Email to dana.lee@example.com`. */
	title: string;
	createdAt: string;
	/** Set once the builder carried this change out in the real app (Send now / Save now). */
	appliedAt?: string;
	email?: AgentTestChangeEmail;
	message?: AgentTestChangeMessage;
	row?: AgentTestChangeRow;
	record?: AgentTestChangeRecord;
	other?: AgentTestChangeOther;
}

export interface AgentTestChangesResponse {
	changes: AgentTestChange[];
}

/** A place where a builder can send a test message from, other than the chat. */
export interface AgentTestChannel {
	type: 'slack';
	/** For example `#support`. */
	label: string;
	/** Name of the person the message comes from in the copy. */
	senderName: string;
}

export interface AgentTestCopyInfo {
	enabled: boolean;
	/** Tools that cannot run in a test copy. They are skipped during the run. */
	unsupportedTools: Array<{ name: string }>;
	channels: AgentTestChannel[];
}

/** Sent as `clientContext.testChannel` with a chat message. */
export interface AgentTestChannelContext {
	type: 'slack';
	label: string;
}

/** A message the builder can try first. Written from the agent's job and the records in the copy. */
export interface AgentTestSuggestion {
	text: string;
	/** A short, plain description of the situation, shown in place of the full text. */
	title?: string;
	/** Set when the message comes from a channel; missing means the chat. */
	channel?: AgentTestChannelContext;
}

export interface AgentTestSuggestionsResponse {
	suggestions: AgentTestSuggestion[];
}

/**
 * A message the builder sent from a channel is stored with a first line that
 * gives the agent the channel context. The test pane reads it back to show the
 * message as it looked in the channel, also after a reload.
 */
const TEST_CHANNEL_LINE =
	/^\[Slack message in (#[\w-]+) from ([^\].]+)\. Your reply is posted in its thread\.\]\n/;

export function formatTestChannelMessage(label: string, senderName: string, text: string): string {
	return `[Slack message in ${label} from ${senderName}. Your reply is posted in its thread.]\n${text}`;
}

export function parseTestChannelMessage(
	message: string,
): { label: string; senderName: string; text: string } | undefined {
	const match = TEST_CHANNEL_LINE.exec(message);
	if (!match) return undefined;
	return { label: match[1], senderName: match[2], text: message.slice(match[0].length) };
}
