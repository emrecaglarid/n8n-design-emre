<script setup lang="ts">
import { N8nIcon } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { getActivePinia } from 'pinia';
import { computed } from 'vue';

import { useEnvFeatureFlag } from '@/features/shared/envFeatureFlag/useEnvFeatureFlag';

/** A quiet, fixed note in n8n Chat for an agent that is not published yet. */
const props = defineProps<{ availableInChat: boolean }>();

const i18n = useI18n();
// Unit tests of the shared headers mount them without Pinia.
const envFeatureFlag = getActivePinia() ? useEnvFeatureFlag() : null;

const isShown = computed(
	() => !props.availableInChat && envFeatureFlag?.check.value('AGENT_TEST_COPIES') === true,
);
</script>

<template>
	<div v-if="isShown" :class="$style.note" data-testid="agent-test-copy-real-chat-note">
		<N8nIcon icon="info" :size="14" />
		<span>{{ i18n.baseText('agents.testCopy.realChatNote') }}</span>
	</div>
</template>

<style lang="scss" module>
/* The same quiet style as the Slack thread note in the test pane. */
.note {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	align-self: center;
	width: min(100%, calc(var(--spacing--5xl) * 3));
	margin: var(--spacing--xs) auto 0;
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-radius: var(--radius);
	background-color: var(--background--subtle);
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
	line-height: var(--line-height--md);
}
</style>
