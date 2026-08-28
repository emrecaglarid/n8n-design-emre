<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { N8nText } from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';

import { useAgentEvalsStore } from '@/features/agents/agentEvals.store';
import { useAgentChatStream } from '@/features/agents/composables/useAgentChatStream';
import { isDataTableDataset, toCaseSource } from '@/features/agents/utils/agentEvalCases.utils';
import SlackWindow from '@/experiments/destinationPreviews/slack/SlackWindow.vue';
import SlackMessage from '@/experiments/destinationPreviews/slack/SlackMessage.vue';
import DestinationDropdown from '@/experiments/destinationPreviews/DestinationDropdown.vue';
import AudienceDropdown from '@/experiments/destinationPreviews/AudienceDropdown.vue';
import type { PreviewDestination } from '@/experiments/destinationPreviews/surfaceDial';
import { useAgentCrewStore } from '@/experiments/agentCrew/agentCrew.store';

/**
 * AI Trust prototype: chat with the agent where its output will actually live.
 * The composer is a real chat session; the suggestion chips are drafted
 * requests from the agent's own instructions. Judging a reply quietly captures
 * the exchange as a case — the eval set accumulates without the words "eval",
 * "test" or "sample" ever appearing on this surface.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
	agentName?: string;
	disabled?: boolean;
	canRun?: boolean;
	agentUnsaved?: boolean;
}>();

const toast = useToast();
const store = useAgentEvalsStore();

const projectIdRef = computed(() => props.projectId);
const agentIdRef = computed(() => props.agentId);

/** One preview conversation per agent per browser tab */
function resolveSessionId(): string {
	const key = `n8n-agent-preview-session:${props.agentId}`;
	let id = sessionStorage.getItem(key);
	if (!id) {
		id = crypto.randomUUID();
		sessionStorage.setItem(key, id);
	}
	return id;
}
const sessionId = ref<string | undefined>(resolveSessionId());

const chat = useAgentChatStream({
	projectId: projectIdRef,
	agentId: agentIdRef,
	continueSessionId: sessionId,
});

const agentDisplayName = computed(() => props.agentName?.trim() || 'Your agent');

// ── Destination: where this session's outputs live. Preview sends nothing;
//    a test destination swaps the window to that defused channel. ────────────
const destination = ref<PreviewDestination>({ kind: 'preview' });
const channelName = computed(() =>
	destination.value.kind === 'test' ? destination.value.channel : 'client-requests',
);

// ── Audience: who can see this preview. Visual state only. ──────────────────
const audience = ref<'you' | 'team'>('you');

// ── Tester probes and fix replays staged from the crew panel ─────────────────
const crew = useAgentCrewStore();
const stagedFinding = computed(() => crew.getStagedFinding(props.agentId));
const stagedProposal = computed(() => crew.getStagedProposal(props.agentId));

const displayMessages = computed(() =>
	chat.messages.value.filter((message) => {
		if (message.role === 'user') return true;
		if (message.role !== 'assistant') return false;
		// Tool-call placeholders arrive as empty assistant messages; keep an empty
		// bubble only while it is actively streaming (it renders as typing dots).
		return Boolean(message.content) || message.status === 'streaming';
	}),
);

// ── Suggestion chips: drafted requests from the eval machinery, shown as
//    plain "things you could ask" ────────────────────────────────────────────
const dataset = computed(() => store.getDatasets(props.agentId)[0]);
const caseSource = computed(() => {
	const current = dataset.value;
	if (!current || !isDataTableDataset(current)) return null;
	return toCaseSource(current);
});
const cases = computed(() => (dataset.value ? store.getCases(dataset.value.id) : []));
const usedChipRowIds = ref<Set<number>>(new Set());
const chipCases = computed(() =>
	cases.value.filter((candidate) => !usedChipRowIds.value.has(candidate.rowId)).slice(0, 2),
);

const suggesting = ref(false);
async function onSuggest() {
	suggesting.value = true;
	try {
		await store.generateDraftCases(props.projectId, props.agentId);
		await loadSuggestions();
	} catch (error) {
		toast.showError(error, 'Could not draft suggestions');
	} finally {
		suggesting.value = false;
	}
}

async function loadSuggestions() {
	try {
		await store.fetchDatasets(props.projectId, props.agentId);
		if (caseSource.value) await store.fetchCases(props.projectId, caseSource.value);
	} catch {
		// The chips are a convenience — the composer works without them.
	}
}

// ── Sending ──────────────────────────────────────────────────────────────────
const draft = ref('');

/** The exchange currently on judgement: what was asked, and its case row if known */
const lastExchange = ref<{ text: string; rowId?: number } | null>(null);
const votedVote = ref<'up' | 'down' | null>(null);
const showReason = ref(false);
const reasonText = ref('');

async function sendText(text: string, rowId?: number) {
	const trimmed = text.trim();
	if (!trimmed || chat.isStreaming.value) return;
	draft.value = '';
	votedVote.value = null;
	showReason.value = false;
	reasonText.value = '';
	lastExchange.value = { text: trimmed, rowId };
	if (rowId !== undefined) {
		usedChipRowIds.value = new Set([...usedChipRowIds.value, rowId]);
	}
	try {
		await chat.sendMessage(trimmed);
	} catch (error) {
		toast.showError(error, 'The agent did not respond');
	}
}

function onSendDraft() {
	void sendText(draft.value);
}

// ── Judging: quiet capture into the case set ────────────────────────────────
const canJudge = computed(() => {
	const messages = displayMessages.value;
	const last = messages[messages.length - 1];
	return (
		!chat.isStreaming.value &&
		last?.role === 'assistant' &&
		last.status !== 'error' &&
		lastExchange.value !== null
	);
});

function onVote(vote: 'up' | 'down') {
	if (!canJudge.value) return;
	if (vote === 'down') {
		votedVote.value = 'down';
		showReason.value = true;
		return;
	}
	votedVote.value = 'up';
	void captureExchange('');
}

async function saveReason() {
	const reason = reasonText.value.trim();
	if (!reason) return;
	showReason.value = false;
	// The verdict has a consequence: it lands in the builder thread, where the
	// Builder turns the reason into a proposed instruction change.
	const exchange = lastExchange.value;
	const lastReply = [...displayMessages.value]
		.reverse()
		.find((message) => message.role === 'assistant' && message.content);
	if (exchange && lastReply) {
		crew.reportStageVerdict(props.agentId, {
			request: exchange.text,
			reply: lastReply.content,
			reason,
		});
	}
	await captureExchange(reason);
	reasonText.value = '';
}

function cancelReason() {
	showReason.value = false;
	reasonText.value = '';
	votedVote.value = null;
}

/** The replay looked right: unstage it and get back to the session. */
function onKeepFix() {
	crew.stageProposal(props.agentId, null);
}

async function captureExchange(whatToCheck: string) {
	const exchange = lastExchange.value;
	const source = caseSource.value;
	if (!exchange || !source) return;
	try {
		if (exchange.rowId !== undefined) {
			if (whatToCheck) {
				await store.updateCase(props.projectId, source, exchange.rowId, {
					input: exchange.text,
					whatToCheck,
				});
			}
		} else {
			await store.createCase(props.projectId, source, {
				input: exchange.text,
				whatToCheck,
			});
		}
		flyToEvalsTab();
	} catch (error) {
		toast.showError(error, 'Could not save that');
	}
}

// ── Fly-to-Evals: the judgement's visible destination ───────────────────────
const windowWrapper = ref<HTMLElement | null>(null);

function flyToEvalsTab() {
	const source = windowWrapper.value;
	const tabs = document.querySelector('[data-testid="agent-header-tabs"]');
	const target = tabs
		? Array.from(tabs.querySelectorAll<HTMLElement>('*')).find(
				(el) => el.childElementCount === 0 && el.textContent?.trim() === 'Outputs',
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

onMounted(() => {
	void chat.loadHistory();
	void loadSuggestions();
});
</script>

<template>
	<div :class="$style.stage" data-testid="agent-preview-stage">
		<template v-if="agentUnsaved">
			<N8nText color="text-light">Save the agent to try it out.</N8nText>
		</template>

		<template v-else>
			<div :class="$style.stageToolbar">
				<DestinationDropdown v-model="destination" dark />
				<AudienceDropdown v-model="audience" dark />
			</div>

			<div ref="windowWrapper" :class="$style.windowWrapper">
				<SlackWindow
					v-model="draft"
					:channel-name="channelName"
					simulated-label=""
					interactive
					:send-disabled="chat.isStreaming.value || disabled"
					@send="onSendDraft"
				>
					<div :class="$style.channelIntro">
						This is the very beginning of <b>#{{ channelName }}</b
						>. {{ agentDisplayName }} is here — say something to see how it responds.
					</div>
					<SlackMessage
						v-for="message in displayMessages"
						:key="message.id"
						:author-name="message.role === 'user' ? 'You' : agentDisplayName"
						:text="message.content"
						:app-badge="message.role === 'assistant'"
						:avatar-color="message.role === 'assistant' ? '#E8912D' : '#4A7DAB'"
						:pending="message.status === 'streaming' && !message.content"
						:error="message.status === 'error'"
					/>

					<template v-if="stagedFinding">
						<div :class="$style.threadDivider">
							<span :class="$style.dividerLine" />
							<span :class="$style.dividerLabel">Tester's probe · separate session</span>
							<span :class="$style.dividerLine" />
						</div>
						<SlackMessage
							author-name="Tester · simulated user"
							:text="stagedFinding.input"
							avatar-color="#3C8C69"
						/>
						<SlackMessage
							:author-name="agentDisplayName"
							:text="stagedFinding.reply"
							app-badge
							avatar-color="#E8912D"
						/>
						<div v-if="stagedFinding.whatToCheck" :class="$style.stagedCheckNote">
							The Tester's question: {{ stagedFinding.whatToCheck }}
						</div>
					</template>

					<template v-if="stagedProposal">
						<div :class="$style.threadDivider">
							<span :class="$style.dividerLine" />
							<span :class="$style.dividerLabel">Before the fix</span>
							<span :class="$style.dividerLine" />
						</div>
						<div :class="$style.dimmed">
							<SlackMessage
								:author-name="agentDisplayName"
								:text="stagedProposal.beforeReply"
								app-badge
								avatar-color="#E8912D"
							/>
						</div>
						<div :class="$style.threadDivider">
							<span :class="$style.dividerLine" />
							<span :class="$style.dividerLabel">Same request, replayed after the fix</span>
							<span :class="$style.dividerLine" />
						</div>
						<SlackMessage
							:author-name="agentDisplayName"
							:text="stagedProposal.afterReply"
							app-badge
							avatar-color="#E8912D"
						/>
					</template>
					<template #beforeComposer>
						<div v-if="chipCases.length > 0 || cases.length === 0" :class="$style.chipRow">
							<button
								v-for="chip in chipCases"
								:key="chip.rowId"
								:class="$style.chip"
								:disabled="chat.isStreaming.value || disabled"
								data-testid="agent-preview-suggestion"
								@click="sendText(chip.input, chip.rowId)"
							>
								{{ chip.input }}
							</button>
							<button
								v-if="cases.length === 0"
								:class="[$style.chip, $style.suggestChip]"
								:disabled="suggesting || disabled"
								data-testid="agent-preview-suggest"
								@click="onSuggest"
							>
								{{ suggesting ? 'Thinking…' : '✨ Suggest something to ask' }}
							</button>
						</div>
					</template>
				</SlackWindow>
			</div>

			<div :class="$style.stageControls">
				<span :class="$style.stageHint">{{ canJudge ? 'How was that reply?' : '' }}</span>
				<div :class="$style.verdictGroup">
					<button
						:class="[$style.thumbDownButton, votedVote === 'down' && $style.thumbDownSelected]"
						:disabled="!canJudge"
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
						:class="[$style.looksGoodButton, votedVote === 'up' && $style.looksGoodSelected]"
						:disabled="stagedProposal ? false : !canJudge"
						data-testid="agent-preview-vote-up"
						@click="stagedProposal ? onKeepFix() : onVote('up')"
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
						{{ stagedProposal ? 'Fixed — keep it' : 'Looks good' }}
					</button>
				</div>
			</div>

			<div v-if="showReason" :class="$style.reasonCard">
				<span :class="$style.reasonTitle">What's wrong with this reply?</span>
				<textarea
					v-model="reasonText"
					:class="$style.reasonInput"
					placeholder="e.g. It shouldn't promise a filing date — that's out of scope."
					rows="2"
					data-testid="agent-preview-reason"
				/>
				<div :class="$style.reasonActions">
					<button :class="$style.reasonCancel" @click="cancelReason">Cancel</button>
					<button
						:class="$style.reasonSave"
						:disabled="!reasonText.trim()"
						data-testid="agent-preview-save-reason"
						@click="saveReason"
					>
						Save
					</button>
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
	padding: 32px 40px;
	background: radial-gradient(120% 130% at 50% 0%, #4a154b 0%, #2c0b2d 55%, #1a061b 100%);
}

.windowWrapper {
	display: flex;
	width: 100%;
	max-width: 680px;
	flex-grow: 1;
	min-height: 0;
}

.stageToolbar {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	width: 100%;
	max-width: 680px;
}

.threadDivider {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 4px 20px;
}

.dividerLine {
	flex: 1;
	height: 1px;
	background: rgba(29, 28, 29, 0.13);
}

.dividerLabel {
	flex-shrink: 0;
	font-size: 11px;
	color: #616061;
}

.dimmed {
	opacity: 0.6;
}

.stagedCheckNote {
	margin: 4px 20px 0;
	padding: 6px 10px;
	border-radius: var(--radius);
	background: rgba(60, 140, 105, 0.12);
	border: 1px dashed rgba(60, 140, 105, 0.5);
	font-size: 12px;
	color: #2c6e50;
	text-wrap: pretty;
}

.channelIntro {
	padding: 4px 20px 12px;
	font-size: 13px;
	color: #616061;
	text-wrap: pretty;
}

.chipRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.chip {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	background: #fff;
	border: 1px solid rgba(29, 28, 29, 0.25);
	border-radius: 16px;
	padding: 5px 12px;
	font-size: 12px;
	color: #1d1c1d;
	cursor: pointer;
	transition-property: scale, background-color;
	transition-duration: 100ms;

	&:hover:not(:disabled) {
		background: #f6f6f6;
	}

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.suggestChip {
	border-style: dashed;
	color: #616061;
}

.stageControls {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	max-width: 680px;
}

.stageHint {
	font-size: var(--font-size--2xs);
	color: rgba(255, 255, 255, 0.65);
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
		opacity: 0.4;
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
		opacity: 0.4;
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

.reasonSave {
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	padding: 6px 14px;
	cursor: pointer;

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}
</style>
