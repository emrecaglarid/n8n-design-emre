<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { GOOGLE_GMAIL_NODE_TYPE } from '@/app/constants/nodeTypes';
import {
	FINDING_SOURCES,
	createFinding,
	scopeLabel,
	type Finding,
	type FindingCause,
	type FindingScope,
} from '@/experiments/findings/findings';
import { useVariantsStore } from '@/experiments/variants/variants.store';
import { useOutputProvenance } from '@/experiments/outputProvenance/useOutputProvenance';
import type { ProvenanceResult } from '@/experiments/outputProvenance/outputProvenance';
import type { OutputVerdict, SimulatedPreview } from '../simulatedOutputPreview.store';

/**
 * AI Trust prototype: what happens after a thumbs down.
 *
 * The output opens editable in place, because research says people correct
 * rather than explain — a regenerated candidate would only be another thing to
 * judge. Chips are accelerators, not labels. Scope follows the selection: with
 * nothing selected a note is about the whole output, and selecting text in the
 * output scopes it to that span. One Save commits one verdict with N findings.
 */
const props = withDefaults(
	defineProps<{
		preview: SimulatedPreview;
		/** Which button was pressed, so the verdict starts where the user already is */
		initialVerdict?: OutputVerdict;
	}>(),
	{ initialVerdict: 'not-right' },
);

const emit = defineEmits<{
	save: [
		details: {
			verdict: OutputVerdict;
			reason: string;
			correction?: string;
			findings: Finding[];
		},
	];
	cancel: [];
}>();

const nodeTypesStore = useNodeTypesStore();
const variants = useVariantsStore();
const provenance = useOutputProvenance();
const nodeType = computed(() => nodeTypesStore.getNodeType(props.preview.nodeType));

const title = computed(() => {
	if (props.preview.kind === 'slack') return 'Slack message';
	return props.preview.nodeType === GOOGLE_GMAIL_NODE_TYPE ? 'Gmail' : 'Email';
});

const REASON_CHIPS = ['Wrong data', 'Too long', 'Wrong tone', 'Off-brand', "Shouldn't send at all"];

/** Scoping only exists when the annotation direction is on */
const canScope = computed(() => variants.annotation === 'on');

// ── The verdict, so a nitpick doesn't mark the whole output rejected ─────────
const verdict = ref<OutputVerdict>(props.initialVerdict);

// ── The output itself, editable (Model A') ───────────────────────────────────
const originalText = computed(() =>
	props.preview.kind === 'slack' ? (props.preview.messageText ?? '') : (props.preview.body ?? ''),
);
const outputText = ref(originalText.value);
const outputEl = ref<HTMLTextAreaElement | null>(null);

const wasEdited = computed(() => outputText.value.trim() !== originalText.value.trim());

// ── Scope: whatever is selected in the output, else the whole thing ──────────
const scope = ref<FindingScope>({ kind: 'whole' });

function onOutputSelect() {
	if (!canScope.value) return;
	const el = outputEl.value;
	if (!el) return;
	const selected = outputText.value.slice(el.selectionStart, el.selectionEnd).trim();
	// A caret, or a stray drag, is not a scope.
	if (selected.length < 2) return;
	scope.value = { kind: 'span', text: selected };
	traceScope();
}

function clearScope() {
	scope.value = { kind: 'whole' };
	cause.value = null;
	// The selection *is* the scope, so a live range would immediately re-arm it.
	const el = outputEl.value;
	if (el) el.setSelectionRange(el.selectionEnd, el.selectionEnd);
}

// ── Where the value came from ────────────────────────────────────────────────
// Traced as soon as something is selected, so it informs the note the user is
// about to write instead of arriving after they have already decided.
const cause = ref<ProvenanceResult | null>(null);

function traceScope() {
	if (variants.localization === 'off' || scope.value.kind !== 'span') {
		cause.value = null;
		return;
	}
	cause.value = provenance.trace(scope.value.text, props.preview.nodeName);
}

const causeText = computed(() => {
	const result = cause.value;
	if (!result) return '';
	switch (result.kind) {
		case 'passed-through':
			return `${result.nodeName} produced this value — it was passed through, not written.`;
		case 'generated':
			return provenance.hasModelUpstream(props.preview.nodeName)
				? 'No step in this run carries this text — a model wrote it, so instructions are the lever.'
				: `No step in this run carries this text — it comes from ${props.preview.nodeName}'s own message, so edit it there.`;
		case 'candidates':
			// In ranked mode nothing was ruled out, so don't imply a rewording was found.
			return variants.localization === 'ranked'
				? `These steps were involved — start with ${result.nodeNames.join(', then ')}.`
				: `Reworded somewhere. Most likely ${result.nodeNames.join(', then ')}.`;
		case 'unknown':
			return 'Nothing in this run to trace it against.';
		default:
			return '';
	}
});

/**
 * Traced answers are facts: the value is either carried by an upstream step or
 * it is not. Only a ranked list is a guess, and it should read like one.
 */
const causeIsCertain = computed(
	() => cause.value?.kind === 'passed-through' || cause.value?.kind === 'generated',
);

/** Prompt changes cannot fix a value a node handed over unchanged. */
const suppressInstructionFix = computed(() => cause.value?.kind === 'passed-through');

function findingCause(): FindingCause | undefined {
	const result = cause.value;
	if (!result) return undefined;
	switch (result.kind) {
		case 'passed-through':
			return { kind: 'node', nodeName: result.nodeName, certain: true };
		case 'generated':
			return provenance.hasModelUpstream(props.preview.nodeName)
				? { kind: 'model', certain: true }
				: { kind: 'node', nodeName: props.preview.nodeName, certain: true };
		case 'candidates':
			return { kind: 'node', nodeName: result.nodeNames[0], certain: false };
		case 'unknown':
			return { kind: 'unclear', certain: false };
	}
}

// ── The composer: one box, scoped by the line above it ───────────────────────
const selectedChip = ref<string | null>(null);
const noteText = ref('');
const findings = ref<Finding[]>([]);

const composerHasContent = computed(
	() => selectedChip.value !== null || noteText.value.trim().length > 0,
);

function buildFinding(): Finding | null {
	if (!composerHasContent.value) return null;
	const reason = [selectedChip.value, noteText.value.trim()].filter(Boolean).join(' — ');
	return createFinding({
		source: FINDING_SOURCES.human,
		scope: scope.value,
		body: { reason },
		output: originalText.value,
		cause: findingCause(),
	});
}

/** Commit the composer and start a fresh one, for a second note on the same output. */
async function onAddAnother() {
	const finding = buildFinding();
	if (!finding) return;
	findings.value = [...findings.value, finding];
	selectedChip.value = null;
	noteText.value = '';
	clearScope();
	await nextTick();
}

function removeFinding(id: string) {
	findings.value = findings.value.filter((finding) => finding.id !== id);
}

// A bare thumbs down with nothing attached teaches nothing — but an edited
// output is itself a signal, so it counts.
const canSave = computed(
	() => composerHasContent.value || findings.value.length > 0 || wasEdited.value,
);

function onSave() {
	if (!canSave.value) return;
	const pending = buildFinding();
	const all = pending ? [...findings.value, pending] : [...findings.value];
	const correction = wasEdited.value ? outputText.value.trim() : undefined;
	if (correction && all.length === 0) {
		all.push(
			createFinding({
				source: FINDING_SOURCES.human,
				body: { reason: '', replacement: correction },
				output: originalText.value,
			}),
		);
	} else if (correction && all.length > 0) {
		all[all.length - 1].body.replacement = correction;
	}
	const reason = all
		.map((finding) => finding.body.reason)
		.filter(Boolean)
		.join(' · ');
	emit('save', {
		verdict: verdict.value,
		reason: reason || 'Corrected the output',
		correction,
		findings: all,
	});
}
</script>

<template>
	<Teleport to="body">
		<div :class="$style.scrim" data-test-id="output-verdict-modal" @click.self="emit('cancel')">
			<div :class="$style.modal">
				<div :class="$style.header">
					<NodeIcon :node-type="nodeType" :size="18" />
					<span :class="$style.title">{{ title }}</span>
					<button :class="$style.close" @click="emit('cancel')">
						<N8nIcon icon="x" size="medium" />
					</button>
				</div>

				<div :class="$style.body">
					<div :class="$style.verdictSwitch" data-test-id="output-verdict-switch">
						<button
							:class="[$style.verdictOption, verdict === 'not-right' && $style.verdictActive]"
							data-test-id="output-verdict-not-right"
							@click="verdict = 'not-right'"
						>
							Not right
						</button>
						<button
							:class="[$style.verdictOption, verdict === 'mostly-fine' && $style.verdictActive]"
							data-test-id="output-verdict-mostly-fine"
							@click="verdict = 'mostly-fine'"
						>
							Mostly fine, one issue
						</button>
					</div>

					<div :class="$style.outputBox">
						<template v-if="preview.kind === 'email'">
							<div :class="$style.emailMeta">
								<span><b>To:</b> {{ preview.to }}</span>
								<span><b>From:</b> {{ preview.from }}</span>
								<span><b>Subject:</b> {{ preview.subject }}</span>
							</div>
						</template>
						<template v-else>
							<div :class="$style.emailMeta">
								<span
									><b>#{{ preview.channel?.replace(/^#/, '') }}</b></span
								>
							</div>
						</template>
						<textarea
							ref="outputEl"
							v-model="outputText"
							:class="$style.outputEditable"
							rows="6"
							data-test-id="output-verdict-output"
							@select="onOutputSelect"
							@mouseup="onOutputSelect"
							@keyup="onOutputSelect"
						/>
						<span :class="$style.outputHint">
							{{
								canScope
									? 'Edit it to what it should have said, or select part of it to comment on.'
									: 'Edit it to what it should have said.'
							}}
						</span>
					</div>

					<div v-if="findings.length > 0" :class="$style.noteList">
						<div
							v-for="finding in findings"
							:key="finding.id"
							:class="$style.noteRow"
							data-test-id="output-verdict-note"
						>
							<span :class="$style.noteScope">{{ scopeLabel(finding.scope) }}</span>
							<span :class="$style.noteReason">{{ finding.body.reason }}</span>
							<button :class="$style.noteRemove" @click="removeFinding(finding.id)">
								<N8nIcon icon="x" size="small" />
							</button>
						</div>
					</div>

					<div :class="$style.scopeLine" data-test-id="output-verdict-scope">
						<span :class="$style.scopeText">{{ scopeLabel(scope) }}</span>
						<button
							v-if="scope.kind !== 'whole'"
							:class="$style.scopeClear"
							data-test-id="output-verdict-scope-clear"
							@click="clearScope"
						>
							<N8nIcon icon="x" size="small" />
						</button>
					</div>

					<div
						v-if="causeText"
						:class="[$style.causeStrip, causeIsCertain && $style.causeCertain]"
						data-test-id="output-verdict-cause"
					>
						<span :class="$style.causeLabel">{{ causeIsCertain ? 'TRACED' : 'BEST GUESS' }}</span>
						<span :class="$style.causeText">{{ causeText }}</span>
						<span v-if="suppressInstructionFix" :class="$style.causeNote">
							No instruction change is offered for this — fix it in the node.
						</span>
					</div>

					<div :class="$style.chipRow">
						<button
							v-for="chip in REASON_CHIPS"
							:key="chip"
							:class="[$style.chip, selectedChip === chip && $style.chipSelected]"
							@click="selectedChip = selectedChip === chip ? null : chip"
						>
							{{ chip }}
						</button>
					</div>

					<textarea
						v-model="noteText"
						:class="$style.input"
						rows="2"
						placeholder="Anything to add? (Optional)"
						data-test-id="output-verdict-note-input"
					/>

					<button
						v-if="composerHasContent"
						:class="$style.addAnother"
						data-test-id="output-verdict-add-another"
						@click="onAddAnother"
					>
						+ Add another note
					</button>
				</div>

				<div :class="$style.footer">
					<button :class="$style.cancelButton" @click="emit('cancel')">Cancel</button>
					<button
						:class="$style.saveButton"
						:disabled="!canSave"
						data-test-id="output-verdict-save"
						@click="onSave"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<style lang="scss" module>
.scrim {
	position: fixed;
	inset: 0;
	z-index: 2000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.45);
}

.modal {
	display: flex;
	flex-direction: column;
	width: 566px;
	max-width: 92vw;
	max-height: 88vh;
	background: var(--color--background--light-3, #fff);
	border-radius: var(--radius--lg);
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: var(--spacing--xs) var(--spacing--sm);
	border-bottom: var(--border);
}

.title {
	flex-grow: 1;
	font-size: var(--font-size--sm);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.close {
	display: flex;
	align-items: center;
	background: transparent;
	border: none;
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.body {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	padding: var(--spacing--sm);
	overflow-y: auto;
}

.outputBox {
	display: flex;
	flex-direction: column;
	border: var(--border);
	border-radius: var(--radius);
	overflow: hidden;
}

.emailMeta {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

/* The output IS the editing surface: correcting is the primary gesture */
.outputEditable {
	padding: var(--spacing--2xs) var(--spacing--xs);
	border: none;
	background: transparent;
	font-family: var(--font-family);
	font-size: var(--font-size--xs);
	color: var(--color--text);
	line-height: 1.5;
	resize: vertical;
	max-height: 220px;

	&:focus {
		outline: none;
		background: var(--color--background--light-3, #fff);
	}

	&::selection {
		background: var(--color--primary--tint-2, #fde7df);
		color: var(--color--text);
	}
}

.outputHint {
	padding: 0 var(--spacing--xs) var(--spacing--2xs);
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

/* The scope line: the only thing that says what a note is about */
.scopeLine {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	min-height: 24px;
	margin-top: var(--spacing--3xs);
}

.scopeText {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.scopeClear {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	flex-shrink: 0;
	background: transparent;
	border: none;
	border-radius: var(--radius);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		background: var(--color--background);
		color: var(--color--text);
	}
}

/* What the run data says about the selected value */
.causeStrip {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
	padding: var(--spacing--2xs);
	border: 1px dashed var(--color--foreground);
	border-radius: var(--radius);
	background: var(--color--background);
}

.causeCertain {
	border-style: solid;
	border-color: var(--color--primary);
	background: var(--color--background--light-3, #fff);
}

.causeLabel {
	font-size: 9px;
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.06em;
	color: var(--color--text--tint-1);
}

.causeText {
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	text-wrap: pretty;
}

.causeNote {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

/* Notes already committed on this output */
.noteList {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.noteRow {
	display: flex;
	align-items: baseline;
	gap: var(--spacing--2xs);
	padding: var(--spacing--3xs) var(--spacing--2xs);
	border-radius: var(--radius);
	background: var(--color--background);
}

.noteScope {
	flex-shrink: 0;
	max-width: 40%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.noteReason {
	flex-grow: 1;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

.noteRemove {
	flex-shrink: 0;
	background: transparent;
	border: none;
	padding: 0;
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.addAnother {
	align-self: flex-start;
	background: transparent;
	border: none;
	padding: 0;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

/* Verdict: rejecting the whole output vs flagging one issue in it */
.verdictSwitch {
	display: flex;
	gap: var(--spacing--4xs);
	padding: 3px;
	border-radius: var(--radius--md);
	background: var(--color--background);
}

.verdictOption {
	flex: 1;
	padding: var(--spacing--3xs) var(--spacing--2xs);
	background: transparent;
	border: none;
	border-radius: var(--radius);
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	cursor: pointer;
}

.verdictActive {
	background: var(--color--background--light-3, #fff);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.chipRow {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--3xs);
}

.chip {
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: 15px;
	padding: 5px 12px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale, border-color, background-color;
	transition-duration: 100ms;

	&:hover {
		border-color: var(--color--text--tint-1);
	}

	&:active {
		scale: 0.96;
	}
}

.chipSelected {
	border-color: var(--color--primary);
	background: var(--color--primary--tint-4, #fdefe9);
	color: var(--color--primary);
	font-weight: var(--font-weight--bold);
}

.input {
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	font-family: var(--font-family);
	font-size: var(--font-size--xs);
	color: var(--color--text);
	padding: var(--spacing--2xs);
	resize: vertical;
	line-height: 1.5;

	&::placeholder {
		color: var(--color--text--tint-1);
	}
}

.footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--spacing--2xs);
	padding: var(--spacing--2xs) var(--spacing--sm);
	border-top: var(--border);
}

.cancelButton {
	background: transparent;
	border: none;
	font-size: var(--font-size--xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.saveButton {
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
	padding: 7px 16px;
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
</style>
