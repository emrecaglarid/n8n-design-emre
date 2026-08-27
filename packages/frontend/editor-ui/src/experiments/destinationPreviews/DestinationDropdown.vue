<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { destinationLabel, type PreviewDestination, type TestChannelOption } from './surfaceDial';

/**
 * AI Trust prototype: the one control for where outputs go. Default is
 * Preview (nothing sent anywhere); Test destinations are defused channels
 * that only testers see; Live is visible but locked — it is earned through
 * publishing and a track record, never toggled here.
 */
const props = withDefaults(
	defineProps<{
		modelValue: PreviewDestination;
		/** Render for a dark backdrop (the preview stage) */
		dark?: boolean;
	}>(),
	{ dark: false },
);

const emit = defineEmits<{
	'update:modelValue': [value: PreviewDestination];
}>();

const testChannels = ref<TestChannelOption[]>([
	{ channel: 'invoice-agent-test' },
	{ channel: 'tax-agent-test', private: true },
]);

const open = ref(false);
const testSubmenuOpen = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const triggerLabel = computed(() => destinationLabel(props.modelValue));

function toggleOpen() {
	open.value = !open.value;
	if (!open.value) testSubmenuOpen.value = false;
}

function close() {
	open.value = false;
	testSubmenuOpen.value = false;
}

function selectPreview() {
	emit('update:modelValue', { kind: 'preview' });
	close();
}

function selectChannel(option: TestChannelOption) {
	emit('update:modelValue', { kind: 'test', channel: option.channel, private: option.private });
	close();
}

function createChannel() {
	const name = `agent-test-${testChannels.value.length + 1}`;
	const option: TestChannelOption = { channel: name };
	testChannels.value.push(option);
	selectChannel(option);
}

function onDocumentClick(event: MouseEvent) {
	if (rootEl.value && !rootEl.value.contains(event.target as Node)) close();
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>

<template>
	<div ref="rootEl" :class="[$style.root, dark && $style.dark]">
		<button :class="$style.trigger" data-testid="destination-dropdown" @click="toggleOpen">
			<span>{{ triggerLabel }}</span>
			<span :class="$style.chevron">▾</span>
		</button>

		<div v-if="open" :class="$style.menu">
			<button
				:class="[$style.item, modelValue.kind === 'preview' && $style.itemActive]"
				data-testid="destination-option-preview"
				@click="selectPreview"
			>
				<span :class="$style.itemLabel">Preview</span>
				<span :class="$style.itemHint">nothing sent</span>
			</button>

			<div
				:class="$style.submenuWrapper"
				@mouseenter="testSubmenuOpen = true"
				@mouseleave="testSubmenuOpen = false"
			>
				<button
					:class="[$style.item, modelValue.kind === 'test' && $style.itemActive]"
					data-testid="destination-option-test"
					@click="testSubmenuOpen = !testSubmenuOpen"
				>
					<span :class="$style.itemLabel">Test destinations</span>
					<span :class="$style.submenuChevron">▸</span>
				</button>
				<div v-if="testSubmenuOpen" :class="$style.submenu">
					<button
						v-for="option in testChannels"
						:key="option.channel"
						:class="[
							$style.item,
							modelValue.kind === 'test' &&
								modelValue.channel === option.channel &&
								$style.itemActive,
						]"
						:data-testid="`destination-channel-${option.channel}`"
						@click="selectChannel(option)"
					>
						<span :class="$style.itemLabel"
							>{{ option.private ? '🔒' : '#' }} {{ option.channel }}</span
						>
					</button>
					<button :class="[$style.item, $style.newItem]" @click="createChannel">
						<span :class="$style.itemLabel">+ New test channel</span>
					</button>
				</div>
			</div>

			<button
				:class="[$style.item, $style.itemLocked]"
				disabled
				title="Locked until this agent is published and has a track record."
				data-testid="destination-option-live"
			>
				<span :class="$style.itemLabel">Live</span>
				<span :class="$style.itemHint">🔒</span>
			</button>
		</div>
	</div>
</template>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-flex;
}

.trigger {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px;
	border-radius: var(--radius--md);
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active {
		scale: 0.96;
	}
}

.dark .trigger {
	background: rgba(255, 255, 255, 0.1);
	border-color: rgba(255, 255, 255, 0.2);
	color: rgba(255, 255, 255, 0.92);
}

.chevron {
	font-size: 9px;
	opacity: 0.7;
}

.menu {
	position: absolute;
	top: calc(100% + 6px);
	left: 0;
	z-index: 30;
	display: flex;
	flex-direction: column;
	min-width: 210px;
	padding: 4px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
	padding: 7px 10px;
	background: transparent;
	border: none;
	border-radius: var(--radius);
	font-size: var(--font-size--3xs);
	color: var(--color--text);
	text-align: left;
	cursor: pointer;

	&:hover:not(:disabled) {
		background: var(--color--background);
	}
}

.itemLabel {
	white-space: nowrap;
}

.itemHint {
	font-size: 10px;
	color: var(--color--text--tint-1);
}

.itemActive {
	font-weight: var(--font-weight--bold);
}

.itemLocked {
	opacity: 0.55;
	cursor: not-allowed;
}

.newItem {
	color: var(--color--text--tint-1);
	border-top: 1px solid var(--color--foreground);
	border-radius: 0 0 var(--radius) var(--radius);
}

.submenuWrapper {
	position: relative;
}

.submenuChevron {
	font-size: 10px;
	color: var(--color--text--tint-1);
}

.submenu {
	position: absolute;
	top: -4px;
	left: calc(100% + 2px);
	z-index: 31;
	display: flex;
	flex-direction: column;
	min-width: 200px;
	padding: 4px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}
</style>
