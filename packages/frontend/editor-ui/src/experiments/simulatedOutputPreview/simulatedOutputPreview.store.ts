import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Finding } from '@/experiments/findings/findings';

export type SimulatedPreviewKind = 'slack' | 'email';
export type PreviewVerdict = 'up' | 'down';
/**
 * How wrong the output was. Without this, a nitpick on one field marks the
 * whole output rejected and the pass rate stops meaning anything.
 */
export type OutputVerdict = 'not-right' | 'mostly-fine';
export type PillPhase = 'idle' | 'running' | 'generating' | 'success';

export interface SimulatedPreview {
	id: string;
	nodeName: string;
	nodeType: string;
	kind: SimulatedPreviewKind;
	/** Slack */
	channel?: string;
	messageText?: string;
	/** Email */
	from?: string;
	to?: string;
	subject?: string;
	body?: string;
	itemCount: number;
	nodeExecuted: boolean;
	nodeErrored: boolean;
	executedAt: number;
	/** Shared by every preview of one manual run — the Outputs tab groups by it */
	runId?: string;
	/** What went in: the trigger node and a compact first-item summary */
	triggerSummary?: string;
	/** Set when the user judged the preview (r1: thumbs pair). Undefined = unreviewed. */
	verdict?: PreviewVerdict;
}

/**
 * AI Trust prototype (idea/ai-trust-q3-design-directions), r1 revision:
 * a phased execution pill replaces the run/stop buttons during a manual run
 * (running → generating output previews → run successful), and destination
 * previews render as a stacked deck above it. Judged or dismissed previews
 * fly into a stack behind their destination node.
 */
/**
 * A judged or dismissed output, kept per workflow so the Outputs tab can show
 * everything the workflow has produced across runs and reloads.
 */
export interface OutputRecord extends SimulatedPreview {
	workflowId: string;
	reason?: string;
	correction?: string;
	/** How wrong it was: a flagged issue is not a rejected output */
	outputVerdict?: OutputVerdict;
	/** Every note attached to this verdict, each with its own scope */
	findings?: Finding[];
}

/** What a thumbs-down carries back from the dialog */
export interface VerdictDetails {
	reason?: string;
	correction?: string;
	outputVerdict?: OutputVerdict;
	findings?: Finding[];
}

const RECORDS_STORAGE_PREFIX = 'N8N_EXPERIMENT_SIM_OUTPUTS';

function recordsStorageKey(workflowId: string): string {
	return `${RECORDS_STORAGE_PREFIX}:${workflowId}`;
}

function loadRecords(workflowId: string): OutputRecord[] {
	try {
		const raw = localStorage.getItem(recordsStorageKey(workflowId));
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as OutputRecord[]) : [];
	} catch {
		return [];
	}
}

export const useSimulatedOutputPreviewStore = defineStore('simulatedOutputPreview', () => {
	/** Previews of the latest manual run, in rank order (most consequential first) */
	const previews = ref<SimulatedPreview[]>([]);
	/** The workflow the current editor session belongs to */
	const currentWorkflowId = ref<string | null>(null);
	/** Judged/dismissed outputs of the current workflow, persisted locally */
	const records = ref<OutputRecord[]>([]);
	/** The Outputs tab overlay (replaces the Evaluations tab in this prototype) */
	const outputsTabOpen = ref(false);
	const frontPreviewId = ref<string | null>(null);
	/** Judged/dismissed previews, stacked behind their destination node */
	const stacks = ref<Record<string, SimulatedPreview[]>>({});
	const pillPhase = ref<PillPhase>('idle');
	/** "Show all" control: spread the deck into a vertical list */
	const showAll = ref(false);
	/** How many outputs the run generated — the pill reports this, not what's left */
	const runOutputsTotal = ref(0);

	const frontPreview = computed(
		() => previews.value.find((p) => p.id === frontPreviewId.value) ?? null,
	);
	const behindPreviews = computed(() =>
		previews.value.filter((p) => p.id !== frontPreviewId.value),
	);
	const hasPreviews = computed(() => previews.value.length > 0);
	const isPillActive = computed(() => pillPhase.value !== 'idle');

	function stackCount(nodeName: string): number {
		return stacks.value[nodeName]?.length ?? 0;
	}

	/** What the output says, regardless of destination kind */
	function outputText(preview: SimulatedPreview): string {
		return ((preview.kind === 'slack' ? preview.messageText : preview.body) ?? '').trim();
	}

	/**
	 * The baseline for change comparisons: the newest output of this node the
	 * user approved. A correction counts as what they approved.
	 */
	function lastApprovedFor(nodeName: string, excludeId?: string): OutputRecord | null {
		for (let index = records.value.length - 1; index >= 0; index--) {
			const record = records.value[index];
			if (record.nodeName === nodeName && record.id !== excludeId && isBaselineWorthy(record)) {
				return record;
			}
		}
		return null;
	}

	/**
	 * An output flagged for one issue still describes the standard — excluding it
	 * would leave the baseline stale exactly while someone is iterating. A
	 * rejected output never becomes one.
	 */
	function isBaselineWorthy(record: OutputRecord): boolean {
		if (record.verdict === 'up') return true;
		return record.verdict === 'down' && record.outputVerdict === 'mostly-fine';
	}

	/** True when the preview's text differs from the last approved output */
	function changedSinceApproved(preview: SimulatedPreview): boolean {
		const baseline = lastApprovedFor(preview.nodeName, preview.id);
		if (!baseline) return false;
		const approvedText = (baseline.correction ?? outputText(baseline)).trim();
		return approvedText !== outputText(preview);
	}

	function setWorkflow(workflowId: string | null) {
		if (workflowId === currentWorkflowId.value) return;
		currentWorkflowId.value = workflowId;
		records.value = workflowId ? loadRecords(workflowId) : [];
		outputsTabOpen.value = false;
	}

	function persistRecords() {
		if (!currentWorkflowId.value) return;
		try {
			localStorage.setItem(
				recordsStorageKey(currentWorkflowId.value),
				JSON.stringify(records.value.slice(-100)),
			);
		} catch {
			// Storage full or unavailable — the tab just won't remember this one.
		}
	}

	function recordOutput(preview: SimulatedPreview, details?: VerdictDetails) {
		const workflowId = currentWorkflowId.value;
		if (!workflowId) return;
		const existing = records.value.findIndex((record) => record.id === preview.id);
		const record: OutputRecord = { ...preview, workflowId, ...details };
		if (existing >= 0) records.value.splice(existing, 1, record);
		else records.value.push(record);
		persistRecords();
	}

	function pushToStack(preview: SimulatedPreview, details?: VerdictDetails) {
		stacks.value = {
			...stacks.value,
			[preview.nodeName]: [...(stacks.value[preview.nodeName] ?? []), preview],
		};
		recordOutput(preview, details);
	}

	/** A manual run started (only called when the workflow has destination nodes) */
	function startRun() {
		pillPhase.value = 'running';
		showAll.value = false;
	}

	/** Run finished; previews are being resolved and rendered */
	function setGenerating() {
		pillPhase.value = 'generating';
	}

	/** No pill for this run after all (no previews, run errored, …) */
	function cancelPill() {
		pillPhase.value = 'idle';
	}

	/** Previews are ready: leftovers from the previous run fly to their stacks */
	function setRunPreviews(next: SimulatedPreview[]) {
		for (const preview of previews.value) pushToStack(preview);
		previews.value = next;
		frontPreviewId.value = next[0]?.id ?? null;
		runOutputsTotal.value = next.length;
		pillPhase.value = 'success';
	}

	function bringToFront(id: string) {
		if (previews.value.some((p) => p.id === id)) frontPreviewId.value = id;
	}

	/** Judge or close one preview: it leaves the deck and lands in the node's stack */
	function dismissPreview(id: string, verdict?: PreviewVerdict, details?: VerdictDetails) {
		const preview = previews.value.find((p) => p.id === id);
		if (!preview) return;
		pushToStack({ ...preview, verdict }, details);
		previews.value = previews.value.filter((p) => p.id !== id);
		if (frontPreviewId.value === id) {
			frontPreviewId.value = previews.value[0]?.id ?? null;
		}
	}

	/** ⊗ on the pill: everything unreviewed flies to its stack, pill goes away */
	function dismissPill() {
		for (const preview of previews.value) pushToStack(preview);
		previews.value = [];
		frontPreviewId.value = null;
		pillPhase.value = 'idle';
		showAll.value = false;
	}

	function toggleShowAll() {
		showAll.value = !showAll.value;
	}

	/** Node badge clicked: pull the latest preview back out of the stack */
	function openFromStack(nodeName: string) {
		const stack = stacks.value[nodeName] ?? [];
		const latest = stack[stack.length - 1];
		if (!latest) return;
		stacks.value = { ...stacks.value, [nodeName]: stack.slice(0, -1) };
		if (!previews.value.some((p) => p.id === latest.id)) {
			previews.value = [...previews.value, latest];
		}
		frontPreviewId.value = latest.id;
	}

	function clearAll() {
		previews.value = [];
		frontPreviewId.value = null;
		stacks.value = {};
		pillPhase.value = 'idle';
		showAll.value = false;
	}

	return {
		previews,
		frontPreview,
		frontPreviewId,
		behindPreviews,
		hasPreviews,
		stacks,
		pillPhase,
		isPillActive,
		showAll,
		runOutputsTotal,
		currentWorkflowId,
		records,
		outputsTabOpen,
		setWorkflow,
		stackCount,
		lastApprovedFor,
		changedSinceApproved,
		startRun,
		setGenerating,
		cancelPill,
		setRunPreviews,
		bringToFront,
		dismissPreview,
		dismissPill,
		toggleShowAll,
		openFromStack,
		clearAll,
	};
});
