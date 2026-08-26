<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
	channel?: string;
	messageText?: string;
	executedAt: number;
}>();

const channelLabel = computed(() => `#${(props.channel ?? 'channel').replace(/^#/, '')}`);
const time = computed(() =>
	new Date(props.executedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
);
</script>

<template>
	<div :class="$style.slack">
		<div :class="$style.channelHeader">
			<span :class="$style.channelName">{{ channelLabel }}</span>
		</div>
		<div :class="$style.message">
			<div :class="$style.avatar">n8n</div>
			<div :class="$style.content">
				<div :class="$style.meta">
					<span :class="$style.sender">n8n</span>
					<span :class="$style.appBadge">APP</span>
					<span :class="$style.time">{{ time }}</span>
				</div>
				<div :class="$style.text">{{ messageText }}</div>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.slack {
	background: var(--color--background--light-3, var(--color--background));
	border: var(--border);
	border-radius: var(--radius);
	overflow: hidden;
}

.channelHeader {
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border);
	font-weight: var(--font-weight--bold);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

.channelName {
	letter-spacing: 0.02em;
}

.message {
	display: flex;
	gap: var(--spacing--2xs);
	padding: var(--spacing--xs);
}

.avatar {
	flex: 0 0 auto;
	width: 36px;
	height: 36px;
	border-radius: var(--radius);
	background: var(--color--primary);
	color: var(--color--text--tint-3, #fff);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
}

.content {
	min-width: 0;
}

.meta {
	display: flex;
	align-items: baseline;
	gap: var(--spacing--3xs);
}

.sender {
	font-weight: var(--font-weight--bold);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
}

.appBadge {
	font-size: 9px;
	font-weight: var(--font-weight--bold);
	color: var(--color--text--tint-1);
	background: var(--color--foreground--tint-1);
	border-radius: var(--radius--sm);
	padding: 0 var(--spacing--4xs);
}

.time {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}

.text {
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	max-height: 180px;
	overflow-y: auto;
}
</style>
