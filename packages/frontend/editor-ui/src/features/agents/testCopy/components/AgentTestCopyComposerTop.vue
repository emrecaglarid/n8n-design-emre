<script setup lang="ts">
import { N8nIconButton } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import { useAgentTestCopyStore } from '../testCopy.store';
import { flyIn, growIn, markFlightStart, shrinkOut } from '../testCopyChipFlight';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';

/**
 * The top of the input in a test chat: the Slack chip when the message comes
 * from a channel. It flies in from the button that added it, and back to it
 * when removed.
 */
const emit = defineEmits<{ reset: [] }>();

const i18n = useI18n();
const store = useAgentTestCopyStore();

const channel = computed(() => store.sendChannel);
const chip = useTemplateRef<HTMLElement>('chip');

watch(
	() => channel.value?.label,
	async (label) => {
		if (!label) return;
		await nextTick();
		// The chip's place is measured first, then the strip around it grows open.
		flyIn(chip.value);
		growIn(chip.value?.parentElement);
	},
	{ immediate: true },
);

async function reset() {
	markFlightStart(chip.value);
	const release = await shrinkOut(chip.value?.parentElement);
	store.selectChannel(null);
	emit('reset');
	// The input holds its shrunk height until the strip is gone, then goes back to auto.
	await nextTick();
	release();
}
</script>

<template>
	<span v-if="channel" ref="chip" :class="$style.chip" data-testid="agent-test-copy-channel-chip">
		<AgentTestCopyAppIcon app-key="slack" :size="14" />
		<span :class="$style.label">{{ channel.label }}</span>
		<N8nIconButton
			v-if="!store.isPlaceLocked"
			variant="ghost"
			size="xsmall"
			icon="x"
			:aria-label="i18n.baseText('agents.testCopy.channel.reset')"
			:title="i18n.baseText('agents.testCopy.channel.reset')"
			data-testid="agent-test-copy-channel-reset"
			@click="reset"
		/>
	</span>
</template>

<style lang="scss" module>
.chip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
	padding: var(--spacing--5xs) var(--spacing--5xs) var(--spacing--5xs) var(--spacing--2xs);
	border-radius: var(--radius);
	background-color: var(--background--subtle);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--medium);
	line-height: var(--line-height--md);

	&:not(:has(button)) {
		padding-inline-end: var(--spacing--2xs);
	}
}

.label {
	white-space: nowrap;
}
</style>
