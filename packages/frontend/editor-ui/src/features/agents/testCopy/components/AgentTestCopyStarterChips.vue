<script setup lang="ts">
import type { AgentTestSuggestion } from '@n8n/api-types';
import { N8nLoading } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import { useAgentTestCopyStore } from '../testCopy.store';
import { flyIn, markFlightStart } from '../testCopyChipFlight';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';

/**
 * Above the input, before the first message: example chips for the place the
 * next message comes from, and a chip that turns the next message into a
 * simulated Slack message. That chip moves into the input; removing it there
 * brings it back here.
 */
const props = defineProps<{ draftEmpty: boolean }>();
const emit = defineEmits<{ pick: [text: string]; selected: [] }>();

const i18n = useI18n();
const store = useAgentTestCopyStore();

const examples = computed<AgentTestSuggestion[]>(() => {
	const channel = store.sendChannel;
	return store.suggestions.filter((suggestion) =>
		channel ? suggestion.channel?.label === channel.label : suggestion.channel === undefined,
	);
});

const showSlackChip = computed(() => store.channels.length > 0 && !store.selectedChannel);
const showExamples = computed(
	() => props.draftEmpty && (store.isLoadingSuggestions || examples.value.length > 0),
);

const slackChip = useTemplateRef<HTMLElement>('slackChip');

// When the chip in the input is removed, this chip flies back from there.
watch(showSlackChip, async (shown) => {
	if (!shown) return;
	await nextTick();
	flyIn(slackChip.value);
});

function selectSlack(label: string) {
	markFlightStart(slackChip.value);
	store.selectChannel(label);
	emit('selected');
}
</script>

<template>
	<div
		v-if="showExamples || showSlackChip"
		:class="$style.chips"
		:aria-busy="store.isLoadingSuggestions || undefined"
		data-testid="agent-test-copy-starters"
	>
		<template v-if="showExamples">
			<template v-if="store.isLoadingSuggestions">
				<N8nLoading v-for="index in 2" :key="index" variant="text" :class="$style.loading" />
			</template>
			<button
				v-for="(example, index) in examples"
				v-else
				:key="`${store.sendChannel?.label ?? 'chat'}-${index}`"
				type="button"
				:class="$style.chip"
				:title="example.text"
				data-testid="agent-test-copy-suggestion"
				data-attr="agent-test-copy-suggestion"
				@click="emit('pick', example.text)"
			>
				<span :class="$style.text">{{ example.title ?? example.text }}</span>
			</button>
		</template>
		<button
			v-if="showSlackChip"
			ref="slackChip"
			type="button"
			:class="[$style.chip, $style.slack]"
			data-testid="agent-test-copy-channel-button"
			data-attr="agent-test-copy-channel-button"
			@click="selectSlack(store.channels[0].label)"
		>
			<AgentTestCopyAppIcon app-key="slack" :size="14" />
			<span :class="$style.text">{{ i18n.baseText('agents.testCopy.channel.try') }}</span>
		</button>
	</div>
</template>

<style lang="scss" module>
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--3xs);
	padding-bottom: var(--spacing--2xs);
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	max-width: 100%;
	padding: var(--spacing--4xs) var(--spacing--xs);
	border: var(--border-width) solid var(--border-color);
	border-radius: var(--radius--full);
	background-color: var(--background--surface);
	color: var(--text-color);
	font: inherit;
	font-size: var(--font-size--xs);
	line-height: var(--line-height--lg);
	cursor: pointer;
	transition: background-color var(--duration--snappy) var(--easing--ease-out);

	&:hover {
		background-color: var(--background--subtle);
	}

	&:focus-visible {
		outline: var(--focus--border-width, 2px) solid var(--focus--border-color, currentColor);
		outline-offset: var(--spacing--5xs);
	}
}

/* The Slack chip changes where the message comes from, so it reads as an option, not an example. */
.slack {
	border-style: dashed;
	color: var(--text-color--subtle);
	padding-inline-start: var(--spacing--2xs);
}

.text {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.loading {
	width: calc(var(--spacing--5xl) * 1.2);
}
</style>
