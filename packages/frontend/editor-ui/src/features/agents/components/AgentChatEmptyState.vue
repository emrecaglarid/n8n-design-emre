<script setup lang="ts">
import { N8nIcon, N8nText, type IconName } from '@n8n/design-system';

import type { AgentJsonConfig } from '../types';
import AgentPersonalisationIcon from './AgentPersonalisationIcon.vue';
import AgentTestCopyEmptyNote from '../testCopy/components/AgentTestCopyEmptyNote.vue';
import AgentTestCopyLeash from '../testCopy/components/AgentTestCopyLeash.vue';
import { useTestCopyChat } from '../testCopy/useTestCopyChat';
import { useI18n } from '@n8n/i18n';

const i18n = useI18n();
const { isActive: isTestCopyActive } = useTestCopyChat();

defineProps<{
	agentConfig: AgentJsonConfig | null;
	/** A plain icon for a built-in agent, such as n8n Assistant. Replaces the icon tile. */
	icon?: IconName;
}>();
</script>

<template>
	<div :class="$style.emptyState">
		<N8nIcon v-if="icon" :icon="icon" :size="40" :class="$style.icon" />
		<!-- In a test chat the avatar is a balloon on a string: it can act, but only so far. -->
		<AgentTestCopyLeash
			v-else-if="isTestCopyActive"
			:personalisation="agentConfig?.personalisation"
			:class="$style.icon"
		>
			<AgentPersonalisationIcon :personalisation="agentConfig?.personalisation" :size="64" />
		</AgentTestCopyLeash>
		<AgentPersonalisationIcon
			v-else
			:personalisation="agentConfig?.personalisation"
			:class="$style.icon"
			:size="64"
		/>
		<!-- In a test chat the title says it is safe; the name moves into it. -->
		<template v-if="isTestCopyActive">
			<N8nText tag="h3" step="xl" bold :class="$style.line">{{
				i18n.baseText('agents.testCopy.emptyState.title', {
					interpolate: { name: agentConfig?.name ?? '' },
				})
			}}</N8nText>
			<!-- What a test does with the user's apps: reads are real, writes are held. -->
			<span :class="[$style.line, $style.facts]" data-testid="agent-test-copy-facts">
				<span :class="$style.fact">
					<span :class="$style.factIcon"><N8nIcon icon="check" :size="12" /></span>
					{{ i18n.baseText('agents.testCopy.emptyState.reads') }}
				</span>
				<span :class="$style.fact">
					<!-- Two plain strokes: the icon set's pause is two filled bars, too heavy next to the check. -->
					<span :class="$style.factIcon">
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<path d="M9 6v12M15 6v12" />
						</svg>
					</span>
					{{ i18n.baseText('agents.testCopy.emptyState.holds') }}
				</span>
			</span>
		</template>
		<template v-else>
			<N8nText tag="h3" step="xl" bold>{{ agentConfig?.name }}</N8nText>
			<N8nText step="sm" color="text-light">
				{{ i18n.baseText('agents.chat.emptyState.description') }}
			</N8nText>
		</template>
		<AgentTestCopyEmptyNote />
	</div>
</template>

<style module lang="scss">
@use '@n8n/design-system/css/mixins/motion';

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100%;
	gap: var(--spacing--3xs);

	> * {
		@include motion.fade-in-up;
		animation-fill-mode: backwards;
	}

	> :nth-child(2) {
		animation-delay: 0.2s;
	}

	> :nth-child(n + 3) {
		animation-delay: 0.4s;
	}
}

/* Same side gutter as the suggestions below, so the text never touches a narrow pane's edge. */
.line {
	box-sizing: border-box;
	max-width: 100%;
	padding-inline: var(--spacing--md);
	text-align: center;
	text-wrap: balance;
}

.facts {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--spacing--3xs);
}

.fact {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--2xs);
	color: var(--text-color--subtle);
	font-size: var(--font-size--sm);
	line-height: var(--line-height--md);
}

.factIcon {
	display: inline-grid;
	place-items: center;
	flex-shrink: 0;
	width: var(--spacing--md);
	height: var(--spacing--md);
	border-radius: var(--radius--full);
	background-color: var(--background--subtle);
	color: var(--text-color);
}

.icon {
	margin-bottom: var(--spacing--3xs);
}
</style>
