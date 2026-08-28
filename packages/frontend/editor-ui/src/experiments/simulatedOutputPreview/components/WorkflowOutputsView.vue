<script setup lang="ts">
import { computed, ref } from 'vue';
import { N8nAvatar, N8nIcon, N8nTooltip } from '@n8n/design-system';
import { useToast } from '@n8n/composables/useToast';
import { useUsersStore } from '@n8n/stores/users.store';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { GOOGLE_GMAIL_NODE_TYPE } from '@/app/constants/nodeTypes';
import { useSimulatedOutputPreviewStore, type OutputRecord } from '../simulatedOutputPreview.store';

/**
 * AI Trust prototype: the workflow's Outputs tab, grouped by run — what went
 * in, every output that came out, and who tried it. Also the quiet gateway
 * for advanced users: export the judged pairs or connect external tools.
 */
const store = useSimulatedOutputPreviewStore();
const nodeTypesStore = useNodeTypesStore();
const usersStore = useUsersStore();
const toast = useToast();

interface RunGroup {
	key: string;
	triggerSummary?: string;
	executedAt: number;
	outputs: OutputRecord[];
}

const groups = computed<RunGroup[]>(() => {
	const byRun = new Map<string, RunGroup>();
	for (const record of store.records) {
		const key = record.runId ?? record.id;
		const group = byRun.get(key);
		if (group) {
			group.outputs.push(record);
			group.executedAt = Math.max(group.executedAt, record.executedAt);
		} else {
			byRun.set(key, {
				key,
				triggerSummary: record.triggerSummary,
				executedAt: record.executedAt,
				outputs: [record],
			});
		}
	}
	return [...byRun.values()].sort((a, b) => b.executedAt - a.executedAt);
});

const connectMenuOpen = ref(false);
const openImproveKey = ref<string | null>(null);

function outputTitle(record: OutputRecord): string {
	if (record.kind === 'slack') return 'Slack';
	return record.nodeType === GOOGLE_GMAIL_NODE_TYPE ? 'Email' : 'Email';
}

function outputText(record: OutputRecord): string {
	return (record.kind === 'slack' ? record.messageText : record.body) ?? '';
}

function groupJudged(group: RunGroup): boolean {
	return group.outputs.some((record) => record.verdict);
}

function groupVerdictSummary(group: RunGroup): string {
	return group.outputs
		.filter((record) => record.verdict)
		.map((record) => {
			const emoji = record.verdict === 'up' ? '👍' : '👎';
			const reason = record.reason ? ` — ${record.reason}` : '';
			return `${emoji} ${outputTitle(record)}${reason}`;
		})
		.join('\n');
}

async function onCopy(group: RunGroup) {
	try {
		const text = group.outputs
			.map((record) => `${outputTitle(record)}:\n${outputText(record)}`)
			.join('\n\n');
		await navigator.clipboard.writeText(text);
		toast.showMessage({ title: 'Copied', type: 'success' });
	} catch {
		toast.showMessage({ title: 'Could not copy', type: 'error' });
	}
}

function onTryNewCase() {
	toast.showMessage({
		title: 'Not wired yet',
		message: 'Drafted cases aren’t wired on the workflow side — run the workflow from the editor.',
		type: 'info',
	});
}

/** Real export: the judged pairs as JSON — trigger, outputs, verdicts, reasons, corrections. */
function onExport() {
	connectMenuOpen.value = false;
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
			<span :class="$style.headerActions">
				<span :class="$style.connectWrapper">
					<button :class="$style.ghostButton" @click="connectMenuOpen = !connectMenuOpen">
						Connect external tools
					</button>
					<span v-if="connectMenuOpen" :class="$style.menu">
						<button :class="$style.menuOption" @click="onExport">
							<span :class="$style.menuName">Export judged outputs</span>
							<span :class="$style.menuHint">JSON of trigger, outputs, verdicts, corrections</span>
						</button>
						<span :class="$style.menuOption">
							<span :class="$style.menuName">n8n LangTracer</span>
							<span :class="$style.menuHint">watches new outputs · zero setup — not wired yet</span>
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
				<button
					:class="$style.primaryButton"
					data-test-id="outputs-try-new-case"
					@click="onTryNewCase"
				>
					Try a new case
				</button>
			</span>
		</div>

		<div v-if="groups.length === 0" :class="$style.empty">
			Run the workflow — every output it produces lands here, with your judgments attached.
		</div>

		<div v-else :class="$style.list">
			<div v-for="group in groups" :key="group.key" :class="$style.group">
				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Trigger</span>
					<span :class="$style.triggerChip">
						<N8nIcon icon="file-text" size="medium" />
						<span :class="$style.triggerText">{{ group.triggerSummary ?? 'Manual run' }}</span>
					</span>
				</div>

				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Outputs</span>
					<div :class="$style.outputsColumns">
						<div v-for="record in group.outputs" :key="record.id" :class="$style.outputColumn">
							<span :class="$style.outputHeader">
								<NodeIcon :node-type="nodeTypesStore.getNodeType(record.nodeType)" :size="16" />
								<span :class="$style.outputName">{{ outputTitle(record) }}</span>
							</span>
							<span :class="$style.outputText">{{ outputText(record) }}</span>
						</div>
					</div>
				</div>

				<div :class="$style.groupRow">
					<span :class="$style.railLabel">Tried by</span>
					<span :class="$style.triedBy">
						<N8nTooltip v-if="groupJudged(group)" placement="top">
							<template #content>
								<span :class="$style.verdictTooltip">{{ groupVerdictSummary(group) }}</span>
							</template>
							<span :class="$style.avatarRing">
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
							@click="openImproveKey = openImproveKey === group.key ? null : group.key"
						>
							Improve
						</button>
						<span v-if="openImproveKey === group.key" :class="$style.menu">
							<span :class="$style.menuOption">
								<span :class="$style.menuName">Ask the assistant to improve</span>
								<span :class="$style.menuHint"
									>hands the outputs and your reasons over — not wired yet</span
								>
							</span>
							<span :class="$style.menuOption">
								<span :class="$style.menuName">Open in the editor</span>
								<span :class="$style.menuHint">not wired yet</span>
							</span>
						</span>
					</span>
					<button :class="$style.iconButton" title="Copy outputs" @click="onCopy(group)">
						<N8nIcon icon="copy" size="small" />
					</button>
					<button :class="$style.iconButton" title="Share — not wired yet">
						<N8nIcon icon="share" size="small" />
					</button>
				</div>
			</div>
		</div>

		<div :class="$style.drip">
			<span :class="$style.dripTitle">Cases not yet tried:</span>
			<span :class="$style.dripChips">
				<span :class="$style.dripChip" title="Drafted cases aren't wired on the workflow side yet"
					>Try: an invoice with two clients on it</span
				>
				<span :class="$style.dripChip" title="Drafted cases aren't wired on the workflow side yet"
					>Try: an amount over €10,000</span
				>
				<span :class="$style.dripChip" title="Drafted cases aren't wired on the workflow side yet"
					>Try: a missing due date</span
				>
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
	flex: 0 0 200px;
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	padding-top: var(--spacing--4xs);
}

.triggerChip {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius);
	padding: var(--spacing--2xs) var(--spacing--xs);
	color: var(--color--text--tint-1);
}

.triggerText {
	font-size: var(--font-size--xs);
	color: var(--color--text);
}

.outputsColumns {
	flex: 1;
	min-width: 0;
	display: flex;
	gap: var(--spacing--xl);
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
	max-height: 200px;
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

.verdictTooltip {
	white-space: pre-line;
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
}
</style>
