<script setup lang="ts">
import { computed } from 'vue';
import { N8nButton, N8nIcon } from '@n8n/design-system';
import NodeIcon from '@/app/components/NodeIcon.vue';
import { useNodeTypesStore } from '@/app/stores/nodeTypes.store';
import type { SimulatedPreview } from '../simulatedOutputPreview.store';
import SlackMessagePreview from './SlackMessagePreview.vue';
import EmailPreview from './EmailPreview.vue';

const props = defineProps<{
	preview: SimulatedPreview;
}>();

const emit = defineEmits<{
	dismiss: [];
	close: [];
}>();

const nodeTypesStore = useNodeTypesStore();
const nodeType = computed(() => nodeTypesStore.getNodeType(props.preview.nodeType));

const title = computed(() =>
	props.preview.kind === 'slack'
		? `Message to #${(props.preview.channel ?? 'channel').replace(/^#/, '')}`
		: `Email to ${props.preview.to}`,
);

const statusText = computed(() => {
	if (!props.preview.nodeExecuted) return 'Rendered from this run — the node did not execute';
	if (props.preview.nodeErrored) return 'The node errored — this is what it tried to send';
	return 'Rendered from this run';
});
</script>

<template>
	<div :class="$style.card" data-simulated-preview-card data-test-id="simulated-output-card">
		<div :class="$style.header">
			<NodeIcon :node-type="nodeType" :size="16" />
			<span :class="$style.title">{{ title }}</span>
			<span :class="$style.simulatedBadge">
				<N8nIcon icon="eye" size="xsmall" />
				Simulated — nothing sent
			</span>
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
			<span :class="$style.status">
				{{ statusText }}
				<template v-if="preview.itemCount > 1"> · item 1 of {{ preview.itemCount }}</template>
			</span>
			<N8nButton
				type="secondary"
				size="mini"
				data-test-id="simulated-output-dismiss"
				@click="emit('dismiss')"
			>
				Looks good
			</N8nButton>
		</div>
	</div>
</template>

<style lang="scss" module>
@use '@n8n/design-system/css/common/var';

.card {
	width: 380px;
	max-width: 90vw;
	background: var(--color--background--light-2, var(--color--background));
	border: var(--border);
	border-radius: var(--radius--lg);
	box-shadow: var(--shadow--dark, 0 6px 16px rgba(0, 0, 0, 0.15));
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-bottom: var(--border);
}

.title {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
}

.simulatedBadge {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--4xs);
	margin-left: auto;
	flex: 0 0 auto;
	font-size: var(--font-size--3xs);
	color: var(--color--warning, var(--color--text--tint-1));
	background: var(--color--warning--tint-2, var(--color--foreground--tint-2));
	border-radius: var(--radius--sm);
	padding: var(--spacing--5xs, 2px) var(--spacing--3xs);
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
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing--2xs);
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-top: var(--border);
}

.status {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}
</style>
