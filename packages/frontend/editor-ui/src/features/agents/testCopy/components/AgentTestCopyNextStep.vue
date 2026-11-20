<script setup lang="ts">
import { useI18n } from '@n8n/i18n';

import AgentTestCopyOpenInChat from './AgentTestCopyOpenInChat.vue';

/** One light line under the first reply, which stays there: try the agent for real in n8n Chat. */
const i18n = useI18n();
</script>

<template>
	<div :class="$style.row" data-testid="agent-test-copy-next-step">
		<span :class="$style.text">{{ i18n.baseText('agents.testCopy.nextStep.title') }}</span>
		<AgentTestCopyOpenInChat :class="$style.action" />
	</div>
</template>

<style lang="scss" module>
/* No box: the question and its button sit on one line, and the button wraps under it in a narrow pane. */
.row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--2xs) var(--spacing--xs);
	min-width: 0;
	margin-top: var(--spacing--xs);
	/* A faint line sets it apart from the conversation above. */
	padding-top: var(--spacing--sm);
	border-top: var(--border-width) solid var(--border-color--light, var(--border-color));
	/* Lines up with the reply text; a Slack session sets it to 0. */
	margin-inline: var(--test-copy--next-step-inset, var(--spacing--sm));
	color: var(--text-color);
	font-size: var(--font-size--sm);
	line-height: var(--line-height--md);
}

.text {
	min-width: 0;
	overflow-wrap: anywhere;
}

.action {
	flex-shrink: 0;
	/* Right-aligned at the end of the line. */
	margin-inline-start: auto;
}
</style>
