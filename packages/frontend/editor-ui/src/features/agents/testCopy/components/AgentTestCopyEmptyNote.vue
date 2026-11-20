<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { useTestCopyChat } from '../useTestCopyChat';

/** Under the empty test chat: the tools a test cannot run. Examples live in the input. */
const i18n = useI18n();
const { store, isActive } = useTestCopyChat();

const unsupportedTools = computed(() => store?.info?.unsupportedTools ?? []);
</script>

<template>
	<div
		v-if="isActive && unsupportedTools.length > 0"
		:class="$style.note"
		data-testid="agent-test-copy-empty-note"
	>
		<p v-for="tool in unsupportedTools" :key="tool.name" :class="$style.line">
			{{ i18n.baseText('agents.testCopy.unsupportedTool', { interpolate: { name: tool.name } }) }}
		</p>
	</div>
</template>

<style lang="scss" module>
.note {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--spacing--5xs);
	padding-inline: var(--spacing--md);
	text-align: center;
}

.line {
	margin: 0;
	color: var(--text-color--subtler);
	font-size: var(--font-size--xs);
}
</style>
