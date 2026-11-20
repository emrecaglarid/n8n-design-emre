<script setup lang="ts">
import {
	N8nButton,
	N8nDropdownMenu,
	N8nIcon,
	N8nIconButton,
	N8nTooltip,
	type DropdownMenuItemProps,
} from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { computed, useTemplateRef } from 'vue';

import { useAgentTestCopyStore } from '../testCopy.store';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';

/** Id of the chat item. Channel labels start with `#`, so they never clash. */
const CHAT_ID = 'chat';

interface ChannelItemData {
	description: string;
	isChannel: boolean;
}

const i18n = useI18n();
const store = useAgentTestCopyStore();

const items = computed<Array<DropdownMenuItemProps<string, ChannelItemData>>>(() => [
	{
		id: CHAT_ID,
		label: i18n.baseText('agents.testCopy.channel.chat'),
		checked: store.selectedChannel === null,
		testId: 'agent-test-copy-channel-chat',
		data: {
			description: i18n.baseText('agents.testCopy.channel.chatDescription'),
			isChannel: false,
		},
	},
	...store.channels.map((channel) => ({
		id: channel.label,
		label: i18n.baseText('agents.testCopy.channel.slack', {
			interpolate: { label: channel.label },
		}),
		checked: store.selectedChannel?.label === channel.label,
		testId: 'agent-test-copy-channel-item',
		data: {
			description: i18n.baseText('agents.testCopy.channel.slackDescription', {
				interpolate: { label: channel.label },
			}),
			isChannel: true,
		},
	})),
]);

const chooseLabel = computed(() => i18n.baseText('agents.testCopy.channel.choose'));

function onSelect(id: string) {
	store.selectChannel(id === CHAT_ID ? null : id);
}

// The menu opens from this element. Without it, the menu in the composer opened at the page corner.
const anchor = useTemplateRef<HTMLElement>('anchor');

function resetToChat() {
	store.selectChannel(null);
}
</script>

<template>
	<!-- The place is chosen before the first message only. -->
	<N8nTooltip
		v-if="store.channels.length > 0 && !store.isPlaceLocked"
		:content="chooseLabel"
		placement="top"
		:disabled="store.selectedChannel !== null"
	>
		<span ref="anchor" :class="$style.picker">
			<N8nDropdownMenu
				:items="items"
				placement="top-end"
				:reference="anchor ?? undefined"
				width="calc(var(--spacing--5xl) + var(--spacing--2xl))"
				data-testid="agent-test-copy-channel-picker"
				content-test-id="agent-test-copy-channel-menu"
				@select="onSelect"
			>
				<template #trigger>
					<N8nButton
						v-if="store.selectedChannel"
						variant="ghost"
						size="small"
						:class="$style.chip"
						:aria-label="chooseLabel"
						data-attr="agent-test-copy-channel-picker"
						data-test-id="agent-test-copy-channel-chip"
					>
						<AgentTestCopyAppIcon app-key="slack" :size="14" />
						<span :class="$style.chipLabel">{{ store.selectedChannel.label }}</span>
					</N8nButton>
					<N8nIconButton
						v-else
						variant="ghost"
						icon="message-circle"
						icon-size="large"
						:aria-label="chooseLabel"
						data-attr="agent-test-copy-channel-picker"
						data-test-id="agent-test-copy-channel-button"
					/>
				</template>
				<template #item-leading="{ item, ui }">
					<span :class="[ui.class, $style.itemIcon]">
						<AgentTestCopyAppIcon v-if="item.data?.isChannel" app-key="slack" :size="16" />
						<N8nIcon v-else icon="message-circle" :size="16" />
					</span>
				</template>
				<template #item-label="{ item, ui }">
					<span :class="[ui.class, $style.itemText]">
						<span>{{ item.label }}</span>
						<span :class="$style.itemDescription">{{ item.data?.description }}</span>
					</span>
				</template>
			</N8nDropdownMenu>
			<N8nIconButton
				v-if="store.selectedChannel"
				variant="ghost"
				size="xsmall"
				icon="x"
				:class="$style.remove"
				:aria-label="i18n.baseText('agents.testCopy.channel.reset')"
				:title="i18n.baseText('agents.testCopy.channel.reset')"
				data-test-id="agent-test-copy-channel-reset"
				@click="resetToChat"
			/>
		</span>
	</N8nTooltip>
</template>

<style lang="scss" module>
.picker {
	display: inline-flex;
	align-items: center;
	min-width: 0;
}

/* The chip: the trigger and the remove button share one rounded outline. */
.picker:has(.remove) {
	border: var(--border);
	border-radius: var(--radius--full);
	padding-inline-end: var(--spacing--5xs);
}

.chip {
	min-width: 0;
	gap: var(--spacing--4xs);
	border-radius: var(--radius--full);
}

.chipLabel {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.remove {
	flex-shrink: 0;
	border-radius: var(--radius--full);
}

.itemIcon {
	display: inline-flex;
	align-self: flex-start;
	padding-top: var(--spacing--5xs);
	color: var(--text-color--subtle);
}

.itemText {
	display: flex;
	flex-direction: column;
	min-width: 0;
	white-space: normal;
}

.itemDescription {
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
}
</style>
