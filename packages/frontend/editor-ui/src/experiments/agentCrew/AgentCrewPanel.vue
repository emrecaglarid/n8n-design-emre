<script setup lang="ts">
import { computed } from 'vue';

import { scopeLabel } from '@/experiments/findings/findings';

import { useAgentCrewStore } from './agentCrew.store';

/**
 * AI Trust prototype: the crew's side of the builder conversation, rendered as
 * chat above the composer — the Tester's greeting and findings, your verdicts
 * arriving from the preview, the Builder's proposed instruction fixes, and
 * system lines when someone joins. Everything the Tester actually does happens
 * in the preview conversation; this feed just narrates it.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
}>();

const crew = useAgentCrewStore();

const suggestions = computed(() => crew.getSuggestions(props.agentId));
const loadingSuggestions = computed(() => crew.getLoadingSuggestions(props.agentId));
const feed = computed(() => crew.getFeed(props.agentId));
const probing = computed(() => crew.getTesterStatus(props.agentId) === 'probing');

// One suggestion at a time: trying something shouldn't feel like setting up a
// suite. The next one appears once this one has been tried.
const nextSuggestion = computed(() => suggestions.value[0] ?? null);

const visible = computed(() => feed.value.length > 0);

function onSuggestionClick() {
	const suggestion = nextSuggestion.value;
	if (!suggestion || probing.value) return;
	crew.requestProbe(props.agentId, suggestion);
}

function onApply(proposalId: string) {
	void crew.applyProposal(props.projectId, props.agentId, proposalId);
}

function truncate(text: string, max = 140): string {
	const trimmed = text.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}
</script>

<template>
	<div v-if="visible" :class="$style.feed" data-testid="agent-crew-panel">
		<template v-for="item in feed" :key="item.id">
			<div v-if="item.kind === 'system'" :class="$style.systemLine">{{ item.text }}</div>

			<div v-else-if="item.kind === 'greeting'" :class="$style.message">
				<span :class="[$style.avatar, $style.testerAvatar]">T</span>
				<span :class="$style.body">
					<span :class="[$style.author, $style.testerAuthor]">Tester</span>
					<span :class="$style.text"
						>Hey! I can try things on this agent while you build. Tell me to test it, or start with
						this:</span
					>
					<span v-if="loadingSuggestions" :class="$style.text">Thinking of things to try…</span>
					<button
						v-else-if="nextSuggestion"
						:class="$style.chip"
						:disabled="probing"
						data-testid="agent-crew-suggestion"
						@click="onSuggestionClick"
					>
						{{ truncate(nextSuggestion.input, 90) }}
					</button>
				</span>
			</div>

			<div v-else-if="item.kind === 'verdict'" :class="$style.verdictWrap">
				<span :class="$style.verdictBubble">
					<span v-if="item.finding.scope.kind !== 'whole'" :class="$style.scopeTag">{{
						scopeLabel(item.finding.scope)
					}}</span>
					👎 {{ item.finding.body.reason }}
				</span>
			</div>

			<div v-else-if="item.kind === 'finding'" :class="$style.message">
				<span :class="[$style.avatar, $style.testerAvatar]">T</span>
				<span :class="$style.body">
					<span :class="[$style.author, $style.testerAuthor]">Tester</span>
					<template v-if="item.finding.progress === 'probing'">
						<span :class="$style.text"
							>Trying “{{ truncate(item.finding.input, 90) }}” in the preview…</span
						>
					</template>
					<template v-else-if="item.finding.progress === 'error'">
						<span :class="$style.text"
							>I tried “{{ truncate(item.finding.input, 90) }}” but didn't get a reply.</span
						>
					</template>
					<template v-else>
						<span :class="$style.text">
							I asked “{{ truncate(item.finding.input, 110) }}” — the reply is in the preview. Does
							it look right to you?
						</span>
					</template>
				</span>
			</div>

			<div
				v-else-if="item.kind === 'proposal' && item.proposal.status !== 'skipped'"
				:class="$style.message"
			>
				<span :class="[$style.avatar, $style.builderAvatar]">B</span>
				<span :class="$style.body">
					<span :class="[$style.author, $style.builderAuthor]">Builder</span>
					<span :class="$style.text">Got it. Here's the instruction change:</span>
					<span :class="$style.diffCard">
						<span :class="$style.diffLabel">INSTRUCTIONS</span>
						<span :class="$style.diffAdded">+ {{ item.proposal.addedLine }}</span>
						<span v-if="item.proposal.status === 'proposed'" :class="$style.diffActions">
							<button
								:class="$style.applyButton"
								data-testid="agent-crew-apply-replay"
								@click="onApply(item.proposal.id)"
							>
								Apply &amp; replay
							</button>
							<button
								:class="$style.skipButton"
								@click="crew.skipProposal(agentId, item.proposal.id)"
							>
								Skip
							</button>
						</span>
						<span v-else-if="item.proposal.status === 'applying'" :class="$style.diffStatus"
							>Updating the instructions…</span
						>
						<span v-else-if="item.proposal.status === 'replaying'" :class="$style.diffStatus"
							>Replaying the same request in the preview…</span
						>
						<span v-else-if="item.proposal.status === 'done'" :class="$style.diffStatus"
							>Applied — the replay is in the preview.</span
						>
						<span v-else-if="item.proposal.status === 'error'" :class="$style.diffStatus"
							>The replay didn't come back — the instruction change is saved.</span
						>
					</span>
				</span>
			</div>
		</template>
	</div>
</template>

<style lang="scss" module>
.feed {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	width: 100%;
	margin-bottom: var(--spacing--2xs);
}

.message {
	display: flex;
	gap: 8px;
}

.avatar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	color: #fff;
	font-size: 11px;
	font-weight: var(--font-weight--bold);
}

.testerAvatar {
	background: #3c8c69;
}

.builderAvatar {
	background: var(--color--primary);
}

.body {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	padding-top: 2px;
}

.author {
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
}

.testerAuthor {
	color: #3c8c69;
}

.builderAuthor {
	color: var(--color--primary);
}

/* Matches the builder thread's message text (N8nText size="large") */
.text {
	font-size: var(--font-size--md);
	color: var(--color--text);
	line-height: var(--line-height--xl);
	text-wrap: pretty;
	overflow-wrap: anywhere;
}

.systemLine {
	align-self: center;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	text-align: center;
	text-wrap: pretty;
	padding: 2px 8px;
}

.verdictWrap {
	align-self: flex-end;
	display: flex;
	flex-direction: column;
	gap: 3px;
	max-width: 85%;
}

.scopeTag {
	display: block;
	margin-bottom: var(--spacing--4xs);
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	overflow-wrap: anywhere;
}

.verdictBubble {
	background: var(--color--background);
	border-radius: var(--radius--lg);
	padding: 8px 12px;
	font-size: var(--font-size--md);
	color: var(--color--text);
	line-height: var(--line-height--xl);
	overflow-wrap: anywhere;
}

.chip {
	align-self: flex-start;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: 15px;
	padding: 5px 12px;
	font-size: var(--font-size--xs);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale, background-color;
	transition-duration: 100ms;

	&:hover:not(:disabled) {
		background: var(--color--background);
	}

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.diffCard {
	display: flex;
	flex-direction: column;
	gap: 5px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	padding: 8px 10px;
}

.diffLabel {
	font-size: 9px;
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.06em;
	color: var(--color--text--tint-1);
}

.diffAdded {
	font-size: var(--font-size--xs);
	color: #1f7a4d;
	background: #e3f5e9;
	border-radius: 4px;
	padding: 4px 7px;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.diffActions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 2px;
}

.applyButton {
	background: var(--color--primary);
	border: none;
	border-radius: var(--radius);
	color: #fff;
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	padding: 5px 11px;
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active {
		scale: 0.96;
	}
}

.skipButton {
	background: transparent;
	border: none;
	padding: 0;
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.diffStatus {
	font-size: var(--font-size--2xs);
	color: var(--color--text--tint-1);
}
</style>
