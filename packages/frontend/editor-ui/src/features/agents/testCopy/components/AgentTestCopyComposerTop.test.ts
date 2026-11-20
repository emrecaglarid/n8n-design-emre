import { createTestingPinia } from '@pinia/testing';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createComponentRenderer } from '@/__tests__/render';

import { useAgentTestCopyStore } from '../testCopy.store';
import AgentTestCopyComposerTop from './AgentTestCopyComposerTop.vue';
import AgentTestCopyStarterChips from './AgentTestCopyStarterChips.vue';

vi.mock('./AgentTestCopyAppIcon.vue', () => ({
	default: { template: '<span data-testid="app-icon" />' },
}));

const SUGGESTIONS = [
	{ title: 'A customer asks about #1002', text: 'Where is my order #1002?' },
	{
		title: 'A teammate passes on #1008',
		text: 'Can you check #1008?',
		channel: { type: 'slack', label: '#support' },
	},
];

function storeWith(state: {
	sendChannel?: { label: string; senderName: string } | null;
	locked?: boolean;
}) {
	const pinia = createTestingPinia();
	const store = useAgentTestCopyStore(pinia);
	// Getters can be set in tests with the testing Pinia.
	Object.assign(store, {
		isActive: true,
		suggestions: SUGGESTIONS,
		isLoadingSuggestions: false,
		sendChannel: state.sendChannel ?? null,
		isPlaceLocked: state.locked ?? false,
	});
	return { pinia, store };
}

const byId = (container: Element, id: string) =>
	container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('AgentTestCopyComposerTop', () => {
	const render = createComponentRenderer(AgentTestCopyComposerTop);

	it('shows the channel chip and goes back to a plain message on remove', async () => {
		const { pinia, store } = storeWith({ sendChannel: { label: '#support', senderName: 'Riley' } });
		const { container } = render({ pinia });

		expect(byId(container, 'agent-test-copy-channel-chip')).toHaveTextContent('#support');
		await userEvent.click(byId(container, 'agent-test-copy-channel-reset') as HTMLElement);
		expect(store.selectChannel).toHaveBeenCalledWith(null);
	});

	it('keeps the chip without a remove button once the session has started', () => {
		const { pinia } = storeWith({
			sendChannel: { label: '#support', senderName: 'Riley' },
			locked: true,
		});
		const { container } = render({ pinia });

		expect(byId(container, 'agent-test-copy-channel-chip')).not.toBeNull();
		expect(byId(container, 'agent-test-copy-channel-reset')).toBeNull();
	});
});

describe('AgentTestCopyStarterChips', () => {
	const render = createComponentRenderer(AgentTestCopyStarterChips);
	const examples = (container: Element) =>
		Array.from(container.querySelectorAll('[data-testid="agent-test-copy-suggestion"]'));

	it('shows the chat examples and the Slack chip, and fills the input with an example', async () => {
		const { pinia } = storeWith({});
		Object.assign(useAgentTestCopyStore(pinia), {
			channels: [{ label: '#support', senderName: 'Riley' }],
			selectedChannel: null,
		});
		const { container, getByText, emitted } = render({ pinia, props: { draftEmpty: true } });

		expect(examples(container)).toHaveLength(1);
		expect(getByText('A customer asks about #1002')).toBeInTheDocument();
		expect(getByText('Or test as if on Slack')).toBeInTheDocument();
		await userEvent.click(examples(container)[0]);
		expect(emitted().pick).toEqual([['Where is my order #1002?']]);
	});

	it('moves to Slack when the Slack chip is clicked', async () => {
		const { pinia, store } = storeWith({});
		Object.assign(store, {
			channels: [{ label: '#support', senderName: 'Riley' }],
			selectedChannel: null,
		});
		const { container } = render({ pinia, props: { draftEmpty: true } });

		await userEvent.click(byId(container, 'agent-test-copy-channel-button') as HTMLElement);
		expect(store.selectChannel).toHaveBeenCalledWith('#support');
	});

	it('shows the Slack examples, without the Slack chip, once Slack is picked', () => {
		const { pinia, store } = storeWith({ sendChannel: { label: '#support', senderName: 'Riley' } });
		Object.assign(store, {
			channels: [{ label: '#support', senderName: 'Riley' }],
			selectedChannel: { label: '#support', senderName: 'Riley' },
		});
		const { container, getByText } = render({ pinia, props: { draftEmpty: true } });

		expect(examples(container)).toHaveLength(1);
		expect(getByText('A teammate passes on #1008')).toBeInTheDocument();
		expect(byId(container, 'agent-test-copy-channel-button')).toBeNull();
	});
});
