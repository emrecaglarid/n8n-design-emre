<script setup lang="ts">
import { computed } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import { GOOGLE_GMAIL_NODE_TYPE } from '@/app/constants/nodeTypes';
import type { SimulatedPreview, PreviewVerdict } from '../simulatedOutputPreview.store';
import SlackMessagePreview from './SlackMessagePreview.vue';
import EmailPreview from './EmailPreview.vue';

const props = defineProps<{
	preview: SimulatedPreview;
}>();

const emit = defineEmits<{
	verdict: [verdict: PreviewVerdict];
	close: [];
}>();

const nodeTypesStore = useNodeTypesStore();
const nodeType = computed(() => nodeTypesStore.getNodeType(props.preview.nodeType));

const title = computed(() => {
	if (props.preview.kind === 'slack') return 'Slack message';
	return props.preview.nodeType === GOOGLE_GMAIL_NODE_TYPE ? 'Gmail' : 'Email';
});
</script>

<template>
	<div
		:class="$style.card"
		:data-simulated-preview-card="preview.id"
		data-test-id="simulated-output-card"
	>
		<div :class="$style.header">
			<NodeIcon :node-type="nodeType" :size="16" />
			<span :class="$style.title">{{ title }}</span>
			<span :class="$style.previewOnly">Preview only</span>
			<button :class="$style.closeButton" title="Close" @click="emit('close')">
				<N8nIcon icon="x" size="small" />
			</button>
		</div>
		<div :class="$style.body">
			<SlackMessagePreview
				v-if="preview.kind === 'slack'"
				:channel="preview.channel"
				:message-text="preview.messageText"
				:executed-at="preview.executedAt"
			/>
			<EmailPreview
				v-else
				:from="preview.from"
				:to="preview.to"
				:subject="preview.subject"
				:body="preview.body"
			/>
		</div>
		<div :class="$style.footer">
			<button
				:class="$style.thumbsDownButton"
				title="Not right"
				data-test-id="simulated-output-thumbs-down"
				@click="emit('verdict', 'down')"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M17 14V2" />
					<path
						d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
					/>
				</svg>
			</button>
			<button
				:class="$style.looksGoodButton"
				data-test-id="simulated-output-looks-good"
				@click="emit('verdict', 'up')"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M7 10v12" />
					<path
						d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
					/>
				</svg>
				Looks good
			</button>
		</div>
	</div>
</template>

<style lang="scss" module>
.card {
	width: 566px;
	max-width: 92vw;
	display: flex;
	flex-direction: column;
	background: var(--color--background--light-2, var(--color--background));
	border: var(--border);
	border-radius: var(--radius--lg);
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: var(--spacing--xs);
	border-bottom: var(--border);
}

.title {
	flex-grow: 1;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.previewOnly {
	flex: 0 0 auto;
	font-size: var(--font-size--3xs);
	color: var(--color--warning);
	background: var(--color--warning--tint-2, var(--color--foreground--tint-2));
	border-radius: var(--radius--sm);
	padding: 2px var(--spacing--2xs);
	white-space: nowrap;
}

.closeButton {
	flex: 0 0 auto;
	border: none;
	background: transparent;
	color: var(--color--text--tint-1);
	cursor: pointer;
	display: flex;
	align-items: center;
	padding: var(--spacing--4xs);

	&:hover {
		color: var(--color--text);
	}
}

.body {
	padding: var(--spacing--xs);
}

.footer {
	display: flex;
	align-items: stretch;
	justify-content: flex-end;
	gap: var(--spacing--2xs);
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-top: var(--border);
}

.thumbsDownButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	background: var(--color--background--light-3, var(--color--background));
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	color: var(--color--text);
	cursor: pointer;

	&:hover {
		border-color: var(--color--text--tint-1);
	}
}

.looksGoodButton {
	display: flex;
	align-items: center;
	gap: var(--spacing--2xs);
	padding: 5px 12px;
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	cursor: pointer;

	&:hover {
		filter: brightness(1.05);
	}
}
</style>
