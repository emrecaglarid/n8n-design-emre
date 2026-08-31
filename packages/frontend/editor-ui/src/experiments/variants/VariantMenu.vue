<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { VARIANT_AXES, VARIANT_PRESETS, type VariantState } from './variants';
import { useVariantsStore } from './variants.store';

/**
 * AI Trust prototype: the switch between design alternatives, deliberately
 * dressed as product chrome rather than a dev panel — switching happens in
 * front of people, mid-conversation, without anyone opening devtools.
 */
const variants = useVariantsStore();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const copied = ref(false);

const triggerLabel = computed(() => variants.activePreset?.label ?? 'Custom');

function toggleOpen() {
	open.value = !open.value;
	copied.value = false;
}

function onSelectNotch(key: (typeof VARIANT_AXES)[number]['key'], value: string) {
	variants.set(key, value as VariantState[typeof key]);
}

function onSelectPreset(presetId: string) {
	variants.applyPreset(presetId);
	open.value = false;
}

async function onCopyLink() {
	try {
		await navigator.clipboard.writeText(variants.shareUrl);
		copied.value = true;
	} catch {
		copied.value = false;
	}
}

function onDocumentClick(event: MouseEvent) {
	if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>

<template>
	<div ref="rootEl" :class="$style.root">
		<button :class="$style.trigger" data-testid="variant-menu" @click="toggleOpen">
			<span :class="$style.triggerDot" />
			<span>{{ triggerLabel }}</span>
			<span :class="$style.chevron">▾</span>
		</button>

		<div v-if="open" :class="$style.menu">
			<div :class="$style.section">
				<span :class="$style.sectionLabel">Directions</span>
				<button
					v-for="preset in VARIANT_PRESETS"
					:key="preset.id"
					:class="[$style.item, variants.activePreset?.id === preset.id && $style.itemActive]"
					:data-testid="`variant-preset-${preset.id}`"
					@click="onSelectPreset(preset.id)"
				>
					<span :class="$style.itemText">
						<span :class="$style.itemLabel">{{ preset.label }}</span>
						<span :class="$style.itemHint">{{ preset.hint }}</span>
					</span>
					<span v-if="variants.activePreset?.id === preset.id" :class="$style.tick">✓</span>
				</button>
			</div>

			<div v-for="axis in VARIANT_AXES" :key="axis.key" :class="[$style.section, $style.divided]">
				<span :class="$style.sectionLabel">{{ axis.label }}</span>
				<span :class="$style.question">{{ axis.question }}</span>
				<button
					v-for="notch in axis.notches"
					:key="notch.value"
					:class="[$style.item, variants.state[axis.key] === notch.value && $style.itemActive]"
					:data-testid="`variant-${axis.param}-${notch.value}`"
					@click="onSelectNotch(axis.key, notch.value)"
				>
					<span :class="$style.itemText">
						<span :class="$style.itemLabel">{{ notch.label }}</span>
						<span :class="$style.itemHint">{{ notch.hint }}</span>
					</span>
					<span v-if="variants.state[axis.key] === notch.value" :class="$style.tick">✓</span>
				</button>
			</div>

			<div :class="[$style.section, $style.divided]">
				<button :class="[$style.item, $style.plainItem]" @click="onCopyLink">
					<span :class="$style.itemLabel">{{
						copied ? 'Link copied' : 'Copy link to this setup'
					}}</span>
				</button>
				<button :class="[$style.item, $style.plainItem]" @click="variants.reset()">
					<span :class="$style.itemLabel">Reset</span>
				</button>
			</div>
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
	height: 30px;
	padding: 0 10px;
	border-radius: var(--radius--md);
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale, border-color;
	transition-duration: 100ms;

	&:hover {
		border-color: var(--color--text--tint-1);
	}

	&:active {
		scale: 0.96;
	}
}

.triggerDot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #7c3aed;
}

.chevron {
	font-size: 9px;
	opacity: 0.7;
}

.menu {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	z-index: 1000;
	display: flex;
	flex-direction: column;
	width: 300px;
	max-height: 74vh;
	overflow-y: auto;
	padding: 4px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.section {
	display: flex;
	flex-direction: column;
	gap: 1px;
	padding: 6px 2px;
}

.divided {
	border-top: 1px solid var(--color--foreground);
}

.sectionLabel {
	padding: 0 8px 4px;
	font-size: 10px;
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--color--text--tint-1);
}

.question {
	padding: 0 8px 6px;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

.item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	width: 100%;
	padding: 6px 8px;
	background: transparent;
	border: none;
	border-radius: var(--radius);
	text-align: left;
	cursor: pointer;

	&:hover {
		background: var(--color--background);
	}
}

.itemText {
	display: flex;
	flex-direction: column;
	gap: 1px;
	min-width: 0;
}

.itemLabel {
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

.itemHint {
	font-size: 10px;
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

.itemActive .itemLabel {
	font-weight: var(--font-weight--bold);
}

.plainItem {
	color: var(--color--text--tint-1);
}

.tick {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--color--primary);
}
</style>
