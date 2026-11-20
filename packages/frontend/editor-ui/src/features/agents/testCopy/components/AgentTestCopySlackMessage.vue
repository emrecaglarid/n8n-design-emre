<script setup lang="ts">
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { formatTestCopyTime, getInitials, splitBoldText } from '../testCopy.utils';

/** A Slack message inside a tile: avatar, sender, time, then the text. */
const props = defineProps<{
	senderName: string;
	text: string;
	/** ISO date or epoch milliseconds. */
	time?: string | number;
	/** Marks the sender as an app, as Slack does for bots. */
	isApp?: boolean;
	/** Avatar letters, when they do not come from the sender name (for example "You"). */
	initials?: string;
}>();

const i18n = useI18n();

const avatarInitials = computed(() => props.initials || getInitials(props.senderName));
const parts = computed(() => splitBoldText(props.text));
const timeLabel = computed(() => (props.time === undefined ? '' : formatTestCopyTime(props.time)));
</script>

<template>
	<span :class="$style.message">
		<span :class="$style.avatar" aria-hidden="true">{{ avatarInitials }}</span>
		<span :class="$style.body">
			<span :class="$style.header">
				<span :class="$style.sender">{{ senderName }}</span>
				<span v-if="isApp" :class="$style.appTag">{{
					i18n.baseText('agents.testCopy.preview.appTag')
				}}</span>
				<span v-if="timeLabel" :class="$style.meta">{{ timeLabel }}</span>
			</span>
			<span :class="$style.text"
				><slot
					><template v-for="(part, index) in parts" :key="index"
						><strong v-if="part.bold">{{ part.text }}</strong
						><template v-else>{{ part.text }}</template></template
					></slot
				></span
			>
		</span>
	</span>
</template>

<style lang="scss" module>
/*
 * Both sides of a thread use this row, so names and texts match. The text uses
 * the app's regular size and line height, also for markdown in the agent's reply.
 */
.message {
	--n8n-markdown--font-size--base: var(--font-size--sm);

	font-size: var(--font-size--sm);
	line-height: var(--line-height--xl);
	display: flex;
	gap: var(--spacing--xs);
	min-width: 0;
}

.avatar {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	/* 36px, as in Slack. */
	width: calc(var(--spacing--xl) + var(--spacing--4xs));
	height: calc(var(--spacing--xl) + var(--spacing--4xs));
	border-radius: var(--radius--xs);
	background-color: var(--background--subtle);
	border: var(--border);
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
}

.body {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--5xs);
	min-width: 0;
	flex: 1;
}

.header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: var(--spacing--3xs);
	min-width: 0;
}

.sender {
	font-weight: var(--font-weight--bold);
	overflow-wrap: anywhere;
}

.appTag {
	padding: 0 var(--spacing--4xs);
	border-radius: var(--radius--3xs);
	background-color: var(--background--subtle);
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
}

.meta {
	color: var(--text-color--subtler);
	font-size: var(--font-size--xs);
}

.text {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
