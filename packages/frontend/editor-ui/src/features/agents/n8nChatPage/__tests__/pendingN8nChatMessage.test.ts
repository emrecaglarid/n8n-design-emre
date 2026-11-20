import {
	clearPendingN8nChatPrefill,
	stashPendingN8nChatMessage,
	consumePendingN8nChatMessage,
	stashPendingN8nChatPrefill,
	consumePendingN8nChatPrefill,
} from '../pendingN8nChatMessage';

describe('pendingN8nChatMessage', () => {
	it('returns the stored message for a matching agent id', () => {
		const file = new File(['a'], 'a.txt');
		stashPendingN8nChatMessage({ agentId: 'agent-1', text: 'hello', files: [file] });

		expect(consumePendingN8nChatMessage('agent-1')).toEqual({
			agentId: 'agent-1',
			text: 'hello',
			files: [file],
		});
	});

	it('returns undefined and clears the entry for a different agent id', () => {
		stashPendingN8nChatMessage({ agentId: 'agent-1', text: 'hello', files: [] });

		expect(consumePendingN8nChatMessage('agent-2')).toBeUndefined();
		// The mismatched read already cleared it, so even the original agent gets nothing.
		expect(consumePendingN8nChatMessage('agent-1')).toBeUndefined();
	});

	it('is one-shot: a second take for the same agent returns undefined', () => {
		stashPendingN8nChatMessage({ agentId: 'agent-1', text: 'hello', files: [] });

		expect(consumePendingN8nChatMessage('agent-1')).toBeDefined();
		expect(consumePendingN8nChatMessage('agent-1')).toBeUndefined();
	});

	it('returns undefined when nothing was ever stored', () => {
		expect(consumePendingN8nChatMessage('agent-1')).toBeUndefined();
	});
});

describe('pendingN8nChatPrefill', () => {
	it('keeps the prefill until a composer shows it', () => {
		stashPendingN8nChatPrefill({ agentId: 'agent-1', text: 'Where is order #1006?' });

		// The route can create the view twice for one visit, so a read does not clear it.
		expect(consumePendingN8nChatPrefill('agent-1')?.text).toBe('Where is order #1006?');
		expect(consumePendingN8nChatPrefill('agent-1')?.text).toBe('Where is order #1006?');
		clearPendingN8nChatPrefill();
		expect(consumePendingN8nChatPrefill('agent-1')).toBeUndefined();
	});

	it('clears the prefill for a different agent id', () => {
		stashPendingN8nChatPrefill({ agentId: 'agent-1', text: 'Hi' });

		expect(consumePendingN8nChatPrefill('agent-2')).toBeUndefined();
		expect(consumePendingN8nChatPrefill('agent-1')).toBeUndefined();
	});
});
