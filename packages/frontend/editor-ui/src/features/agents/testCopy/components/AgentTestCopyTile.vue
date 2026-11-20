<script setup lang="ts">
import { N8nBadge, N8nIcon, N8nLoading } from '@n8n/design-system';

import type { AgentTestChangeAppKey } from '../testCopy.utils';
import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';

/**
 * The one box of the test copy UI: suggestions, messages sent from a channel,
 * and the previews of agent writes. A source line on top, then the content,
 * with an optional status chip for an agent write at the end of the source line.
 */
withDefaults(
	defineProps<{
		/** App of the source line. Without it, the source line shows the chat icon. */
		appKey?: AgentTestChangeAppKey;
		/** Where the content comes from or goes to, for example `#support`. Without it, the tile has no source line. */
		source?: string;
		/** Set only on agent writes, for example `Not sent`. Shows as a chip on the source line. */
		status?: string;
		/** Agent writes get a dashed border. */
		write?: boolean;
		/** Renders the tile as a button. */
		as?: 'div' | 'button';
		/** Shows placeholder bars in place of the source line and the content. */
		loading?: boolean;
	}>(),
	{
		appKey: undefined,
		source: undefined,
		status: undefined,
		write: false,
		as: 'div',
		loading: false,
	},
);
</script>

<template>
	<component
		:is="as"
		:type="as === 'button' ? 'button' : undefined"
		:class="[$style.tile, { [$style.write]: write, [$style.interactive]: as === 'button' }]"
		data-testid="agent-test-copy-tile"
	>
		<template v-if="loading">
			<span :class="$style.sourceLine">
				<N8nLoading variant="text" :class="$style.loadingSource" />
			</span>
			<span :class="$style.content">
				<slot name="loading" />
			</span>
		</template>
		<span v-else-if="source || status" :class="$style.sourceLine">
			<span v-if="source" :class="$style.sourceIcon">
				<AgentTestCopyAppIcon v-if="appKey" :app-key="appKey" :size="14" />
				<N8nIcon v-else icon="message-circle" :size="14" />
			</span>
			<span v-if="source" :class="$style.source" :title="source">{{ source }}</span>
			<N8nBadge
				v-if="status"
				variant="filled"
				size="xsmall"
				:class="$style.status"
				data-testid="agent-test-copy-tile-status"
			>
				{{ status }}
			</N8nBadge>
		</span>
		<span v-if="!loading" :class="$style.content">
			<slot />
		</span>
	</component>
</template>

<style lang="scss" module>
@use '@n8n/design-system/css/mixins/breakpoints';

/*
 * Two text sizes only: the chat body size for content, and one meta size for
 * source lines, labels and times.
 */
.tile {
	--test-copy--font-size--body: var(--n8n-markdown--font-size--base, var(--font-size--sm));
	--test-copy--font-size--meta: var(--font-size--xs);

	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	width: 100%;
	min-width: 0;
	padding: var(--spacing--sm);
	border: var(--border-width) solid var(--border-color);
	border-radius: var(--radius--xl);
	background-color: var(--background--surface);
	color: var(--text-color);
	font: inherit;
	font-size: var(--test-copy--font-size--body);
	line-height: var(--line-height--xl);
	text-align: left;
	user-select: text;

	/* Same step up as the chat text in N8nChatMessage. */
	@include breakpoints.breakpoint('xl-only') {
		--test-copy--font-size--body: var(--n8n-markdown--font-size--base, var(--font-size--md));
	}
}

.write {
	border-style: dashed;
}

.interactive {
	cursor: pointer;
	user-select: none;
	transition: background-color var(--duration--snappy) var(--easing--ease-out);

	&:hover {
		background-color: var(--background--subtle);
	}

	&:focus-visible {
		outline: var(--focus--border-width, 2px) solid var(--focus--border-color, currentColor);
		outline-offset: var(--spacing--5xs);
	}
}

.sourceLine {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	min-width: 0;
	color: var(--text-color--subtle);
	font-size: var(--test-copy--font-size--meta);
	line-height: var(--line-height--md);
}

.sourceIcon {
	display: inline-flex;
	flex-shrink: 0;
}

.source {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.status {
	flex-shrink: 0;
}

.loadingSource {
	width: 30%;
	line-height: var(--line-height--md);
}

.content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	min-width: 0;
}
</style>
