<script setup lang="ts">
import { N8nButton, N8nIcon } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';

import { useOpenInN8nChat } from '../useOpenInN8nChat';

/**
 * Opens the agent in n8n Chat in a new conversation, where its actions are
 * real. The composer holds the test session's first message, unsent.
 */
const props = withDefaults(
	defineProps<{
		/** `keepGoing` after the builder made a turn's changes for real. */
		kind?: 'open' | 'keepGoing';
	}>(),
	{ kind: 'open' },
);

const i18n = useI18n();
const { isAvailable: isEnabled, openInChat } = useOpenInN8nChat();
</script>

<template>
	<N8nButton
		v-if="isEnabled"
		variant="outline"
		size="small"
		data-testid="agent-test-copy-open-in-chat"
		data-attr="agent-test-copy-open-in-chat"
		@click="openInChat"
	>
		<!-- The trailing icon says this leaves the test pane. -->
		<span :class="$style.content">
			{{
				i18n.baseText(
					props.kind === 'keepGoing'
						? 'agents.testCopy.keepGoingInChat'
						: 'agents.testCopy.openInChat',
				)
			}}
			<N8nIcon icon="external-link" size="small" />
		</span>
	</N8nButton>
</template>

<style lang="scss" module>
.content {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
}
</style>
