import type { InjectionKey } from 'vue';

/** Set by the test chat. Other chats that reuse the same components stay unchanged. */
export const AGENT_TEST_COPY_CHAT_KEY: InjectionKey<boolean> = Symbol('agentTestCopyChat');

/** Sends a message from the test chat. `channelLabel` is `null` for the chat itself. */
export type AgentTestCopySend = (text: string, channelLabel: string | null) => Promise<void>;

export const AGENT_TEST_COPY_SEND_KEY: InjectionKey<AgentTestCopySend> =
	Symbol('agentTestCopySend');
