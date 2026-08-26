import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type SimulatedPreviewKind = 'slack' | 'email';

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
}

/**
 * AI Trust prototype (idea/ai-trust-q3-design-directions): holds the simulated
 * destination-output previews for the current run (shown in the canvas strip)
 * and the per-node stacks previews fly into when dismissed.
 */
export const useSimulatedOutputPreviewStore = defineStore('simulatedOutputPreview', () => {
	/** Previews from the latest manual run, in rank order (most consequential first) */
	const previews = ref<SimulatedPreview[]>([]);
	const openPreviewId = ref<string | null>(null);
	/** Dismissed previews, stacked behind their destination node */
	const stacks = ref<Record<string, SimulatedPreview[]>>({});

	const openPreview = computed(
		() => previews.value.find((p) => p.id === openPreviewId.value) ?? null,
	);
	const hasPreviews = computed(() => previews.value.length > 0);

	function stackCount(nodeName: string): number {
		return stacks.value[nodeName]?.length ?? 0;
	}

	function pushToStack(preview: SimulatedPreview) {
		stacks.value = {
			...stacks.value,
			[preview.nodeName]: [...(stacks.value[preview.nodeName] ?? []), preview],
		};
	}

	/** A new run finished: anything left from the previous run flies to its stack */
	function setRunPreviews(next: SimulatedPreview[]) {
		for (const preview of previews.value) pushToStack(preview);
		previews.value = next;
		openPreviewId.value = next[0]?.id ?? null;
	}

	function open(id: string) {
		openPreviewId.value = id;
	}

	/** Node badge clicked: pull the latest preview back out of the stack and open it */
	function openFromStack(nodeName: string) {
		const stack = stacks.value[nodeName] ?? [];
		const latest = stack[stack.length - 1];
		if (!latest) return;
		stacks.value = { ...stacks.value, [nodeName]: stack.slice(0, -1) };
		if (!previews.value.some((p) => p.id === latest.id)) {
			previews.value = [...previews.value, latest];
		}
		openPreviewId.value = latest.id;
	}

	/** Dismiss = reviewed: the preview leaves the strip and lands in the node's stack */
	function dismissOpen() {
		const preview = openPreview.value;
		if (!preview) return;
		pushToStack(preview);
		previews.value = previews.value.filter((p) => p.id !== preview.id);
		openPreviewId.value = null;
	}

	/** Close without stacking (chip stays in the strip) */
	function closeOpen() {
		openPreviewId.value = null;
	}

	function clearAll() {
		previews.value = [];
		openPreviewId.value = null;
		stacks.value = {};
	}

	return {
		previews,
		openPreview,
		openPreviewId,
		hasPreviews,
		stacks,
		stackCount,
		setRunPreviews,
		open,
		openFromStack,
		dismissOpen,
		closeOpen,
		clearAll,
	};
});
