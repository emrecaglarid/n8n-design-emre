<script setup lang="ts">
import type { AgentTestChange } from '@n8n/api-types';
import { N8nButton, N8nText } from '@n8n/design-system';
import type { BaseTextKey } from '@n8n/i18n';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import AgentModal from '../../components/modals/AgentModal.vue';
import {
	getCountNoun,
	groupChangesByApp,
	type AgentTestChangeGroup,
	type TestCopyCountNoun,
} from '../testCopy.utils';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';

/** Asks before the changes of a test turn run in the real apps. */
const props = defineProps<{
	open: boolean;
	changes: AgentTestChange[];
	/** The changes are being made: the primary button loads and Cancel is disabled. */
	applying: boolean;
}>();

const emit = defineEmits<{
	'update:open': [open: boolean];
	confirm: [];
}>();

const i18n = useI18n();

/** One plain sentence per app, said as the action it takes, for example "Send 1 email". */
const ACTION_KEYS: Record<TestCopyCountNoun, BaseTextKey> = {
	email: 'agents.testCopy.apply.action.email',
	message: 'agents.testCopy.apply.action.message',
	row: 'agents.testCopy.apply.action.row',
	contact: 'agents.testCopy.apply.action.contact',
	record: 'agents.testCopy.apply.action.record',
	change: 'agents.testCopy.apply.action.change',
};

function actionLabel(group: AgentTestChangeGroup): string {
	const count = group.changes.length;
	return i18n.baseText(ACTION_KEYS[getCountNoun(group.changes)], {
		adjustToNumber: count,
		interpolate: { count: String(count) },
	});
}

/** Apps in the order of their first change, as in the changes row. */
const apps = computed(() => groupChangesByApp(props.changes).reverse());
</script>

<template>
	<AgentModal
		:open="open"
		:title="i18n.baseText('agents.testCopy.apply.title')"
		:busy="applying"
		size="small"
		data-testid="agent-test-copy-apply-modal"
		@update:open="emit('update:open', $event)"
	>
		<N8nText tag="p" :class="$style.body">
			{{ i18n.baseText('agents.testCopy.apply.body') }}
		</N8nText>
		<ul :class="$style.list" data-testid="agent-test-copy-apply-list">
			<li v-for="app in apps" :key="app.key" :class="$style.item">
				<AgentTestCopyAppIcon :app-key="app.appKey" :size="16" />
				<span>{{ actionLabel(app) }}</span>
			</li>
		</ul>
		<template #footerActions>
			<N8nButton
				variant="solid"
				:loading="applying"
				:label="i18n.baseText('agents.testCopy.apply.confirmButton')"
				data-testid="agent-test-copy-apply-confirm"
				@click="emit('confirm')"
			/>
		</template>
	</AgentModal>
</template>

<style lang="scss" module>
.body {
	margin: 0 0 var(--spacing--sm);
}

/* A plain list: the app icon marks each row, no bullet. */
.list {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}

.item {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	font-size: var(--font-size--sm);
	color: var(--text-color);
}
</style>
