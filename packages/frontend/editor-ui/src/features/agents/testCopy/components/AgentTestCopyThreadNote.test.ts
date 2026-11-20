import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createComponentRenderer } from '@/__tests__/render';

import AgentTestCopyThreadNote from './AgentTestCopyThreadNote.vue';

vi.mock('./AgentTestCopyAppIcon.vue', () => ({
	default: { template: '<span data-testid="app-icon" />' },
}));
vi.mock('./AgentTestCopyOpenInChat.vue', () => ({
	default: { template: '<button data-testid="open-in-chat">Open in n8n Chat</button>' },
}));

const renderComponent = createComponentRenderer(AgentTestCopyThreadNote);

describe('AgentTestCopyThreadNote', () => {
	it('opens the thread with the channel and what happens in it', () => {
		const { getByText } = renderComponent({ props: { label: '#support', sessionId: 'session-1' } });

		expect(getByText('#support')).toBeTruthy();
		expect(getByText('This plays out like a #support thread. Nothing reaches Slack.')).toBeTruthy();
	});

	it('explains the test and offers n8n Chat from the flask capsule', async () => {
		const { container, findByText } = renderComponent({
			props: { label: '#support', sessionId: 'session-1' },
		});

		const trigger = container.querySelector<HTMLElement>(
			'[data-testid="agent-test-copy-thread-trigger"]',
		);
		await userEvent.click(trigger as HTMLElement);
		expect(
			await findByText(
				"This is a test that plays out as if it happened in #support. Your agent reads your apps for real, but it doesn't send or change anything.",
			),
		).toBeTruthy();
		expect(await findByText('Open in n8n Chat')).toBeTruthy();
	});
});
