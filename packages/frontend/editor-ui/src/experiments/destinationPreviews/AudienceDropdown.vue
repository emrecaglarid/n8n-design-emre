<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * AI Trust prototype: who can see this preview. Visual state only — sharing
 * isn't wired, and the menu hints say so plainly.
 */
withDefaults(
	defineProps<{
		modelValue: 'you' | 'team';
		/** Render for a dark backdrop (the preview stage) */
		dark?: boolean;
	}>(),
	{ dark: false },
);

const emit = defineEmits<{
	'update:modelValue': [value: 'you' | 'team'];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function pick(value: 'you' | 'team') {
	emit('update:modelValue', value);
	open.value = false;
}

function onDocumentClick(event: MouseEvent) {
	if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>

<template>
	<div ref="rootEl" :class="[$style.root, dark && $style.dark]">
		<button :class="$style.trigger" data-testid="audience-dropdown" @click="open = !open">
			{{ modelValue === 'you' ? 'Only you' : 'Team' }}
			<span :class="$style.chevron">▾</span>
		</button>
		<div v-if="open" :class="$style.menu">
			<button :class="$style.option" @click="pick('you')">
				<span :class="$style.optionName">Only you</span>
				<span :class="$style.optionHint">this preview stays private</span>
			</button>
			<button :class="$style.option" @click="pick('team')">
				<span :class="$style.optionName">Team</span>
				<span :class="$style.optionHint">everyone in this project can watch and judge</span>
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
	font-size: 11px;
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
	right: 0;
	z-index: 30;
	display: flex;
	flex-direction: column;
	min-width: 240px;
	padding: 4px;
	background: var(--color--background--light-2, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.option {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1px;
	padding: 7px 10px;
	background: transparent;
	border: none;
	border-radius: var(--radius);
	text-align: left;
	cursor: pointer;

	&:hover {
		background: var(--color--background);
	}
}

.optionName {
	font-size: 11px;
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.optionHint {
	font-size: 10px;
	color: var(--color--text--tint-1);
}
</style>
