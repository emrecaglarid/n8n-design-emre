import { watch } from 'vue';
import type { IDataObject, ITaskData } from 'n8n-workflow';
import type { INodeUi } from '@/Interface';
import { injectWorkflowDocumentStore } from '@/app/stores/workflowDocument.store';
import { injectWorkflowExecutionStateStore } from '@/app/stores/workflowExecutionState.store';
import { resolveParameter } from '@/app/composables/useWorkflowHelpers';
import type { ExpressionLocalResolveContext } from '@/app/types/expressions';
import {
	SLACK_NODE_TYPE,
	GOOGLE_GMAIL_NODE_TYPE,
	EMAIL_SEND_NODE_TYPE,
} from '@/app/constants/nodeTypes';
import {
	useSimulatedOutputPreviewStore,
	type SimulatedPreview,
	type SimulatedPreviewKind,
} from '../simulatedOutputPreview.store';

const DESTINATION_NODE_KINDS: Record<string, SimulatedPreviewKind> = {
	[SLACK_NODE_TYPE]: 'slack',
	[GOOGLE_GMAIL_NODE_TYPE]: 'email',
	[EMAIL_SEND_NODE_TYPE]: 'email',
};

/**
 * AI Trust prototype: after every manual run, resolve destination nodes'
 * parameters against the run's data and publish rendered previews of what
 * was (or would have been) sent, without anything leaving n8n.
 */
export function useSimulatedOutputPreviews() {
	const workflowDocumentStore = injectWorkflowDocumentStore();
	const workflowExecutionStateStore = injectWorkflowExecutionStateStore();
	const previewStore = useSimulatedOutputPreviewStore();

	watch(
		() => workflowExecutionStateStore.value?.isWorkflowRunning,
		(running, wasRunning) => {
			if (running && !wasRunning) {
				const doc = workflowDocumentStore.value;
				const hasDestinations = doc?.allNodes.some((node) => DESTINATION_NODE_KINDS[node.type]);
				if (hasDestinations) previewStore.startRun();
				return;
			}
			if (wasRunning && !running && previewStore.pillPhase === 'running') {
				void buildPreviews();
			}
		},
	);

	async function buildPreviews() {
		const doc = workflowDocumentStore.value;
		const exec = workflowExecutionStateStore.value;
		if (!doc || !exec) {
			previewStore.cancelPill();
			return;
		}

		const mode = exec.activeExecution?.mode;
		const status = exec.activeExecution?.status;
		if ((mode !== undefined && mode !== 'manual') || status === 'error' || status === 'crashed') {
			previewStore.cancelPill();
			return;
		}

		previewStore.setGenerating();

		const destinationNodes = doc.allNodes.filter((node) => DESTINATION_NODE_KINDS[node.type]);
		const previews: SimulatedPreview[] = [];
		for (const node of destinationNodes) {
			const preview = await buildPreviewForNode(node);
			if (preview) previews.push(preview);
		}
		if (previews.length > 0) {
			// Prototype pacing: resolving previews is near-instant today, but the phase
			// stands in for real verdict work later — hold it long enough to be legible.
			await new Promise((resolve) => setTimeout(resolve, 700));
			previewStore.setRunPreviews(previews);
		} else {
			previewStore.cancelPill();
		}
	}

	async function buildPreviewForNode(node: INodeUi): Promise<SimulatedPreview | null> {
		const doc = workflowDocumentStore.value;
		const exec = workflowExecutionStateStore.value;
		if (!doc || !exec) return null;

		const runData = exec.getActiveExecutionRunDataByNodeName(node.name);
		const lastRun: ITaskData | undefined = runData?.[runData.length - 1];

		let resolved: IDataObject;
		try {
			resolved =
				(await resolveParameter<IDataObject>(
					node.parameters,
					doc.documentId,
					buildResolveCtx(node),
				)) ?? {};
		} catch {
			resolved = { ...node.parameters };
		}

		const kind = DESTINATION_NODE_KINDS[node.type];
		const base = {
			id: `${node.name}-${Date.now()}`,
			nodeName: node.name,
			nodeType: node.type,
			kind,
			itemCount: lastRun?.data?.main?.[0]?.length ?? 1,
			nodeExecuted: lastRun !== undefined,
			nodeErrored: Boolean(lastRun?.error),
			executedAt: Date.now(),
		};

		if (kind === 'slack') {
			return {
				...base,
				channel: firstString(resolved, ['channelId', 'channel', 'user']) ?? 'channel',
				messageText:
					firstString(resolved, ['text', 'message']) ?? '(no message text — Block Kit or empty)',
			};
		}

		return {
			...base,
			from: firstString(resolved, ['fromEmail']),
			to: firstString(resolved, ['sendTo', 'toEmail', 'toList', 'to']) ?? 'recipient',
			subject: firstString(resolved, ['subject']) ?? '(no subject)',
			body: firstString(resolved, ['message', 'text', 'html', 'body']) ?? '',
		};
	}

	function buildResolveCtx(node: INodeUi): ExpressionLocalResolveContext {
		const doc = workflowDocumentStore.value;
		const exec = workflowExecutionStateStore.value;
		const nodeName = node.name;

		function findInputNode(): ExpressionLocalResolveContext['inputNode'] {
			const taskData = (exec?.activeExecution?.data?.resultData.runData[nodeName] ?? [])[0];
			const source = taskData?.source[0];
			if (source) {
				return {
					name: source.previousNode,
					branchIndex: source.previousNodeOutput ?? 0,
					runIndex: source.previousNodeRun ?? 0,
				};
			}
			const inputs = doc?.getParentNodesByDepth(nodeName, 1) ?? [];
			if (inputs.length > 0) {
				return {
					name: inputs[0].name,
					branchIndex: inputs[0].indicies[0] ?? 0,
					runIndex: 0,
				};
			}
			return undefined;
		}

		return {
			localResolve: true,
			nodeName,
			additionalKeys: {},
			inputNode: findInputNode(),
		};
	}
}

/** Read the first non-empty string among candidate keys; unwraps resource-locator objects */
function firstString(source: IDataObject, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim() !== '') return value;
		if (value && typeof value === 'object' && '__rl' in (value as IDataObject)) {
			const rl = value as IDataObject;
			const name = rl.cachedResultName ?? rl.value;
			if (typeof name === 'string' && name.trim() !== '') return name;
		}
	}
	return undefined;
}
