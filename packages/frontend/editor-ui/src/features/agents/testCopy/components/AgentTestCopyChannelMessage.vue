<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { useUsersStore } from '@n8n/stores/users.store';
import { computed } from 'vue';

import AgentTestCopySlackMessage from './AgentTestCopySlackMessage.vue';
import AgentTestCopyTile from './AgentTestCopyTile.vue';

/**
 * A message the builder sent from a channel. It takes the place of the user
 * bubble. Inside a Slack session it is a plain, left-aligned Slack row. The
 * builder is "You", with the initials of the signed-in user.
 */
defineProps<{
	label: string;
	text: string;
	time?: number;
	inThread?: boolean;
}>();

const i18n = useI18n();
const usersStore = useUsersStore();

const youLabel = computed(() => i18n.baseText('agents.testCopy.you'));
const youInitials = computed(() => {
	const user = usersStore.currentUser;
	const letters = [user?.firstName, user?.lastName]
		.map((name) => name?.trim().charAt(0).toUpperCase() ?? '')
		.join('');
	return letters || 'Y';
});
</script>

<template>
	<div v-if="inThread" :class="$style.threadRow" data-testid="agent-test-copy-channel-message">
		<AgentTestCopySlackMessage
			:sender-name="youLabel"
			:initials="youInitials"
			:text="text"
			:time="time"
		/>
	</div>
	<div v-else :class="$style.row" data-testid="agent-test-copy-channel-message">
		<AgentTestCopyTile app-key="slack" :source="label" :class="$style.tile">
			<AgentTestCopySlackMessage
				:sender-name="youLabel"
				:initials="youInitials"
				:text="text"
				:time="time"
			/>
		</AgentTestCopyTile>
	</div>
</template>

<style lang="scss" module>
.threadRow {
	width: 100%;
	padding-block: var(--spacing--xs);
	text-align: left;
}

/* Matches the place and width of the user bubble in N8nChatMessage. */
.row {
	display: flex;
	justify-content: flex-end;
	width: 100%;
	margin-block: var(--spacing--md);
}

.tile {
	width: auto;
	max-width: 80%;
}
</style>
