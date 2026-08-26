<script setup lang="ts">
import { computed } from 'vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import {
	useSimulatedOutputPreviewStore,
	type SimulatedPreview,
	type PreviewVerdict,
} from '../simulatedOutputPreview.store';
import { useSimulatedOutputPreviews } from '../composables/useSimulatedOutputPreviews';
import OutputPreviewCard from './OutputPreviewCard.vue';

const emit = defineEmits<{
	stop: [];
}>();

useSimulatedOutputPreviews();

const store = useSimulatedOutputPreviewStore();
const nodeTypesStore = useNodeTypesStore();

const pillLabel = computed(() =>
	store.pillPhase === 'generating' ? 'Generating output previews…' : 'Running nodes…',
);

const outputsSubtitle = computed(() => {
	const count = store.runOutputsTotal;
	return `Workflow generated ${count} output${count === 1 ? '' : 's'}`;
});

function behindTitle(preview: SimulatedPreview): string {
	if (preview.kind === 'slack') return 'Slack message';
	return 'Email';
}

async function onVerdict(preview: SimulatedPreview, verdict: PreviewVerdict) {
	await flyToNode(preview);
	store.dismissPreview(preview.id, verdict);
}

async function onClose(preview: SimulatedPreview) {
	await flyToNode(preview);
	store.dismissPreview(preview.id);
}

async function onDismissPill() {
	for (const preview of [...store.previews]) {
		await flyToNode(preview);
	}
	store.dismissPill();
}

/** Clone the card and animate it into the destination node on the canvas */
async function flyToNode(preview: SimulatedPreview): Promise<void> {
	const cardEl = document.querySelector(`[data-simulated-preview-card="${preview.id}"]`);
	const nodeEl = document.querySelector(`[data-node-name="${CSS.escape(preview.nodeName)}"]`);
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
	<div
		v-if="store.isPillActive || store.hasPreviews"
		:class="[$style.overlay, !store.isPillActive && $style.lifted]"
		data-test-id="simulated-output-overlay"
	>
		<!-- Deck of output previews -->
		<div v-if="store.hasPreviews" :class="$style.deck">
			<template v-if="!store.showAll">
				<button
					v-for="preview in store.behindPreviews"
					:key="preview.id"
					:class="$style.behindBar"
					data-test-id="simulated-output-behind-bar"
					@click="store.bringToFront(preview.id)"
				>
					<NodeIcon :node-type="nodeTypesStore.getNodeType(preview.nodeType)" :size="14" />
					<span :class="$style.behindTitle">{{ behindTitle(preview) }}</span>
					<span :class="$style.behindPreviewOnly">Preview only</span>
				</button>
				<OutputPreviewCard
					v-if="store.frontPreview"
					:key="store.frontPreview.id"
					:preview="store.frontPreview"
					@verdict="onVerdict(store.frontPreview, $event)"
					@close="onClose(store.frontPreview)"
				/>
			</template>
			<template v-else>
				<OutputPreviewCard
					v-for="preview in store.previews"
					:key="preview.id"
					:preview="preview"
					@verdict="onVerdict(preview, $event)"
					@close="onClose(preview)"
				/>
			</template>
		</div>

		<!-- Phased execution pill -->
		<div v-if="store.isPillActive" :class="$style.pill" data-test-id="simulated-execution-pill">
			<template v-if="store.pillPhase === 'running' || store.pillPhase === 'generating'">
				<span :class="$style.spinnerBox">
					<svg
						:class="$style.spinner"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#fff"
						stroke-width="2.6"
						stroke-linecap="round"
					>
						<path d="M12 2a10 10 0 1 1-7.07 2.93" />
					</svg>
				</span>
				<span :class="$style.pillLabel">{{ pillLabel }}</span>
				<button
					:class="$style.pillIconButton"
					title="Stop execution"
					data-test-id="simulated-pill-stop"
					@click="emit('stop')"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linejoin="round"
					>
						<rect x="4" y="4" width="16" height="16" rx="2" />
					</svg>
				</button>
			</template>
			<template v-else>
				<svg
					:class="$style.check"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M20 6 9 17l-5-5" />
				</svg>
				<span :class="$style.pillMessage">
					<span :class="$style.pillTitle">Run successful</span>
					<span :class="$style.pillSubtitle">{{ outputsSubtitle }}</span>
				</span>
				<button
					v-if="store.previews.length > 1"
					:class="$style.showAllButton"
					data-test-id="simulated-pill-show-all"
					@click="store.toggleShowAll()"
				>
					{{ store.showAll ? 'Collapse' : 'Show all' }}
				</button>
				<button
					:class="$style.pillIconButton"
					title="Dismiss"
					data-test-id="simulated-pill-dismiss"
					@click="onDismissPill"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="8" cy="8" r="6.667" />
						<path d="M10 6l-4 4" />
						<path d="M6 6l4 4" />
					</svg>
				</button>
			</template>
		</div>
	</div>
</template>

<style lang="scss" module>
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

/* When the pill is gone the Execute button is back at the bottom — keep the deck clear of it */
.lifted {
	padding-bottom: 64px;
}

.deck {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--spacing--2xs);
	pointer-events: none;

	> * {
		pointer-events: auto;
	}
}

/* Peeking header of a card behind the front one: visible part stays shorter
   than the front card's own header (~32px visible, 14px tucked underneath) */
.behindBar {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--2xs);
	width: 528px;
	max-width: 86vw;
	height: 46px;
	margin-bottom: calc(-1 * var(--spacing--sm) - 2px);
	padding: var(--spacing--2xs) var(--spacing--xs);
	background: var(--color--background--light-2, var(--color--background));
	border: var(--border);
	border-radius: var(--radius--lg) var(--radius--lg) 0 0;
	box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
	cursor: pointer;

	&:hover {
		background: var(--color--background--light-3, var(--color--background));
	}
}

.behindTitle {
	flex-grow: 1;
	text-align: left;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text--tint-1);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.behindPreviewOnly {
	flex: 0 0 auto;
	font-size: var(--font-size--3xs);
	color: var(--color--warning);
	opacity: 0.7;
}

.pill {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	min-width: 420px;
	max-width: 86vw;
	min-height: 52px;
	padding: var(--spacing--2xs);
	background: var(--color--background--light-2, var(--color--background));
	border: var(--border);
	border-radius: var(--radius--lg);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.spinnerBox {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	flex-shrink: 0;
	background: var(--color--primary);
	border-radius: var(--radius);
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.spinner {
	animation: simulated-spin 900ms linear infinite;
}

@keyframes simulated-spin {
	to {
		transform: rotate(360deg);
	}
}

.pillLabel {
	flex-grow: 1;
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.check {
	flex-shrink: 0;
	stroke: var(--color--success, #29a568);
	margin-left: var(--spacing--3xs);
}

.pillMessage {
	display: flex;
	flex-direction: column;
	flex-grow: 1;
	gap: 1px;
}

.pillTitle {
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	line-height: var(--line-height--sm);
}

.pillSubtitle {
	font-size: var(--font-size--sm);
	color: var(--color--text);
	line-height: var(--line-height--sm);
}

.showAllButton {
	display: flex;
	align-items: center;
	height: 36px;
	padding: 0 16px;
	flex-shrink: 0;
	background: var(--color--background--light-3, var(--color--background));
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	cursor: pointer;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}

.pillIconButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	flex-shrink: 0;
	background: var(--color--background--light-3, var(--color--background));
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	color: var(--color--text);
	cursor: pointer;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}
</style>
