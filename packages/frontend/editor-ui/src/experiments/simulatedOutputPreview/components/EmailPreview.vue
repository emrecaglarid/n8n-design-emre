<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
	from?: string;
	to?: string;
	subject?: string;
	body?: string;
}>();

const looksLikeHtml = computed(() => /<[a-z][^>]*>/i.test(props.body ?? ''));
const plainBody = computed(() =>
	looksLikeHtml.value
		? (props.body ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
		: (props.body ?? ''),
);
</script>

<template>
	<div :class="$style.email">
		<div :class="$style.headers">
			<div v-if="from" :class="$style.headerRow">
				<span :class="$style.headerLabel">From</span>
				<span :class="$style.headerValue">{{ from }}</span>
			</div>
			<div :class="$style.headerRow">
				<span :class="$style.headerLabel">To</span>
				<span :class="$style.headerValue">{{ to }}</span>
			</div>
			<div :class="$style.headerRow">
				<span :class="$style.headerLabel">Subject</span>
				<span :class="[$style.headerValue, $style.subject]">{{ subject }}</span>
			</div>
		</div>
		<div :class="$style.body">{{ plainBody }}</div>
	</div>
</template>

<style lang="scss" module>
.email {
	background: var(--color--background--light-3, var(--color--background));
	border: var(--border);
	border-radius: var(--radius);
	overflow: hidden;
}

.headers {
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border);
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.headerRow {
	display: flex;
	gap: var(--spacing--2xs);
	font-size: var(--font-size--2xs);
	min-width: 0;
}

.headerLabel {
	flex: 0 0 48px;
	color: var(--color--text--tint-1);
}

.headerValue {
	color: var(--color--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.subject {
	font-weight: var(--font-weight--bold);
}

.body {
	padding: var(--spacing--xs);
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	text-wrap: pretty;
	max-height: 180px;
	overflow-y: auto;
}
</style>
