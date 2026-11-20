import type { AgentTestChange } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createComponentRenderer } from '@/__tests__/render';

import { useAgentTestCopyStore } from '../testCopy.store';
import AgentTestCopyTurnChanges from './AgentTestCopyTurnChanges.vue';

vi.mock('./AgentTestCopyAppIcon.vue', () => ({
	default: { template: '<span data-testid="app-icon" />' },
}));

const renderComponent = createComponentRenderer(AgentTestCopyTurnChanges);

const changes: AgentTestChange[] = [
	{
		id: 'email',
		toolCallId: 'call-1',
		app: 'Gmail',
		appKey: 'gmail',
		kind: 'email',
		status: 'notSent',
		title: 'Email to maja.k@mail.test',
		createdAt: '2026-11-16T10:00:00.000Z',
		email: { to: ['maja.k@mail.test'], subject: 'Your order #1006', body: 'Hi Maja' },
	},
	{
		id: 'message-1',
		toolCallId: 'call-2',
		app: 'Slack',
		appKey: 'slack',
		kind: 'message',
		status: 'notSent',
		title: 'Message in #support',
		createdAt: '2026-11-16T10:01:00.000Z',
		message: { channel: 'support', text: 'Late order' },
	},
	{
		id: 'message-2',
		app: 'Slack',
		appKey: 'slack',
		kind: 'message',
		status: 'notSent',
		title: 'Reply in #support',
		createdAt: '2026-11-16T10:02:00.000Z',
		message: { channel: 'support', text: 'Checked it', inThread: true },
	},
];

describe('AgentTestCopyTurnChanges', () => {
	it('folds the changes of a turn into one row per app', async () => {
		const { getByText, findByText } = renderComponent({
			props: { changes },
			pinia: createTestingPinia(),
		});

		await userEvent.click(getByText('3 actions on hold'));

		expect(await findByText('Nothing was sent or saved.')).toBeInTheDocument();
		expect(getByText('Gmail: 1 email')).toBeInTheDocument();
		expect(getByText('Slack: 2 messages')).toBeInTheDocument();

		await userEvent.click(getByText('Gmail: 1 email'));

		expect(await findByText('To maja.k@mail.test')).toBeInTheDocument();
		expect(getByText('Your order #1006')).toBeInTheDocument();
		expect(getByText('Not sent')).toBeInTheDocument();
	});

	it('makes the changes of the turn after the builder confirms', async () => {
		const pinia = createTestingPinia();
		const store = useAgentTestCopyStore(pinia);
		const { getByText, findByText } = renderComponent({ props: { changes }, pinia });

		await userEvent.click(getByText('3 actions on hold'));
		await userEvent.click(await findByText('Run them'));

		expect(await findByText('Run these actions for real?')).toBeInTheDocument();
		expect(getByText('Send 1 email')).toBeInTheDocument();
		expect(getByText('Post 2 messages')).toBeInTheDocument();
		expect(store.applyChanges).not.toHaveBeenCalled();

		await userEvent.click(getByText('Run actions'));

		expect(store.applyChanges).toHaveBeenCalledTimes(1);
		expect(store.applyChanges).toHaveBeenCalledWith(['email', 'message-1', 'message-2']);
	});

	it('says the changes were made when every change went through', async () => {
		const applied = changes.map((change) => ({
			...change,
			appliedAt: '2026-11-17T10:05:00.000Z',
		}));
		const { getByText, findByText, queryByText } = renderComponent({
			props: { changes: applied },
			pinia: createTestingPinia(),
		});

		await userEvent.click(getByText('3 actions done'));

		expect(await findByText(/^Done in your real apps at/)).toBeInTheDocument();
		expect(queryByText('Run them')).toBeNull();
	});

	it('offers to keep going in n8n Chat only when every change went through', async () => {
		const pinia = createTestingPinia({
			initialState: {
				settings: { settings: { envFeatureFlags: { N8N_ENV_FEAT_AGENT_TEST_COPIES: 'true' } } },
			},
		});
		const store = useAgentTestCopyStore(pinia);
		// Getters can be set in tests with the testing Pinia.
		Object.assign(store, { contextAgentId: 'agent-1' });
		const applied = changes.map((change) => ({
			...change,
			appliedAt: '2026-11-17T10:05:00.000Z',
		}));
		const done = renderComponent({ props: { changes: applied }, pinia });

		await userEvent.click(done.getByText('3 actions done'));
		expect(await done.findByText('Keep going in n8n Chat')).toBeInTheDocument();
		done.unmount();

		Object.assign(store, { applyErrors: { 'message-2': 'Channel not found' } });
		const partly = renderComponent({
			props: { changes: [applied[0], applied[1], changes[2]] },
			pinia,
		});

		await userEvent.click(partly.getByText('2 of 3 actions done'));
		expect(
			await partly.findByText(
				"2 of 3 actions went through. The others didn't, and nothing was retried.",
			),
		).toBeInTheDocument();
		expect(partly.queryByText('Keep going in n8n Chat')).toBeNull();
	});
});
