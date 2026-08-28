<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { N8nAvatar, N8nIcon, N8nTooltip } from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';
import { useUsersStore } from '@n8n/stores/users.store';

import { useAgentEvalsStore } from '@/features/agents/agentEvals.store';
import type { AgentEvalResultRecord } from '@/features/agents/agentEvals.types';
import { readAgentAnswer, readCaseRequest } from '@/features/agents/utils/agent-eval-review';
import { isDataTableDataset, toCaseSource } from '@/features/agents/utils/agentEvalCases.utils';

/**
 * AI Trust prototype: the agent's Outputs tab in the run-grouped layout —
 * what was asked, what the agent answered, and who tried it. Data comes from
 * the latest run of the quietly collected requests; judging itself happens on
 * the Preview stage, this is the record.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
	agentName?: string;
}>();

const store = useAgentEvalsStore();
const usersStore = useUsersStore();
const toast = useToast();

const loading = ref(true);
const runId = ref<string | null>(null);

const dataset = computed(() => store.getDatasets(props.agentId)[0]);
const review = computed(() => (runId.value ? store.getReview(runId.value) : null));
const results = computed(() => review.value?.results ?? []);

const connectMenuOpen = ref(false);
const openImproveId = ref<string | null>(null);

const agentDisplayName = computed(() => props.agentName?.trim() || 'Your agent');

function requestOf(result: AgentEvalResultRecord): string {
	return readCaseRequest(result.input);
}

function answerOf(result: AgentEvalResultRecord): string {
	return readAgentAnswer(result.output) ?? '(no answer)';
}

function ratingOf(result: AgentEvalResultRecord) {
	return review.value?.ratingsByResultId[result.id] ?? null;
}

function verdictTooltip(result: AgentEvalResultRecord): string {
	const rating = ratingOf(result);
	if (!rating) return '';
	const emoji = rating.vote === 'up' ? '👍' : '👎';
	return rating.comment ? `${emoji} ${rating.comment}` : emoji;
}

/** Requests in the set that the latest run hasn't tried */
const untriedCases = computed(() => {
	const current = dataset.value;
	if (!current) return [];
	const triedRowIds = new Set(
		results.value.map((result) => result.sourceRowId).filter((id) => id !== null),
	);
	return store
		.getCases(current.id)
		.filter((candidate) => !triedRowIds.has(String(candidate.rowId)))
		.slice(0, 3);
});

async function onCopy(result: AgentEvalResultRecord) {
	try {
		await navigator.clipboard.writeText(answerOf(result));
		toast.showMessage({ title: 'Copied', type: 'success' });
	} catch {
		toast.showMessage({ title: 'Could not copy', type: 'error' });
	}
}

function onTryNewCase() {
	toast.showMessage({
		title: 'Try it on the stage',
		message: 'Ask the Tester in the builder thread, or send a request from the Preview tab.',
		type: 'info',
	});
}

/** Real export: requests, answers, and the judgments attached to them. */
function onExport() {
	connectMenuOpen.value = false;
	const payload = results.value.map((result) => ({
		request: requestOf(result),
		answer: answerOf(result),
		rating: ratingOf(result) ?? undefined,
	}));
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `agent-outputs-${props.agentId}.json`;
	link.click();
	URL.revokeObjectURL(url);
}

onMounted(async () => {
	try {
		await store.fetchDatasets(props.projectId, props.agentId);
		const current = dataset.value;
		if (!current) return;
		if (isDataTableDataset(current)) {
			const source = toCaseSource(current);
			if (source) await store.fetchCases(props.projectId, source).catch(() => null);
		}
		const latest = await store.resolveLatestRunId(props.projectId, props.agentId, current.id);
		if (!latest) return;
		runId.value = latest;
		await store.openRun(props.projectId, props.agentId, latest);
		if (store.isRunInFlight(latest)) {
			store.startPollingRun(props.projectId, props.agentId, latest);
		}
	} catch {
		// The empty state covers it.
	} finally {
		loading.value = false;
	}
});

onBeforeUnmount(() => store.stopPollingRun());
</script>

<template>
	<div :class="$style.view" data-testid="agent-outputs-view">
		<div :class="$style.headerRow">
			<span :class="$style.title">Outputs</span>
			<span :class="$style.headerActions">
				<span :class="$style.connectWrapper">
					<button :class="$style.ghostButton" @click="connectMenuOpen = !connectMenuOpen">
						Connect external tools
					</button>
					<span v-if="connectMenuOpen" :class="$style.menu">
						<button :class="$style.menuOption" @click="onExport">
							<span :class="$style.menuName">Export judged answers</span>
							<span :class="$style.menuHint">JSON of requests, answers, verdicts</span>
						</button>
						<span :class="$style.menuOption">
							<span :class="$style.menuName">n8n LangTracer</span>
							<span :class="$style.menuHint">watches new answers · zero setup — not wired yet</span>
						</span>
						<span :class="$style.menuOption">
							<span :class="$style.menuName">LangSmith</span>
							<span :class="$style.menuHint"
								>sends judged pairs to your workspace — not wired yet</span
							>
						</span>
						<span :class="$style.menuOption">
							<span :class="$style.menuName">OpenTelemetry</span>
							<span :class="$style.menuHint">traces to your own collector — not wired yet</span>
						</span>
					</span>
				</span>
				<button :class="$style.primaryButton" data-testid="agent-outputs-try" @click="onTryNewCase">
					Try a new case
				</button>
			</span>
		</div>

		<div v-if="loading" :class="$style.empty">Loading…</div>
		<div v-else-if="results.length === 0" :class="$style.empty">
			Nothing here yet — try the agent on the Preview stage, or let the Tester have a go. Judged
			replies land here.
		</div>

		<div v-else :class="$style.list">
			<div v-for="result in results" :key="result.id" :class="$style.group">
				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Request</span>
					<span :class="$style.triggerChip">
						<N8nIcon icon="message-circle" size="medium" />
						<span :class="$style.triggerText">{{ requestOf(result) }}</span>
					</span>
				</div>

				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Outputs</span>
					<div :class="$style.outputColumn">
						<span :class="$style.outputHeader">
							<N8nIcon icon="bot" size="medium" />
							<span :class="$style.outputName">{{ agentDisplayName }}</span>
						</span>
						<span :class="$style.outputText">{{ answerOf(result) }}</span>
					</div>
				</div>

				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Tried by</span>
					<span :class="$style.triedBy">
						<N8nTooltip v-if="ratingOf(result)" placement="top">
							<template #content>{{ verdictTooltip(result) }}</template>
							<span
								:class="[
									$style.avatarRing,
									ratingOf(result)?.vote === 'down' && $style.avatarRingDown,
								]"
							>
								<N8nAvatar
									:first-name="usersStore.currentUser?.firstName ?? 'You'"
									:last-name="usersStore.currentUser?.lastName ?? ''"
									size="small"
								/>
							</span>
						</N8nTooltip>
						<span v-else :class="$style.notTried">—</span>
					</span>
				</div>

				<div :class="$style.groupActions">
					<span :class="$style.improveWrapper">
						<button
							:class="$style.ghostButton"
							@click="openImproveId = openImproveId === result.id ? null : result.id"
						>
							Improve
						</button>
						<span v-if="openImproveId === result.id" :class="$style.menu">
							<span :class="$style.menuOption">
								<span :class="$style.menuName">Ask the Builder to fix it</span>
								<span :class="$style.menuHint"
									>a 👎 with a reason on the stage does this — the Builder proposes an instruction
									change</span
								>
							</span>
						</span>
					</span>
					<button :class="$style.iconButton" title="Copy answer" @click="onCopy(result)">
						<N8nIcon icon="copy" size="small" />
					</button>
					<button :class="$style.iconButton" title="Share — not wired yet">
						<N8nIcon icon="share" size="small" />
					</button>
				</div>
			</div>
		</div>

		<div v-if="untriedCases.length > 0" :class="$style.drip">
			<span :class="$style.dripTitle">Cases not yet tried:</span>
			<span :class="$style.dripChips">
				<span
					v-for="candidate in untriedCases"
					:key="candidate.rowId"
					:class="$style.dripChip"
					:title="'Try it from the Preview tab or ask the Tester in the builder thread'"
					>Try: {{ candidate.input }}</span
				>
			</span>
		</div>
	</div>
</template>

<style lang="scss" module>
.view {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	width: 100%;
	padding-bottom: var(--spacing--lg);
}

.headerRow {
	display: flex;
	align-items: center;
}

.title {
	font-size: var(--font-size--lg);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.headerActions {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.ghostButton {
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	padding: 6px 14px;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
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

.primaryButton {
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	padding: 7px 14px;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: #fff;
	cursor: pointer;
	transition-property: scale, filter;
	transition-duration: 100ms;

	&:hover {
		filter: brightness(1.05);
	}

	&:active {
		scale: 0.96;
	}
}

.connectWrapper,
.improveWrapper {
	position: relative;
}

.menu {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	z-index: 20;
	display: flex;
	flex-direction: column;
	width: 300px;
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
	overflow: hidden;
}

.menuOption {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1px;
	padding: 8px 12px;
	background: transparent;
	border: none;
	text-align: left;
	cursor: default;

	&:hover {
		background: var(--color--background);
	}
}

button.menuOption {
	cursor: pointer;
}

.menuName {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.menuHint {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}

.empty {
	padding: var(--spacing--xl);
	text-align: center;
	font-size: var(--font-size--sm);
	color: var(--color--text--tint-1);
}

.list {
	display: flex;
	flex-direction: column;
	background: var(--color--background--light-3, #fff);
	border: var(--border);
	border-radius: var(--radius--lg);
}

.group {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	padding: var(--spacing--sm) var(--spacing--md);

	& + & {
		border-top: var(--border);
	}
}

.groupRow {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--md);
}

.railLabel {
	flex: 0 0 120px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	padding-top: var(--spacing--4xs);
}

.triggerChip {
	display: inline-flex;
	align-items: flex-start;
	gap: var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius);
	padding: var(--spacing--2xs) var(--spacing--xs);
	color: var(--color--text--tint-1);
}

.triggerText {
	font-size: var(--font-size--xs);
	color: var(--color--text);
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.outputColumn {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.outputHeader {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding-bottom: var(--spacing--3xs);
	border-bottom: var(--border);
	color: var(--color--text);
}

.outputName {
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.outputText {
	font-size: var(--font-size--sm);
	color: var(--color--text);
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-height: 220px;
	overflow-y: auto;
}

.triedBy {
	display: flex;
	align-items: center;
}

.avatarRing {
	display: inline-flex;
	border-radius: 50%;
	box-shadow: 0 0 0 2px var(--color--success);
}

.avatarRingDown {
	box-shadow: 0 0 0 2px var(--color--warning);
}

.notTried {
	color: var(--color--text--tint-1);
}

.groupActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--spacing--2xs);
}

.iconButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 30px;
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	color: var(--color--text);
	cursor: pointer;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}

.drip {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.dripTitle {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.dripChips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--2xs);
}

.dripChip {
	background: var(--color--foreground--tint-1, #ececec);
	border-radius: 15px;
	padding: 5px 14px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: default;
	max-width: 420px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
