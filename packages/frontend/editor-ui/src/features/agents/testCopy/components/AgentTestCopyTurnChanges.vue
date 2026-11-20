<script setup lang="ts">
import type { AgentTestChange } from '@n8n/api-types';
import { N8nAiActivityStep, N8nAiActivityStepGroup, N8nButton } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed, ref } from 'vue';

import { useTestCopyCountLabels } from '../useTestCopyCountLabels';
import { useOptionalAgentTestCopyStore } from '../testCopy.store';
import { formatTestCopyTime, groupChangesByApp } from '../testCopy.utils';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';
import AgentTestCopyChangePreview from './AgentTestCopyChangePreview.vue';
import AgentTestCopyApplyModal from './AgentTestCopyApplyModal.vue';
import AgentTestCopyOpenInChat from './AgentTestCopyOpenInChat.vue';

/** The changes of one assistant turn, folded like the tool calls above it. */
const props = defineProps<{
	changes: AgentTestChange[];
	/** Set when the tool calls row sits right above, so the two rows stay close. */
	afterSteps?: boolean;
}>();

const i18n = useI18n();
const store = useOptionalAgentTestCopyStore();
const { appRowLabel } = useTestCopyCountLabels();

const total = computed(() => props.changes.length);
const doneCount = computed(() => props.changes.filter((change) => change.appliedAt).length);
const failedCount = computed(
	() => props.changes.filter((change) => !change.appliedAt && store?.applyErrors[change.id]).length,
);
const allDone = computed(() => total.value > 0 && doneCount.value === total.value);
/** Changes were made once; nothing is retried, so the action does not come back. */
const attempted = computed(() => doneCount.value > 0 || failedCount.value > 0);

const label = computed(() => {
	if (allDone.value) {
		return i18n.baseText('agents.testCopy.turnChanges.made', {
			adjustToNumber: total.value,
			interpolate: { count: String(total.value) },
		});
	}
	if (attempted.value) {
		return i18n.baseText('agents.testCopy.turnChanges.partlyMade', {
			interpolate: { done: String(doneCount.value), count: String(total.value) },
		});
	}
	return i18n.baseText('agents.testCopy.turnChanges', {
		adjustToNumber: total.value,
		interpolate: { count: String(total.value) },
	});
});

const modalOpen = ref(false);
const applying = ref(false);

const noteText = computed(() => {
	if (allDone.value) {
		const latest = props.changes
			.map((change) => change.appliedAt ?? '')
			.sort()
			.at(-1);
		return i18n.baseText('agents.testCopy.turnChanges.doneNote', {
			interpolate: { time: latest ? formatTestCopyTime(latest) : '' },
		});
	}
	if (attempted.value) {
		return i18n.baseText('agents.testCopy.turnChanges.partlyNote', {
			interpolate: { done: String(doneCount.value), count: String(total.value) },
		});
	}
	return i18n.baseText('agents.testCopy.turnChanges.note');
});

const canApply = computed(() => Boolean(store) && !attempted.value);

/** One change at a time, in the order the agent made them. Never retried. */
async function makeChanges() {
	if (!store) return;
	applying.value = true;
	try {
		await store.applyChanges(props.changes.map((change) => change.id));
	} finally {
		applying.value = false;
		// The row shows the result once the modal is gone.
		modalOpen.value = false;
	}
}

/** Apps in the order of their first change; changes oldest first, as in the chat. */
const apps = computed(() =>
	groupChangesByApp(props.changes)
		.map((group) => ({ ...group, changes: [...group.changes].reverse() }))
		.reverse(),
);

const changeIds = computed(() => props.changes.map((change) => change.id).join(' '));
</script>

<template>
	<div
		:class="[$style.turnChanges, { [$style.afterSteps]: afterSteps }]"
		:data-test-copy-change-ids="changeIds"
		data-testid="agent-test-copy-turn-changes"
	>
		<N8nAiActivityStepGroup :label="label" size="medium">
			<!-- The apps after the label, so the label lines up with the tool calls row above. -->
			<template #header-trailing>
				<span :class="$style.appIcons" aria-hidden="true">
					<AgentTestCopyAppIcon
						v-for="app in apps"
						:key="app.key"
						:app-key="app.appKey"
						:size="14"
					/>
				</span>
			</template>
			<!-- First, one line that says what this is, with the action beside it. -->
			<div :class="$style.noteBox" data-testid="agent-test-copy-turn-changes-note">
				<p :class="$style.noteText">{{ noteText }}</p>
				<N8nButton
					v-if="canApply"
					variant="outline"
					size="small"
					:class="$style.noteAction"
					:label="i18n.baseText('agents.testCopy.apply.start', { adjustToNumber: total })"
					data-testid="agent-test-copy-apply"
					data-attr="agent-test-copy-apply"
					@click="modalOpen = true"
				/>
				<!-- Every change went through: the next step is to keep going for real. -->
				<AgentTestCopyOpenInChat v-else-if="allDone" kind="keepGoing" :class="$style.noteAction" />
			</div>
			<N8nAiActivityStep v-for="app in apps" :key="app.key" :label="appRowLabel(app)">
				<template #prefix>
					<span
						:class="$style.appIcon"
						:data-test-copy-app-change-ids="app.changes.map((change) => change.id).join(' ')"
					>
						<AgentTestCopyAppIcon :app-key="app.appKey" :size="14" />
					</span>
				</template>
				<div :class="$style.tiles">
					<AgentTestCopyChangePreview
						v-for="change in app.changes"
						:key="change.id"
						:change="change"
					/>
				</div>
			</N8nAiActivityStep>
		</N8nAiActivityStepGroup>
		<AgentTestCopyApplyModal
			v-model:open="modalOpen"
			:changes="changes"
			:applying="applying"
			@confirm="makeChanges"
		/>
	</div>
</template>

<style lang="scss" module>
.turnChanges {
	margin: 0 0 var(--spacing--sm);
}

/* The tool calls row keeps its own bottom margin, so this row moves up to it. */
.afterSteps {
	margin-top: calc(var(--spacing--sm) * -1);
}

.appIcon {
	display: inline-flex;
	flex-shrink: 0;
}

/* The apps that changed, in color, so a turn with held changes stands out from its reads. */
.appIcons {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
	flex-shrink: 0;
}

.tiles {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	max-width: min(calc(var(--spacing--5xl) * 2), 100%);
	margin: var(--spacing--3xs) 0 var(--spacing--xs);
}

/* No box: the note and its button share one line; the button wraps under it when narrow. */
.noteBox {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--spacing--3xs) var(--spacing--xs);
	margin: var(--spacing--3xs) 0 var(--spacing--2xs);
}

.noteText {
	min-width: 0;
	margin: 0;
	color: var(--text-color--subtle);
	font-size: var(--font-size--sm);
	line-height: var(--line-height--md);
	overflow-wrap: anywhere;
}

.noteAction {
	flex-shrink: 0;
}
</style>
