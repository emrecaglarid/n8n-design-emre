import { computed, inject } from 'vue';

import { AGENT_TEST_COPY_CHAT_KEY } from './testCopy.injection';
import { useOptionalAgentTestCopyStore } from './testCopy.store';

/**
 * The test copy state for a component in the chat. Outside the test chat it
 * returns no store, so other chats that share the components do not need it.
 */
export function useTestCopyChat() {
	const inTestChat = inject(AGENT_TEST_COPY_CHAT_KEY, false);
	const store = inTestChat ? useOptionalAgentTestCopyStore() : null;
	const isActive = computed(() => store?.isActive === true);

	return { store, isActive };
}
