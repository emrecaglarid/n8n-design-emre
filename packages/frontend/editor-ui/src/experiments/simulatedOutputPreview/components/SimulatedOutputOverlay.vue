<script setup lang="ts">
import { computed, ref } from 'vue';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import {
	useSimulatedOutputPreviewStore,
	type SimulatedPreview,
	type PreviewVerdict,
	type OutputVerdict,
} from '../simulatedOutputPreview.store';
import { useSimulatedOutputPreviews } from '../composables/useSimulatedOutputPreviews';
import OutputPreviewCard from './OutputPreviewCard.vue';
import OutputVerdictModal from './OutputVerdictModal.vue';
import type { Finding } from '@/experiments/findings/findings';

const emit = defineEmits<{
	stop: [];
}>();

useSimulatedOutputPreviews();

const store = useSimulatedOutputPreviewStore();
const nodeTypesStore = useNodeTypesStore();

const pillLabel = computed(() =>
	store.pillPhase === 'generating' ? 'Generating outputs…' : 'Running nodes…',
);

/** The compare baseline for a preview: only when the output actually changed */
function baselineFor(preview: SimulatedPreview) {
	if (!store.changedSinceApproved(preview)) return null;
	return store.lastApprovedFor(preview.nodeName, preview.id);
}

const outputsSubtitle = computed(() => {
	const changed = store.previews.filter((preview) => store.changedSinceApproved(preview)).length;
	if (changed > 0) {
		const same = store.runOutputsTotal - changed;
		return `${same} look${same === 1 ? 's' : ''} right · ${changed} changed since you approved ${changed === 1 ? 'it' : 'them'}`;
	}
	const count = store.runOutputsTotal;
	return `Workflow generated ${count} output${count === 1 ? '' : 's'}`;
});

const pillContentKey = computed(() => (store.pillPhase === 'success' ? 'success' : 'progress'));

function behindTitle(preview: SimulatedPreview): string {
	if (preview.kind === 'slack') return 'Slack message';
	return 'Email';
}

/** 👎 opens the reason modal; 👍 dismisses straight away */
const rejecting = ref<SimulatedPreview | null>(null);

async function onVerdict(preview: SimulatedPreview, verdict: PreviewVerdict) {
	if (verdict === 'down') {
		rejecting.value = preview;
		return;
	}
	await flyToNode(preview);
	store.dismissPreview(preview.id, verdict);
}

async function onRejectSave(details: {
	verdict: OutputVerdict;
	reason: string;
	correction?: string;
	findings: Finding[];
}) {
	const preview = rejecting.value;
	rejecting.value = null;
	if (!preview) return;
	await flyToNode(preview);
	// "Mostly fine" is still a thumbs-down on the card, but the record keeps the
	// distinction so one flagged field doesn't read as a rejected output.
	store.dismissPreview(preview.id, 'down', {
		reason: details.reason,
		correction: details.correction,
		outputVerdict: details.verdict,
		findings: details.findings,
	});
}

async function onClose(preview: SimulatedPreview) {
	await flyToNode(preview);
	store.dismissPreview(preview.id);
}

async function onDismissPill() {
	// Fly all remaining cards concurrently with a short stagger instead of one
	// after another — the wait would otherwise grow with every extra output.
	const targets = [...store.previews];
	await Promise.all(
		targets.map(
			async (preview, index) =>
				await new Promise<void>((resolve) => {
					setTimeout(() => {
						void flyToNode(preview).then(resolve);
					}, index * 100);
				}),
		),
	);
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
		<Transition
			:enter-active-class="$style.riseEnterActive"
			:enter-from-class="$style.riseEnterFrom"
			:leave-active-class="$style.riseLeaveActive"
			:leave-to-class="$style.riseLeaveTo"
		>
			<div v-if="store.hasPreviews" :class="[$style.deck, $style.staggered]">
				<template v-if="!store.showAll">
					<button
						v-for="preview in store.behindPreviews"
						:key="preview.id"
						:class="[$style.behindBar, $style.pressable]"
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
						:baseline="baselineFor(store.frontPreview)"
						@verdict="onVerdict(store.frontPreview, $event)"
						@close="onClose(store.frontPreview)"
					/>
				</template>
				<template v-else>
					<OutputPreviewCard
						v-for="preview in store.previews"
						:key="preview.id"
						:preview="preview"
						:baseline="baselineFor(preview)"
						@verdict="onVerdict(preview, $event)"
						@close="onClose(preview)"
					/>
				</template>
			</div>
		</Transition>

		<!-- Phased execution pill -->
		<Transition
			:enter-active-class="$style.riseEnterActive"
			:enter-from-class="$style.riseEnterFrom"
			:leave-active-class="$style.riseLeaveActive"
			:leave-to-class="$style.riseLeaveTo"
		>
			<div v-if="store.isPillActive" :class="$style.pill" data-test-id="simulated-execution-pill">
				<Transition
					mode="out-in"
					:enter-active-class="$style.fadeEnterActive"
					:enter-from-class="$style.fadeEnterFrom"
					:leave-active-class="$style.fadeLeaveActive"
					:leave-to-class="$style.fadeLeaveTo"
				>
					<div :key="pillContentKey" :class="$style.pillContent">
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
								:class="[$style.pillIconButton, $style.pressable]"
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
								:class="[$style.showAllButton, $style.pressable]"
								data-test-id="simulated-pill-show-all"
								@click="store.toggleShowAll()"
							>
								{{ store.showAll ? 'Collapse' : 'Show all' }}
							</button>
							<button
								:class="[$style.pillIconButton, $style.pressable]"
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
				</Transition>
			</div>
		</Transition>

		<OutputVerdictModal
			v-if="rejecting"
			:preview="rejecting"
			@save="onRejectSave"
			@cancel="rejecting = null"
		/>
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
	font-variant-numeric: tabular-nums;
}

.pillContent {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	flex-grow: 1;
	min-width: 0;
}

/* Enter/exit for the pill and the deck: soft rise in, softer settle out */
.riseEnterActive {
	transition:
		opacity 200ms ease-out,
		translate 200ms ease-out;
}

.riseEnterFrom {
	opacity: 0;
	translate: 0 8px;
}

.riseLeaveActive {
	transition:
		opacity 150ms ease-out,
		translate 150ms ease-out;
}

.riseLeaveTo {
	opacity: 0;
	translate: 0 4px;
}

/* The deck enters ~100ms after the pill lands on success — staged, not simultaneous */
.staggered.riseEnterActive {
	transition-delay: 100ms;
}

/* Cross-fade between the pill's progress and success content */
.fadeEnterActive,
.fadeLeaveActive {
	transition: opacity 120ms ease-out;
}

.fadeEnterFrom,
.fadeLeaveTo {
	opacity: 0;
}

.pressable {
	transition-property: scale;
	transition-duration: 100ms;

	&:active {
		scale: 0.96;
	}
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
