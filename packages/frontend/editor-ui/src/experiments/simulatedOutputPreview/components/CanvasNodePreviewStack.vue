<script setup lang="ts">
import { computed } from 'vue';
import { N8nIcon } from '@n8n/design-system';
import { useCanvasNode } from '@/features/workflows/canvas/composables/useCanvasNode';
import { useSimulatedOutputPreviewStore } from '../simulatedOutputPreview.store';

const { name } = useCanvasNode();
const store = useSimulatedOutputPreviewStore();

const count = computed(() => store.stackCount(name.value));

function onClick(event: MouseEvent) {
	event.stopPropagation();
	store.openFromStack(name.value);
}
</script>

<template>
	<button
		v-if="count > 0"
		:class="$style.stack"
		title="View simulated output previews"
		data-test-id="simulated-output-node-stack"
		@click="onClick"
		@mousedown.stop
		@dblclick.stop
	>
		<span :class="$style.layerBack" />
		<span :class="$style.layerMid" />
		<span :class="$style.chip">
			<N8nIcon icon="eye" size="xsmall" />
			{{ count }}
		</span>
	</button>
</template>

<style lang="scss" module>
.stack {
	position: absolute;
	top: -10px;
	right: -10px;
	border: none;
	background: transparent;
	padding: 0;
	cursor: pointer;
	z-index: 1;
	transition-property: scale;
	transition-duration: 100ms;

	/* The visible chip is ~20px tall; widen the hit area a little without
	   eating into the node's own double-click surface */
	&::after {
		content: '';
		position: absolute;
		inset: -5px;
	}

	&:active {
		scale: 0.96;
	}
}

.layerBack,
.layerMid {
	position: absolute;
	inset: 0;
	border-radius: var(--radius--sm);
	border: var(--border);
	background: var(--color--background--light-2, var(--color--background));
}

.layerBack {
	transform: translate(4px, -4px) rotate(3deg);
	opacity: 0.5;
}

.layerMid {
	transform: translate(2px, -2px) rotate(1.5deg);
	opacity: 0.75;
}

.chip {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 2px;
	border: var(--border);
	border-radius: var(--radius--sm);
	background: var(--color--background--light-2, var(--color--background));
	color: var(--color--text);
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	font-variant-numeric: tabular-nums;
	padding: 1px var(--spacing--3xs);
	box-shadow: var(--shadow--light, 0 1px 4px rgba(0, 0, 0, 0.08));
}

.stack:hover .chip {
	border-color: var(--color--primary);
	color: var(--color--primary);
}
</style>
