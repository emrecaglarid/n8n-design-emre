<script setup lang="ts">
import { computed } from 'vue';

import AgentMarkdownChunk from '../../components/AgentMarkdownChunk.vue';
import { useOptionalAgentTestCopyStore } from '../testCopy.store';
import AgentTestCopySlackMessage from './AgentTestCopySlackMessage.vue';

/** The agent's text reply in a Slack session: just its message in the thread. */
const props = defineProps<{ text: string; time?: number }>();

const store = useOptionalAgentTestCopyStore();

const senderName = computed(() => store?.agentName ?? '');
</script>

<template>
	<div :class="$style.reply" data-testid="agent-test-copy-thread-reply">
		<AgentTestCopySlackMessage :sender-name="senderName" :text="props.text" :time="time" is-app>
			<div :class="$style.markdown">
				<AgentMarkdownChunk :source="props.text" />
			</div>
		</AgentTestCopySlackMessage>
	</div>
</template>

<style lang="scss" module>
.reply {
	padding-block: var(--spacing--xs);
}

/* Markdown sets its own blocks; the row's text size and line height still apply. */
.markdown {
	white-space: normal;

	:global(p),
	:global(li) {
		margin: 0;
		font-size: inherit;
		line-height: inherit;
	}

	:global(p + p) {
		margin-top: var(--spacing--2xs);
	}
}
</style>
