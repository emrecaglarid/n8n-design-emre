<script setup lang="ts">
import { N8nIcon, N8nPopover } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import AgentTestCopyAppIcon from './AgentTestCopyAppIcon.vue';
import AgentTestCopyOpenInChat from './AgentTestCopyOpenInChat.vue';

/**
 * The opening of a Slack session, like the intro Slack shows at the top of a
 * channel. It sticks to the top of the pane when the thread scrolls, and then
 * shrinks to the channel name. The title opens what this test is, and offers
 * the agent without its limits: n8n Chat.
 */
defineProps<{ label: string; sessionId?: string }>();

const i18n = useI18n();

const intro = useTemplateRef<HTMLElement>('intro');
/** The intro is stuck to the top of the scroll area. */
const stuck = ref(false);
const open = ref(false);

let scroller: HTMLElement | null = null;
let frame = 0;

function scrollParent(element: HTMLElement | null): HTMLElement | null {
	let node = element?.parentElement ?? null;
	while (node) {
		const overflowY = getComputedStyle(node).overflowY;
		if (overflowY === 'auto' || overflowY === 'scroll') return node;
		node = node.parentElement;
	}
	return null;
}

function measure() {
	frame = 0;
	const element = intro.value;
	if (!element || !scroller) return;
	// Stuck once the content scrolled under it.
	stuck.value =
		scroller.scrollTop > 0 &&
		element.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 1;
}

function onScroll() {
	if (!frame) frame = requestAnimationFrame(measure);
}

onMounted(() => {
	scroller = scrollParent(intro.value);
	scroller?.addEventListener('scroll', onScroll, { passive: true });
	measure();
});

onBeforeUnmount(() => {
	scroller?.removeEventListener('scroll', onScroll);
	cancelAnimationFrame(frame);
});
</script>

<template>
	<div
		ref="intro"
		:class="[$style.intro, { [$style.stuck]: stuck }]"
		data-testid="agent-test-copy-thread-note"
	>
		<!-- The whole title opens what this test is, and the way to use the agent without its limits. -->
		<N8nPopover
			v-model:open="open"
			side="bottom"
			align="start"
			width="320px"
			:enable-scrolling="false"
		>
			<template #trigger>
				<button
					type="button"
					:class="[$style.heading, { [$style.open]: open }]"
					:aria-label="i18n.baseText('agents.testCopy.thread.about')"
					data-testid="agent-test-copy-thread-trigger"
					data-attr="agent-test-copy-thread-trigger"
				>
					<AgentTestCopyAppIcon app-key="slack" :size="stuck ? 16 : 20" />
					<span :class="$style.channel">{{ label }}</span>
					<N8nIcon icon="flask-conical" :size="stuck ? 12 : 14" :class="$style.flask" />
					<N8nIcon icon="chevron-down" :size="12" :class="$style.chevron" />
				</button>
			</template>
			<template #content>
				<div :class="$style.popover" data-testid="agent-test-copy-thread-popover">
					<p :class="$style.popoverText">
						{{ i18n.baseText('agents.testCopy.thread.popover', { interpolate: { label } }) }}
					</p>
					<p :class="$style.popoverText">
						{{ i18n.baseText('agents.testCopy.thread.popoverReal') }}
					</p>
					<AgentTestCopyOpenInChat />
				</div>
			</template>
		</N8nPopover>
		<p v-if="!stuck" :class="$style.text">
			{{ i18n.baseText('agents.testCopy.thread.note', { interpolate: { label } }) }}
		</p>
	</div>
</template>

<style lang="scss" module>
.intro {
	position: sticky;
	top: 0;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--spacing--3xs);
	padding-block: var(--spacing--sm) var(--spacing--md);
	/* A faint line closes the intro, like the top of a channel in Slack. */
	border-bottom: var(--border-width) solid var(--border-color--light, var(--border-color));
	color: var(--text-color);
}

/* The title is one button. At rest it has no outline and no arrow; both show on hover. */
.heading {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--2xs);
	margin-inline-start: calc(var(--spacing--2xs) * -1);
	padding: var(--spacing--4xs) var(--spacing--2xs);
	border: var(--border-width) solid transparent;
	border-radius: var(--radius--full);
	background: none;
	color: inherit;
	font: inherit;
	cursor: pointer;

	&:hover,
	&.open {
		border-color: var(--border-color);
	}

	&:hover .chevron,
	&.open .chevron,
	&:focus-visible .chevron {
		visibility: visible;
	}

	&:focus-visible {
		outline: var(--focus--border-width, 2px) solid var(--focus--border-color, currentColor);
	}
}

.flask {
	color: var(--text-color--subtle);
}

/* Takes its space at rest, so the title does not shift when it shows. */
.chevron {
	visibility: hidden;
	margin-inline-start: calc(var(--spacing--4xs) * -1);
	color: var(--text-color--subtle);
}

/* Stuck at the top: one compact line with the channel. */
.stuck {
	padding-block: var(--spacing--2xs) var(--spacing--xs);

	.channel {
		font-size: var(--font-size--sm);
		font-weight: var(--font-weight--bold);
	}
}

.channel {
	font-size: var(--font-size--lg);
	font-weight: var(--font-weight--bold);
	line-height: var(--line-height--md);
}

.text {
	margin: 0;
	font-size: var(--font-size--sm);
	line-height: var(--line-height--xl);
}

.popover {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--spacing--xs);
	padding: var(--spacing--sm);
}

.popoverText {
	margin: 0;
	color: var(--text-color);
	font-size: var(--font-size--sm);
	line-height: var(--line-height--lg);
}
</style>
