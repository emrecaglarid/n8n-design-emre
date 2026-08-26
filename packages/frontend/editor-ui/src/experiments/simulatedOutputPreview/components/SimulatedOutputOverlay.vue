<script setup lang="ts">
import { computed } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import {
	useSimulatedOutputPreviewStore,
	type SimulatedPreview,
} from '../simulatedOutputPreview.store';
import { useSimulatedOutputPreviews } from '../composables/useSimulatedOutputPreviews';
import OutputPreviewCard from './OutputPreviewCard.vue';

useSimulatedOutputPreviews();

const store = useSimulatedOutputPreviewStore();
const nodeTypesStore = useNodeTypesStore();

const chips = computed(() => store.previews);

function chipLabel(preview: SimulatedPreview): string {
	if (preview.kind === 'slack') return `#${(preview.channel ?? 'channel').replace(/^#/, '')}`;
	return preview.to ?? 'Email';
}

function onChipClick(preview: SimulatedPreview) {
	if (store.openPreviewId === preview.id) {
		store.closeOpen();
	} else {
		store.open(preview.id);
	}
}

async function onDismiss() {
	const preview = store.openPreview;
	if (!preview) return;
	await flyToNode(preview.nodeName);
	store.dismissOpen();
}

/** Clone the card and animate it into the destination node on the canvas */
async function flyToNode(nodeName: string): Promise<void> {
	const cardEl = document.querySelector('[data-simulated-preview-card]');
	const nodeEl = document.querySelector(`[data-node-name="${CSS.escape(nodeName)}"]`);
	if (!(cardEl instanceof HTMLElement) || !(nodeEl instanceof HTMLElement)) return;

	const from = cardEl.getBoundingClientRect();
	const to = nodeEl.getBoundingClientRect();
	const ghost = cardEl.cloneNode(true) as HTMLElement;
	Object.assign(ghost.style, {
		position: 'fixed',
		left: `${from.left}px`,
		top: `${from.top}px`,
		width: `${from.width}px`,
		height: `${from.height}px`,
		margin: '0',
		zIndex: '9999',
		pointerEvents: 'none',
		transformOrigin: 'top left',
		transition: 'transform 420ms cubic-bezier(0.4, 0, 0.2, 1), opacity 420ms ease-in',
	});
	document.body.appendChild(ghost);
	cardEl.style.visibility = 'hidden';

	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			const scale = Math.max(0.08, Math.min(to.width / from.width, to.height / from.height));
			const dx = to.left + to.width / 2 - (from.left + (from.width * scale) / 2);
			const dy = to.top + to.height / 2 - (from.top + (from.height * scale) / 2);
			ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
			ghost.style.opacity = '0.2';
			setTimeout(() => {
				ghost.remove();
				resolve();
			}, 440);
		});
	});
}
</script>

<template>
	<div v-if="store.hasPreviews" :class="$style.overlay" data-test-id="simulated-output-overlay">
		<OutputPreviewCard
			v-if="store.openPreview"
			:key="store.openPreview.id"
			:preview="store.openPreview"
			@dismiss="onDismiss"
			@close="store.closeOpen()"
		/>
		<div :class="$style.strip">
			<N8nIcon icon="eye" size="small" :class="$style.stripIcon" />
			<span :class="$style.stripLabel">Outputs</span>
			<button
				v-for="preview in chips"
				:key="preview.id"
				:class="[$style.chip, { [$style.chipActive]: preview.id === store.openPreviewId }]"
				:data-test-id="`simulated-output-chip`"
				@click="onChipClick(preview)"
			>
				<NodeIcon :node-type="nodeTypesStore.getNodeType(preview.nodeType)" :size="12" />
				<span :class="$style.chipLabel">{{ chipLabel(preview) }}</span>
				<N8nIcon
					v-if="preview.nodeErrored"
					icon="triangle-alert"
					size="xsmall"
					:class="$style.chipWarning"
				/>
			</button>
		</div>
	</div>
</template>

<style lang="scss" module>
@use '@n8n/design-system/css/common/var';

.overlay {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--spacing--2xs);
	pointer-events: none;

	> * {
		pointer-events: auto;
	}
}

.strip {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	background: var(--color--background--light-2, var(--color--background));
	border: var(--border);
	border-radius: var(--radius--xl, 20px);
	padding: var(--spacing--4xs) var(--spacing--2xs);
	box-shadow: var(--shadow--light, 0 2px 8px rgba(0, 0, 0, 0.08));
}

.stripIcon {
	color: var(--color--text--tint-1);
}

.stripLabel {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	margin-right: var(--spacing--4xs);
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
	border: var(--border);
	background: var(--color--background--light-3, var(--color--background));
	border-radius: var(--radius--xl, 20px);
	padding: var(--spacing--5xs, 2px) var(--spacing--2xs);
	cursor: pointer;
	font-size: var(--font-size--3xs);
	color: var(--color--text);

	&:hover {
		border-color: var(--color--primary);
	}
}

.chipActive {
	border-color: var(--color--primary);
	background: var(--color--primary--tint-3, var(--color--background));
}

.chipLabel {
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.chipWarning {
	color: var(--color--warning);
}
</style>
