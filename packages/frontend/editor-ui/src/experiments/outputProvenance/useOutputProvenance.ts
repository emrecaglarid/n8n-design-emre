import type { IDataObject } from 'n8n-workflow';

import { injectWorkflowDocumentStore } from '@/app/stores/workflowDocument.store';
import { injectWorkflowExecutionStateStore } from '@/app/stores/workflowExecutionState.store';
import { useVariantsStore } from '@/experiments/variants/variants.store';

import {
	rankCandidates,
	traceValue,
	type NodeOutputText,
	type ProvenanceResult,
} from './outputProvenance';

/**
 * AI Trust prototype: reads the last run's node outputs so a value the user
 * pointed at can be traced back to the step that produced it. Same run-data
 * path the previews themselves are built from.
 */
export function useOutputProvenance() {
	const workflowDocumentStore = injectWorkflowDocumentStore();
	const workflowExecutionStateStore = injectWorkflowExecutionStateStore();
	const variants = useVariantsStore();

	/**
	 * The outputs of every step that actually feeds `nodeName`, as text.
	 *
	 * Ancestry matters, not document order: a sibling destination node renders
	 * the same values, so including it would name Gmail as the origin of a date
	 * that Slack also printed. `order` is graph distance inverted, so the step
	 * closest to the output ranks first among carriers.
	 */
	function collectNodeOutputs(nodeName?: string): NodeOutputText[] {
		const doc = workflowDocumentStore.value;
		const exec = workflowExecutionStateStore.value;
		const runData = exec?.activeExecution?.data?.resultData.runData;
		if (!doc || !runData) return [];

		// No node to anchor on: fall back to every step that ran, which is still
		// better than nothing but cannot rule out siblings.
		const ancestors = nodeName
			? doc.getParentNodesByDepth(nodeName, -1)
			: doc.allNodes.map((node, index) => ({ name: node.name, depth: index + 1, indicies: [] }));

		const outputs: NodeOutputText[] = [];
		for (const ancestor of ancestors) {
			if (ancestor.name === nodeName) continue;
			const runs = runData[ancestor.name];
			if (!runs?.length) continue;
			const items = runs[runs.length - 1]?.data?.main?.[0] ?? [];
			const text = items
				.map((item) => flattenJson(item?.json ?? {}))
				.filter(Boolean)
				.join(' ');
			// Depth 1 is the immediate parent, so invert it into "closeness".
			if (text) outputs.push({ nodeName: ancestor.name, text, order: -ancestor.depth });
		}
		return outputs;
	}

	/** Trace one value the way the current variant says to. */
	function trace(value: string, nodeName?: string): ProvenanceResult {
		if (variants.localization === 'off') return { kind: 'unknown' };
		const outputs = collectNodeOutputs(nodeName);
		if (variants.localization === 'ranked') {
			return rankCandidates(value, outputs, variants.rankedCandidateCount);
		}
		return traceValue(value, outputs, {
			rankedCandidateCount: variants.rankedCandidateCount,
		});
	}

	/**
	 * Whether a model runs anywhere upstream of this node. Without one, text that
	 * no step carries came from the node's own parameters — saying "the model
	 * wrote it" would be false, and would send someone to edit a prompt that
	 * does not exist.
	 */
	function hasModelUpstream(nodeName?: string): boolean {
		const doc = workflowDocumentStore.value;
		if (!doc || !nodeName) return false;
		const ancestors = doc.getParentNodesByDepth(nodeName, -1).map((entry) => entry.name);
		return doc.allNodes.some(
			(node) =>
				ancestors.includes(node.name) &&
				(node.type.includes('langchain') || node.type.toLowerCase().includes('agent')),
		);
	}

	return { trace, collectNodeOutputs, hasModelUpstream };
}

/** Values only — keys are n8n's vocabulary, not the output's wording. */
function flattenJson(json: IDataObject): string {
	const parts: string[] = [];
	const walk = (value: unknown, depth: number) => {
		if (depth > 4 || value === null || value === undefined) return;
		if (typeof value === 'object') {
			for (const nested of Object.values(value as IDataObject)) walk(nested, depth + 1);
			return;
		}
		parts.push(String(value));
	};
	walk(json, 0);
	return parts.join(' ');
}
