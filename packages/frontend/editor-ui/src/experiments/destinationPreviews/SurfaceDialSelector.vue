<script setup lang="ts">
import { computed } from 'vue';

import type { DestinationNotch, PreviewSurface } from './surfaceDial';

/**
 * AI Trust prototype: the combined "where does this output live" control —
 * pick the surface (which chrome renders it) and the destination notch (how
 * real it is). Shown anywhere outputs appear. Live is never a switch: it
 * stays locked behind a track record, and the lock says so.
 */

const props = withDefaults(
	defineProps<{
		surface: PreviewSurface;
		notch: DestinationNotch;
		/** Selectable surfaces; a single entry renders the surface as a fixed label */
		surfaces?: PreviewSurface[];
		/** Where drafts would land, e.g. "#test-invoices" */
		draftTarget?: string;
		/** Render for a dark backdrop (the preview stage) */
		dark?: boolean;
	}>(),
	{
		surfaces: () => ['slack'],
		draftTarget: '#test-invoices',
		dark: false,
	},
);

const emit = defineEmits<{
	'update:surface': [value: PreviewSurface];
	'update:notch': [value: DestinationNotch];
}>();

const SURFACE_LABELS: Record<PreviewSurface, string> = {
	slack: 'Slack',
	email: 'Email',
	chat: 'Chat',
};

const surfaceLocked = computed(() => props.surfaces.length <= 1);

const notches = computed(() => [
	{
		value: 'simulated' as const,
		label: '◉ Simulated',
		title: 'Nothing is sent anywhere. Replies come from the model only.',
		disabled: false,
	},
	{
		value: 'draft' as const,
		label: `● Draft → ${props.draftTarget}`,
		title: `Real sends to a defused place — drafts visible to your testers in ${props.draftTarget}, never to the outside.`,
		disabled: false,
	},
	{
		value: 'live' as const,
		label: '○ Live 🔒',
		title: 'Unlocks with a track record, not a switch.',
		disabled: true,
	},
]);
</script>

<template>
	<div :class="[$style.selector, dark && $style.dark]" data-testid="surface-dial-selector">
		<template v-if="surfaceLocked">
			<span :class="$style.surfaceFixed">{{ SURFACE_LABELS[surface] }}</span>
		</template>
		<template v-else>
			<span :class="$style.surfaceGroup">
				<button
					v-for="candidate in surfaces"
					:key="candidate"
					:class="[$style.surfaceOption, candidate === surface && $style.surfaceActive]"
					@click="emit('update:surface', candidate)"
				>
					{{ SURFACE_LABELS[candidate] }}
				</button>
			</span>
		</template>

		<span :class="$style.divider">·</span>

		<span :class="$style.notchGroup">
			<button
				v-for="candidate in notches"
				:key="candidate.value"
				:class="[
					$style.notchOption,
					candidate.value === notch && $style.notchActive,
					candidate.disabled && $style.notchLocked,
				]"
				:disabled="candidate.disabled"
				:title="candidate.title"
				:data-testid="`surface-dial-notch-${candidate.value}`"
				@click="emit('update:notch', candidate.value)"
			>
				{{ candidate.label }}
			</button>
		</span>
	</div>
</template>

<style lang="scss" module>
.selector {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	padding: 4px 8px;
	border-radius: 999px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	font-size: 11px;
	color: var(--color--text--tint-1);
}

.dark {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(255, 255, 255, 0.18);
	color: rgba(255, 255, 255, 0.75);
}

.surfaceFixed {
	font-weight: var(--font-weight--bold);
	padding: 2px 4px;
	color: inherit;
}

.surfaceGroup,
.notchGroup {
	display: inline-flex;
	align-items: center;
	gap: 2px;
}

.surfaceOption,
.notchOption {
	background: transparent;
	border: none;
	border-radius: 999px;
	padding: 3px 9px;
	font-size: 11px;
	color: inherit;
	cursor: pointer;
	transition-property: background-color, color;
	transition-duration: 100ms;

	&:hover:not(:disabled) {
		background: rgba(127, 127, 127, 0.14);
	}
}

.surfaceActive {
	background: var(--color--text);
	color: var(--color--background--light-2);
	font-weight: var(--font-weight--bold);

	&:hover:not(:disabled) {
		background: var(--color--text);
	}
}

.dark .surfaceActive {
	background: rgba(255, 255, 255, 0.9);
	color: #2c0b2d;

	&:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.9);
	}
}

.notchActive {
	background: rgba(127, 127, 127, 0.16);
	color: var(--color--text);
	font-weight: var(--font-weight--bold);
}

.dark .notchActive {
	background: rgba(255, 255, 255, 0.16);
	color: #fff;
}

.notchLocked {
	opacity: 0.55;
	cursor: not-allowed;
}

.divider {
	opacity: 0.5;
}
</style>
