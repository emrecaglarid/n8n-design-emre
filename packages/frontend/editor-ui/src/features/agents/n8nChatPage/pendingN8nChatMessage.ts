/**
 * Hand-off for the first message of a new n8n Chat agent conversation. The n8n
 * Assistant page's "Chat with" picker stores it here before navigating to the
 * agent's page, which consumes it once its chat panel is ready to send.
 *
 * Module-level state, not a store: it only ever bridges one navigation, never
 * persists, and never has more than one reader.
 */
export interface PendingN8nChatMessage {
	agentId: string;
	text: string;
	files: File[];
}

let pending: PendingN8nChatMessage | undefined;

export function stashPendingN8nChatMessage(message: PendingN8nChatMessage): void {
	pending = message;
}

/**
 * One-shot read: always clears the stored hand-off, even for a mismatched
 * `agentId`, so a stale message never reaches a later visit to a different agent.
 */
export function consumePendingN8nChatMessage(agentId: string): PendingN8nChatMessage | undefined {
	const message = pending;
	pending = undefined;
	return message?.agentId === agentId ? message : undefined;
}

/**
 * Clears the slot only if it still holds this exact message. Use this to back
 * out of a stash after a failed hand-off: a later stash may already have
 * replaced it, and that later one must survive.
 */
export function discardPendingN8nChatMessage(message: PendingN8nChatMessage): boolean {
	if (pending !== message) return false;
	pending = undefined;
	return true;
}

/**
 * Prefill for the composer of a new n8n Chat conversation, from the test pane's
 * "Open in n8n Chat". Unlike the message above, it is never sent: the builder
 * reviews it and sends it themselves.
 */
export interface PendingN8nChatPrefill {
	agentId: string;
	text: string;
}

let pendingPrefill: PendingN8nChatPrefill | undefined;

export function stashPendingN8nChatPrefill(prefill: PendingN8nChatPrefill): void {
	pendingPrefill = prefill;
}

/**
 * Reads the prefill without clearing it: the route can create the view more
 * than once for one visit, so it is cleared only once a composer shows it
 * ({@link clearPendingN8nChatPrefill}). A prefill for another agent is dropped.
 */
export function consumePendingN8nChatPrefill(agentId: string): PendingN8nChatPrefill | undefined {
	if (pendingPrefill && pendingPrefill.agentId !== agentId) pendingPrefill = undefined;
	return pendingPrefill;
}

export function clearPendingN8nChatPrefill(): void {
	pendingPrefill = undefined;
}
