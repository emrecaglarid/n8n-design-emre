<script setup lang="ts">
import { computed, ref } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { GOOGLE_GMAIL_NODE_TYPE } from '@/app/constants/nodeTypes';
import { useSimulatedOutputPreviewStore, type OutputRecord } from '../simulatedOutputPreview.store';

/**
 * AI Trust prototype: the workflow's Outputs tab — everything the workflow has
 * produced, with the judgments attached. Also the gateway for advanced users:
 * export the judged outputs, or connect an external evaluator. Neither path is
 * required to use the tab.
 */
const store = useSimulatedOutputPreviewStore();
const nodeTypesStore = useNodeTypesStore();
const toast = useToast();

const records = computed(() => [...store.records].reverse());
const reviewedCount = computed(() => store.records.filter((record) => record.verdict).length);

const connectMenuOpen = ref(false);
const openImproveId = ref<string | null>(null);

function rowTitle(record: OutputRecord): string {
	if (record.kind === 'slack') return 'Slack message';
	return record.nodeType === GOOGLE_GMAIL_NODE_TYPE ? 'Gmail' : 'Email';
}

function rowText(record: OutputRecord): string {
	return (record.kind === 'slack' ? record.messageText : record.body) ?? '';
}

function rowTime(record: OutputRecord): string {
	return new Date(record.executedAt).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

async function onCopy(record: OutputRecord) {
	try {
		await navigator.clipboard.writeText(rowText(record));
		toast.showMessage({ title: 'Copied', type: 'success' });
	} catch {
		toast.showMessage({ title: 'Could not copy', type: 'error' });
	}
}

/** Real export: the judged pairs as JSON — request context, output, verdict, reason, correction. */
function onExport() {
	const payload = JSON.stringify(store.records, null, 2);
	const blob = new Blob([payload], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `outputs-${store.currentWorkflowId ?? 'workflow'}.json`;
	link.click();
	URL.revokeObjectURL(url);
}
</script>

<template>
	<div :class="$style.view" data-test-id="workflow-outputs-view">
		<div :class="$style.headerRow">
			<span :class="$style.title">Outputs</span>
			<span :class="$style.metaChip"
				>{{ records.length }} output{{ records.length === 1 ? '' : 's' }}</span
			>
			<span :class="$style.metaChip">{{ reviewedCount }} of {{ records.length }} reviewed</span>
			<span :class="$style.headerActions">
				<span :class="$style.connectWrapper">
					<button :class="$style.headerButton" @click="connectMenuOpen = !connectMenuOpen">
						Connect to evaluation
					</button>
					<span v-if="connectMenuOpen" :class="$style.connectMenu">
						<span :class="$style.connectOption">
							<span :class="$style.connectName">n8n LangTracer</span>
							<span :class="$style.connectHint"
								>watches new outputs · zero setup — not wired yet</span
							>
						</span>
						<span :class="$style.connectOption">
							<span :class="$style.connectName">LangSmith</span>
							<span :class="$style.connectHint"
								>sends judged pairs to your workspace — not wired yet</span
							>
						</span>
						<span :class="$style.connectOption">
							<span :class="$style.connectName">OpenTelemetry</span>
							<span :class="$style.connectHint">traces to your own collector — not wired yet</span>
						</span>
					</span>
				</span>
				<button :class="$style.headerButton" data-test-id="outputs-export" @click="onExport">
					Export
				</button>
			</span>
		</div>

		<div v-if="records.length === 0" :class="$style.empty">
			Run the workflow — every output it produces lands here, with your judgments attached.
		</div>

		<div v-else :class="$style.list">
			<div v-for="record in records" :key="record.id" :class="$style.row">
				<span :class="$style.rowType">
					<NodeIcon :node-type="nodeTypesStore.getNodeType(record.nodeType)" :size="18" />
					<span :class="$style.rowTypeText">
						<span :class="$style.rowTitle">{{ rowTitle(record) }}</span>
						<span :class="$style.rowTime">{{ rowTime(record) }}</span>
					</span>
				</span>
				<span :class="$style.rowBody">
					<span :class="$style.rowText">{{ rowText(record) }}</span>
					<span v-if="record.verdict === 'down' && record.reason" :class="$style.rowReason"
						>👎 {{ record.reason }}</span
					>
					<span v-if="record.correction" :class="$style.rowCorrection"
						>✏️ {{ record.correction }}</span
					>
				</span>
				<span :class="$style.rowActions">
					<span v-if="record.verdict === 'up'" :class="[$style.verdictChip, $style.verdictUp]"
						>👍 looks good</span
					>
					<span
						v-else-if="record.verdict === 'down'"
						:class="[$style.verdictChip, $style.verdictDown]"
						>👎</span
					>
					<span v-else :class="$style.verdictChip">unrated</span>
					<span :class="$style.improveWrapper">
						<button
							:class="$style.rowButton"
							@click="openImproveId = openImproveId === record.id ? null : record.id"
						>
							Improve <span :class="$style.chevron">▾</span>
						</button>
						<span v-if="openImproveId === record.id" :class="$style.connectMenu">
							<span :class="$style.connectOption">
								<span :class="$style.connectName">Ask the assistant to improve</span>
								<span :class="$style.connectHint"
									>hands this output and your reason over — not wired yet</span
								>
							</span>
							<span :class="$style.connectOption">
								<span :class="$style.connectName">Open the node</span>
								<span :class="$style.connectHint"
									>jump to {{ record.nodeName }} — not wired yet</span
								>
							</span>
						</span>
					</span>
					<button :class="$style.iconButton" title="Copy output" @click="onCopy(record)">
						<N8nIcon icon="copy" size="small" />
					</button>
				</span>
			</div>
		</div>

		<div :class="$style.drip">
			<span :class="$style.dripTitle">✨ Things this workflow hasn't seen yet</span>
			<span :class="$style.dripChips">
				<span
					:class="$style.dripChip"
					title="Drafted requests aren't wired on the workflow side yet"
					>Try: an invoice with two clients on it</span
				>
				<span
					:class="$style.dripChip"
					title="Drafted requests aren't wired on the workflow side yet"
					>Try: an amount over €10,000</span
				>
				<span
					:class="$style.dripChip"
					title="Drafted requests aren't wired on the workflow side yet"
					>Try: a missing due date</span
				>
				<span :class="$style.dripNote">— drafted from your node settings and past runs</span>
			</span>
		</div>
	</div>
</template>

<style lang="scss" module>
.view {
	position: fixed;
	inset: 0;
	top: var(--navbar--height, 65px);
	z-index: 90;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
	/* The header's floating segment control protrudes below the navbar */
	padding: var(--spacing--xl) var(--spacing--lg) var(--spacing--md);
	background: var(--color--background);
	overflow-y: auto;
}

.headerRow {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.title {
	font-size: var(--font-size--lg);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	margin-right: var(--spacing--3xs);
}

.metaChip {
	background: var(--color--foreground--tint-1, #ececec);
	border-radius: 10px;
	padding: 2px 10px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	font-variant-numeric: tabular-nums;
}

.headerActions {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.headerButton {
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

.connectWrapper,
.improveWrapper {
	position: relative;
}

.connectMenu {
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

.connectOption {
	display: flex;
	flex-direction: column;
	gap: 1px;
	padding: 8px 12px;
	cursor: default;

	&:hover {
		background: var(--color--background);
	}
}

.connectName {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.connectHint {
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
	overflow: visible;
}

.row {
	display: flex;
	align-items: flex-start;
	gap: var(--spacing--sm);
	padding: var(--spacing--xs) var(--spacing--sm);

	& + & {
		border-top: var(--border);
	}
}

.rowType {
	flex: 0 0 150px;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.rowTypeText {
	display: flex;
	flex-direction: column;
}

.rowTitle {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.rowTime {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}

.rowBody {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--3xs);
}

.rowText {
	font-size: var(--font-size--xs);
	color: var(--color--text);
	line-height: 1.5;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.rowReason {
	font-size: var(--font-size--2xs);
	color: var(--color--warning);
}

.rowCorrection {
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.rowActions {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
}

.verdictChip {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	white-space: nowrap;
}

.verdictUp {
	color: var(--color--success);
	font-weight: var(--font-weight--bold);
}

.verdictDown {
	color: var(--color--warning);
	font-weight: var(--font-weight--bold);
}

.rowButton {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	background: var(--color--background--light-3, #fff);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	padding: 5px 10px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: pointer;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}

.chevron {
	font-size: 9px;
	color: var(--color--text--tint-1);
}

.iconButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
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
	margin-top: auto;
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	background: var(--color--background--light-3, #fff);
	border: var(--border);
	border-radius: var(--radius--lg);
	padding: var(--spacing--xs) var(--spacing--sm);
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
	border: 1px solid var(--color--foreground);
	border-radius: 15px;
	padding: 4px 12px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	cursor: default;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}

.dripNote {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}
</style>
