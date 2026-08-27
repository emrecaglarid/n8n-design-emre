<script setup lang="ts">
import { computed } from 'vue';

import { useAgentCrewStore } from './agentCrew.store';

/**
 * AI Trust prototype: the Tester's side of the builder conversation. Its
 * greeting and findings render as chat messages just above the composer — no
 * panel chrome, so the Tester reads as a participant, not a widget.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
}>();

const crew = useAgentCrewStore();

const greetingShown = computed(() => crew.getGreetingShown(props.agentId));
const suggestions = computed(() => crew.getSuggestions(props.agentId));
const loadingSuggestions = computed(() => crew.getLoadingSuggestions(props.agentId));
const findings = computed(() => crew.getFindings(props.agentId));
const probing = computed(() => crew.getTesterStatus(props.agentId) === 'probing');
const stagedId = computed(() => crew.getStagedFinding(props.agentId)?.id ?? null);

const visible = computed(() => greetingShown.value || findings.value.length > 0);

function onSuggestionClick(rowId: number) {
	const suggestion = suggestions.value.find((entry) => entry.rowId === rowId);
	if (!suggestion || probing.value) return;
	void crew.probeSuggestion(props.projectId, props.agentId, suggestion);
}

function onShowOnStage(findingId: string) {
	crew.stageFinding(props.agentId, stagedId.value === findingId ? null : findingId);
}

function truncate(text: string, max = 140): string {
	const trimmed = text.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}
</script>

<template>
	<div v-if="visible" :class="$style.feed" data-testid="agent-crew-panel">
		<div v-if="greetingShown" :class="$style.message">
			<span :class="$style.avatar">T</span>
			<span :class="$style.body">
				<span :class="$style.author">Tester</span>
				<span :class="$style.text"
					>Hey! I can try things on this agent while you build. Want me to start with one of
					these?</span
				>
				<span v-if="loadingSuggestions" :class="$style.text">Thinking of things to try…</span>
				<span v-else-if="suggestions.length > 0" :class="$style.chipColumn">
					<button
						v-for="suggestion in suggestions"
						:key="suggestion.rowId"
						:class="$style.chip"
						:disabled="probing"
						data-testid="agent-crew-suggestion"
						@click="onSuggestionClick(suggestion.rowId)"
					>
						{{ truncate(suggestion.input, 90) }}
					</button>
				</span>
			</span>
		</div>

		<div v-for="finding in findings" :key="finding.id" :class="$style.message">
			<span :class="$style.avatar">T</span>
			<span :class="$style.body">
				<span :class="$style.author">Tester</span>
				<template v-if="finding.status === 'probing'">
					<span :class="$style.text">Trying: “{{ truncate(finding.input, 90) }}”…</span>
				</template>
				<template v-else-if="finding.status === 'error'">
					<span :class="$style.text"
						>I tried “{{ truncate(finding.input, 90) }}” but didn't get a reply.</span
					>
				</template>
				<template v-else>
					<span :class="$style.text">
						I asked: “{{ truncate(finding.input, 110) }}” — it replied: “{{
							truncate(finding.reply, 140)
						}}”.
						<template v-if="finding.whatToCheck">I'd look at: {{ finding.whatToCheck }}.</template>
						Does this look right to you?
					</span>
					<button :class="$style.stageLink" @click="onShowOnStage(finding.id)">
						{{ stagedId === finding.id ? 'Hide from the stage' : 'Show me on the stage →' }}
					</button>
				</template>
			</span>
		</div>
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
	background: #3c8c69;
	color: #fff;
	font-size: 11px;
	font-weight: var(--font-weight--bold);
}

.body {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	padding-top: 2px;
}

.author {
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	color: #3c8c69;
}

.text {
	font-size: var(--font-size--2xs);
	color: var(--color--text);
	line-height: 1.45;
	text-wrap: pretty;
	overflow-wrap: anywhere;
}

.chipColumn {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	margin-top: 2px;
}

.chip {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: 14px;
	padding: 4px 10px;
	font-size: var(--font-size--3xs);
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

.stageLink {
	align-self: flex-start;
	background: transparent;
	border: none;
	padding: 0;
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	text-decoration: underline;
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}
</style>
