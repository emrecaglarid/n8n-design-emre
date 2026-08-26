<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { N8nButton, N8nText } from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';

import { useAgentEvalsStore } from '@/features/agents/agentEvals.store';
import { isDataTableDataset, toCaseSource } from '@/features/agents/utils/agentEvalCases.utils';
import {
	readAgentAnswer,
	readCaseRequest,
	resolveReviewRowView,
} from '@/features/agents/utils/agent-eval-review';
import type { AgentEvalVote } from '@/features/agents/agentEvals.types';
import SlackWindow from '@/experiments/destinationPreviews/slack/SlackWindow.vue';
import SlackMessage from '@/experiments/destinationPreviews/slack/SlackMessage.vue';

/**
 * AI Trust prototype: the agent's output rendered as scenes at the destination.
 * Rides the real agent-evals machinery — generated cases become scenes, runs
 * fill in the agent's replies, and the verdict pair writes real ratings, so
 * everything judged here shows up in the Evals tab too.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
	agentName?: string;
	disabled?: boolean;
	canRun?: boolean;
	agentUnsaved?: boolean;
}>();

const PERSONA_NAME = 'Emily Anderson';

const toast = useToast();
const store = useAgentEvalsStore();

const hasSettled = ref(false);
const sceneIndex = ref(0);

const dataset = computed(() => store.getDatasets(props.agentId)[0]);
const caseSource = computed(() => {
	const current = dataset.value;
	if (!current || !isDataTableDataset(current)) return null;
	return toCaseSource(current);
});
const runId = computed(() => (dataset.value ? store.getLatestRunId(dataset.value.id) : undefined));
const review = computed(() => (runId.value ? store.getReview(runId.value) : undefined));
const cases = computed(() => (dataset.value ? store.getCases(dataset.value.id) : []));
const results = computed(() => review.value?.results ?? []);
const inFlight = computed(() => (runId.value ? store.isRunInFlight(runId.value) : false));
const reviewedCount = computed(() => (runId.value ? store.reviewedCount(runId.value) : 0));

const mode = computed<'unsaved' | 'loading' | 'generating' | 'empty' | 'cases' | 'run'>(() => {
	if (props.agentUnsaved) return 'unsaved';
	if (!hasSettled.value) return 'loading';
	if (runId.value) return 'run';
	if (dataset.value && cases.value.length > 0) return 'cases';
	if (generating.value || store.isGeneratingCases(props.agentId)) return 'generating';
	return 'empty';
});

const sceneCount = computed(() =>
	mode.value === 'run' ? results.value.length : cases.value.length,
);

const currentResult = computed(() =>
	mode.value === 'run' ? results.value[sceneIndex.value] : undefined,
);
const currentCase = computed(() =>
	mode.value === 'cases' ? cases.value[sceneIndex.value] : undefined,
);

const requestText = computed(() => {
	if (currentResult.value) return readCaseRequest(currentResult.value.input) ?? '';
	return currentCase.value?.input ?? '';
});
const answerText = computed(() =>
	currentResult.value ? (readAgentAnswer(currentResult.value.output) ?? '') : '',
);
const whatToCheck = computed(() => currentCase.value?.whatToCheck ?? '');
const resultStatus = computed(() => currentResult.value?.status);

const sceneTime = computed(() => {
	const stamp = currentResult.value?.runAt ?? currentResult.value?.createdAt;
	const date = stamp ? new Date(stamp) : new Date();
	return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
});

const agentDisplayName = computed(() => props.agentName?.trim() || 'Your agent');
const channelName = computed(() => 'client-requests');

const rowView = computed(() => {
	const result = currentResult.value;
	const id = runId.value;
	if (!result || !id) return undefined;
	return resolveReviewRowView({
		rating: review.value?.ratingsByResultId?.[result.id],
		pending: review.value?.pendingByResultId?.[result.id],
		draft: store.getDraft(id, result.id),
	});
});

const showReason = computed(
	() => rowView.value?.kind === 'editing' && rowView.value.showReason === true,
);
const currentVote = computed(() => {
	const view = rowView.value;
	return view && 'vote' in view ? view.vote : null;
});
const draftComment = computed({
	get: () =>
		runId.value && currentResult.value
			? (store.getDraft(runId.value, currentResult.value.id)?.comment ?? '')
			: '',
	set: (value: string) => {
		if (runId.value && currentResult.value) {
			store.setDraftComment(runId.value, currentResult.value.id, value);
		}
	},
});

async function load() {
	if (!props.agentId || props.agentUnsaved) {
		hasSettled.value = true;
		return;
	}
	hasSettled.value = false;
	try {
		const fetched = await store.fetchDatasets(props.projectId, props.agentId);
		const newest = fetched[0];
		if (newest) {
			await store.resolveLatestRunId(props.projectId, props.agentId, newest.id);
			if (runId.value) {
				await openCurrentRun();
			} else if (caseSource.value) {
				await store.fetchCases(props.projectId, caseSource.value);
			}
		}
	} catch (error) {
		toast.showError(error, 'Could not load preview scenes');
	} finally {
		hasSettled.value = true;
		sceneIndex.value = 0;
	}
}

async function openCurrentRun() {
	const id = runId.value;
	if (!id) return;
	await store.openRun(props.projectId, props.agentId, id);
	if (store.isRunInFlight(id)) {
		store.startPollingRun(props.projectId, props.agentId, id);
	}
}

const generating = ref(false);
async function onGenerate() {
	generating.value = true;
	try {
		const { cases: generated } = await store.generateDraftCases(props.projectId, props.agentId);
		toast.showMessage({
			title: `Drafted ${generated.length} scenes from the agent's instructions`,
			type: 'success',
		});
		await load();
	} catch (error) {
		toast.showError(error, 'Could not generate scenes');
	} finally {
		generating.value = false;
	}
}

async function onRun() {
	const current = dataset.value;
	if (!current) return;
	try {
		await store.startRun(props.projectId, props.agentId, current.id);
	} catch (error) {
		toast.showError(error, 'Could not run the scenes');
	}
}

function onVote(vote: AgentEvalVote) {
	const id = runId.value;
	const result = currentResult.value;
	if (!id || !result) return;
	store.beginVote(id, result.id, vote);
	if (vote === 'up' && !store.wouldDiscardOnAgreement(id, result.id)) {
		void saveCurrent();
	}
}

async function saveCurrent() {
	const id = runId.value;
	const result = currentResult.value;
	if (!id || !result) return;
	try {
		await store.saveReview(props.projectId, props.agentId, id, result.id);
		flyToEvalsTab();
	} catch (error) {
		toast.showError(error, 'Could not save the review');
	}
}

const windowWrapper = ref<HTMLElement | null>(null);

/** Clone the scene and fly it into the Evals tab so the save has a visible destination */
function flyToEvalsTab() {
	const source = windowWrapper.value;
	const tabs = document.querySelector('[data-testid="agent-header-tabs"]');
	const target = tabs
		? Array.from(tabs.querySelectorAll<HTMLElement>('*')).find(
				(el) => el.childElementCount === 0 && el.textContent?.trim() === 'Evals',
			)
		: undefined;
	if (!source || !target) return;

	const from = source.getBoundingClientRect();
	const to = target.getBoundingClientRect();
	const ghost = source.cloneNode(true) as HTMLElement;
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
		transition: 'transform 480ms cubic-bezier(0.4, 0, 0.2, 1), opacity 480ms ease-in',
	});
	document.body.appendChild(ghost);
	requestAnimationFrame(() => {
		const scale = Math.max(0.04, Math.min(to.width / from.width, to.height / from.height));
		const dx = to.left + to.width / 2 - (from.left + (from.width * scale) / 2);
		const dy = to.top + to.height / 2 - (from.top + (from.height * scale) / 2);
		ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
		ghost.style.opacity = '0.15';
		setTimeout(() => ghost.remove(), 500);
	});
}

function onCancelDraft() {
	if (runId.value && currentResult.value) {
		store.cancelDraft(runId.value, currentResult.value.id);
	}
}

function previousScene() {
	sceneIndex.value = Math.max(0, sceneIndex.value - 1);
}

function nextScene() {
	sceneIndex.value = Math.min(sceneCount.value - 1, sceneIndex.value + 1);
}

watch(runId, (id, previous) => {
	if (id && id !== previous) void openCurrentRun();
});

// A dataset can appear from outside this tab (the assistant thread's
// "Generate test cases" lands here) — fetch its cases as soon as it exists.
watch(
	() => dataset.value?.id,
	(id, previous) => {
		if (id && id !== previous && !runId.value && caseSource.value) {
			void store.fetchCases(props.projectId, caseSource.value);
			sceneIndex.value = 0;
		}
	},
);

watch(inFlight, (now, was) => {
	if (was && !now) void openCurrentRun();
});

watch(sceneCount, (count) => {
	if (sceneIndex.value > Math.max(0, count - 1)) sceneIndex.value = Math.max(0, count - 1);
});

onMounted(load);
watch(() => props.agentId, load);
onBeforeUnmount(store.stopPollingRun);
</script>

<template>
	<div :class="$style.stage" data-testid="agent-preview-stage">
		<template v-if="mode === 'unsaved'">
			<N8nText color="text-light">Save the agent to see its first scenes.</N8nText>
		</template>

		<template v-else-if="mode === 'loading'">
			<span :class="$style.stageHint">Setting the stage…</span>
		</template>

		<template v-else-if="mode === 'generating'">
			<div :class="$style.emptyState">
				<span :class="$style.emptyTitle">Drafting scenes…</span>
				<span :class="$style.emptyBody">
					Writing realistic requests from the agent's instructions, including a few that try to
					break its rules.
				</span>
			</div>
		</template>

		<template v-else-if="mode === 'empty'">
			<div :class="$style.emptyState">
				<span :class="$style.emptyTitle">See your agent before anyone else does</span>
				<span :class="$style.emptyBody">
					I'll draft realistic scenes from the agent's instructions and play them where the output
					will live. Rate what you see — every verdict becomes a test case in Evals.
				</span>
				<N8nButton
					variant="solid"
					size="large"
					:disabled="disabled"
					:loading="generating || store.isGeneratingCases(agentId)"
					data-testid="agent-preview-generate"
					@click="onGenerate"
				>
					Generate scenes
				</N8nButton>
			</div>
		</template>

		<template v-else>
			<div :class="$style.stageTop">
				<span :class="$style.stageHint">Scene {{ sceneIndex + 1 }} of {{ sceneCount }}</span>
				<span v-if="mode === 'run'" :class="$style.stageHint">
					{{ reviewedCount }} of {{ sceneCount }} saved to Evals
				</span>
			</div>

			<div ref="windowWrapper" :class="$style.windowWrapper">
				<SlackWindow :channel-name="channelName">
					<SlackMessage :author-name="PERSONA_NAME" :time="sceneTime" :text="requestText" />
					<SlackMessage
						v-if="mode === 'run'"
						:author-name="agentDisplayName"
						:time="sceneTime"
						:text="resultStatus === 'error' ? 'The agent errored on this scene.' : answerText"
						:pending="resultStatus === 'running' || resultStatus === 'new'"
						:error="resultStatus === 'error'"
						app-badge
						avatar-color="#E8912D"
					/>
				</SlackWindow>
			</div>

			<div v-if="mode === 'cases' && whatToCheck" :class="$style.checkHint">
				<span :class="$style.checkLabel">Checking for:</span> {{ whatToCheck }}
			</div>

			<div :class="$style.stageControls">
				<div :class="$style.pagerGroup">
					<button
						:class="$style.pagerButton"
						:disabled="sceneIndex === 0"
						data-testid="agent-preview-previous"
						@click="previousScene"
					>
						‹ Previous
					</button>
					<button
						:class="$style.pagerButton"
						:disabled="sceneIndex >= sceneCount - 1"
						data-testid="agent-preview-next"
						@click="nextScene"
					>
						Next ›
					</button>
				</div>
				<div :class="$style.verdictGroup">
					<template v-if="mode === 'cases'">
						<N8nButton
							variant="solid"
							size="medium"
							:disabled="disabled || canRun === false || !dataset"
							:loading="dataset ? store.isStartingRun(dataset.id) : false"
							data-testid="agent-preview-run"
							@click="onRun"
						>
							▶ Play {{ sceneCount }} scenes
						</N8nButton>
					</template>
					<template v-else-if="mode === 'run' && currentResult">
						<button
							:class="[$style.thumbDownButton, currentVote === 'down' && $style.thumbDownSelected]"
							:disabled="disabled || resultStatus !== 'success'"
							title="Not right"
							data-testid="agent-preview-vote-down"
							@click="onVote('down')"
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M17 14V2" />
								<path
									d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
								/>
							</svg>
						</button>
						<button
							:class="[$style.looksGoodButton, currentVote === 'up' && $style.looksGoodSelected]"
							:disabled="disabled || resultStatus !== 'success'"
							data-testid="agent-preview-vote-up"
							@click="onVote('up')"
						>
							<svg
								width="17"
								height="17"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M7 10v12" />
								<path
									d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
								/>
							</svg>
							Looks good
						</button>
					</template>
				</div>
			</div>

			<div v-if="showReason" :class="$style.reasonCard">
				<span :class="$style.reasonTitle">What's wrong with this reply?</span>
				<textarea
					v-model="draftComment"
					:class="$style.reasonInput"
					placeholder="e.g. It shouldn't promise a filing date — that's out of scope."
					rows="2"
					data-testid="agent-preview-reason"
				/>
				<div :class="$style.reasonActions">
					<button :class="$style.reasonCancel" @click="onCancelDraft">Cancel</button>
					<N8nButton
						variant="solid"
						size="small"
						:disabled="!(rowView?.kind === 'editing' && rowView.canSave)"
						data-testid="agent-preview-save-reason"
						@click="saveCurrent"
					>
						Save to Evals
					</N8nButton>
				</div>
			</div>
		</template>
	</div>
</template>

<style lang="scss" module>
.stage {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-start;
	gap: 14px;
	width: 100%;
	flex-grow: 1;
	min-height: 0;
	padding: 40px;
	background: radial-gradient(120% 130% at 50% 0%, #4a154b 0%, #2c0b2d 55%, #1a061b 100%);
}

.windowWrapper {
	display: flex;
	width: 100%;
	max-width: 680px;
	flex-grow: 1;
	min-height: 0;
}

.stageTop {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	max-width: 680px;
}

.stageHint {
	font-size: var(--font-size--2xs);
	color: rgba(255, 255, 255, 0.65);
	font-variant-numeric: tabular-nums;
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	max-width: 440px;
	margin: auto 0;
	text-align: center;
}

.emptyTitle {
	font-size: var(--font-size--lg);
	font-weight: var(--font-weight--bold);
	color: #fff;
}

.emptyBody {
	font-size: var(--font-size--2xs);
	line-height: var(--line-height--md);
	color: rgba(255, 255, 255, 0.7);
	text-wrap: pretty;
}

.checkHint {
	width: 100%;
	max-width: 680px;
	font-size: var(--font-size--2xs);
	color: rgba(255, 255, 255, 0.65);
	text-wrap: pretty;
}

.checkLabel {
	font-weight: var(--font-weight--bold);
	color: rgba(255, 255, 255, 0.85);
}

.stageControls {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	max-width: 680px;
}

.pagerGroup {
	display: flex;
	gap: 8px;
}

.pagerButton {
	background: rgba(255, 255, 255, 0.08);
	border: 1px solid rgba(255, 255, 255, 0.25);
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--2xs);
	padding: 6px 12px;
	cursor: pointer;
	transition-property: scale, background-color;
	transition-duration: 100ms;

	&:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.16);
	}

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.35;
		cursor: default;
	}
}

.verdictGroup {
	display: flex;
	align-items: center;
	gap: 10px;
}

.thumbDownButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 40px;
	background: #fff;
	border: 1px solid rgba(0, 0, 0, 0.15);
	border-radius: var(--radius--md);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.thumbDownSelected {
	border-color: var(--color--primary);
	color: var(--color--primary);
}

.looksGoodButton {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 40px;
	padding: 0 16px;
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius--md);
	color: #fff;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	cursor: pointer;
	transition-property: scale, filter;
	transition-duration: 100ms;

	&:hover:not(:disabled) {
		filter: brightness(1.05);
	}

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.looksGoodSelected {
	filter: saturate(0.7) brightness(0.95);
}

.reasonCard {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
	max-width: 680px;
	background: var(--color--background--light-2, #fff);
	border-radius: var(--radius--lg);
	padding: 12px;
}

.reasonTitle {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.reasonInput {
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	font-family: var(--font-family);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	padding: 8px;
	resize: vertical;
}

.reasonActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
}

.reasonCancel {
	background: transparent;
	border: none;
	color: var(--color--text--tint-1);
	font-size: var(--font-size--2xs);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}
</style>
