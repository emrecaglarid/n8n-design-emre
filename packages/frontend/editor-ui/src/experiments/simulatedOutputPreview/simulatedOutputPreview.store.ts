import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type SimulatedPreviewKind = 'slack' | 'email';
export type PreviewVerdict = 'up' | 'down';
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
export const useSimulatedOutputPreviewStore = defineStore('simulatedOutputPreview', () => {
	/** Previews of the latest manual run, in rank order (most consequential first) */
	const previews = ref<SimulatedPreview[]>([]);
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

	function pushToStack(preview: SimulatedPreview) {
		stacks.value = {
			...stacks.value,
			[preview.nodeName]: [...(stacks.value[preview.nodeName] ?? []), preview],
		};
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
	function dismissPreview(id: string, verdict?: PreviewVerdict) {
		const preview = previews.value.find((p) => p.id === id);
		if (!preview) return;
		pushToStack({ ...preview, verdict });
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
		stackCount,
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
