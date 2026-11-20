import { getActivePinia } from 'pinia';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useEnvFeatureFlag } from '@/features/shared/envFeatureFlag/useEnvFeatureFlag';

import { AGENT_N8N_CHAT_VIEW } from '../constants';
import { stashPendingN8nChatPrefill } from '../n8nChatPage/pendingN8nChatMessage';
import { useOptionalAgentTestCopyStore } from './testCopy.store';

/**
 * Opens the agent in n8n Chat in a new conversation, where its actions are
 * real. The composer there holds the test session's first message, unsent.
 */
export function useOpenInN8nChat() {
	const router = useRouter();
	// Unit tests of the shared chat components mount them without Pinia.
	const envFeatureFlag = getActivePinia() ? useEnvFeatureFlag() : null;
	const store = useOptionalAgentTestCopyStore();

	const agentId = computed(() => store?.contextAgentId ?? '');
	const isAvailable = computed(
		() => envFeatureFlag?.check.value('AGENT_TEST_COPIES') === true && Boolean(agentId.value),
	);

	async function openInChat() {
		if (!agentId.value) return;
		const text = store?.firstMessageText.trim() ?? '';
		if (text) stashPendingN8nChatPrefill({ agentId: agentId.value, text });
		await router.push({ name: AGENT_N8N_CHAT_VIEW, params: { agentId: agentId.value } });
	}

	return { isAvailable, openInChat };
}
