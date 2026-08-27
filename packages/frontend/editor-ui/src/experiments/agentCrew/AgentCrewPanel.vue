<script setup lang="ts">
import { computed, ref } from 'vue';

import { useAgentCrewStore, type CrewMemberKind } from './agentCrew.store';

/**
 * AI Trust prototype: the crew block in the builder thread — who is checking
 * this agent, and the Tester's findings feed. Lives above the composer so the
 * roster reads as participants of the conversation, not a settings panel.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
}>();

const crew = useAgentCrewStore();

const members = computed(() => crew.getActiveMembers(props.agentId));
const addable = computed(() => crew.getAddableMembers(props.agentId));
const findings = computed(() => crew.getFindings(props.agentId));
const probing = computed(() => crew.getTesterStatus(props.agentId) === 'probing');
const stagedId = computed(() => crew.getStagedFinding(props.agentId)?.id ?? null);

const addMenuOpen = ref(false);
const collapsed = ref(false);

const MEMBER_ICONS: Record<CrewMemberKind, string> = {
	builder: '🤖',
	tester: '🤖',
	'scenario-source': '🔌',
	human: '🧑',
	'external-agent': '🛰️',
};

function onAdd(memberId: string) {
	crew.addMember(props.agentId, memberId);
	addMenuOpen.value = false;
}

function onRunTester() {
	void crew.runTester(props.projectId, props.agentId);
}

function onShowOnStage(findingId: string) {
	crew.stageFinding(props.agentId, stagedId.value === findingId ? null : findingId);
}

function truncate(text: string, max = 160): string {
	const trimmed = text.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}
</script>

<template>
	<div :class="$style.panel" data-testid="agent-crew-panel">
		<button :class="$style.header" @click="collapsed = !collapsed">
			<span :class="$style.headerLabel">Who's checking this agent</span>
			<span :class="$style.headerChevron">{{ collapsed ? '▸' : '▾' }}</span>
		</button>

		<template v-if="!collapsed">
			<div :class="$style.roster">
				<span v-for="member in members" :key="member.id" :class="$style.memberChip">
					<span>{{ MEMBER_ICONS[member.kind] }} {{ member.name }}</span>
					<button
						v-if="!member.fixed"
						:class="$style.memberRemove"
						title="Remove from the crew"
						@click="crew.removeMember(agentId, member.id)"
					>
						✕
					</button>
				</span>
				<span v-if="addable.length > 0" :class="$style.addWrapper">
					<button :class="$style.addChip" @click="addMenuOpen = !addMenuOpen">+ Add</button>
					<span v-if="addMenuOpen" :class="$style.addMenu">
						<button
							v-for="candidate in addable"
							:key="candidate.id"
							:class="$style.addOption"
							@click="onAdd(candidate.id)"
						>
							<span :class="$style.addOptionName"
								>{{ MEMBER_ICONS[candidate.kind] }} {{ candidate.name }}</span
							>
							<span :class="$style.addOptionDetail">{{ candidate.detail }}</span>
						</button>
					</span>
				</span>
			</div>

			<div
				v-for="member in members.filter((entry) => !entry.fixed)"
				:key="`note-${member.id}`"
				:class="$style.memberNote"
			>
				{{ MEMBER_ICONS[member.kind] }} {{ member.name }} — {{ member.detail }} (not wired yet)
			</div>

			<div v-for="finding in findings" :key="finding.id" :class="$style.finding">
				<span :class="$style.findingAvatar">T</span>
				<span :class="$style.findingBody">
					<span :class="$style.findingAuthor">Tester</span>
					<template v-if="finding.status === 'probing'">
						<span :class="$style.findingText">Trying: “{{ truncate(finding.input, 90) }}”…</span>
					</template>
					<template v-else-if="finding.status === 'error'">
						<span :class="$style.findingText"
							>I tried “{{ truncate(finding.input, 90) }}” but didn't get a reply.</span
						>
					</template>
					<template v-else>
						<span :class="$style.findingText">
							I asked: “{{ truncate(finding.input, 110) }}” — it replied: “{{
								truncate(finding.reply, 140)
							}}”.
							<template v-if="finding.whatToCheck"
								>I'd look at: {{ finding.whatToCheck }}.</template
							>
							Does this look right to you?
						</span>
						<button :class="$style.findingStage" @click="onShowOnStage(finding.id)">
							{{ stagedId === finding.id ? 'Hide from the stage' : 'Show me on the stage →' }}
						</button>
					</template>
				</span>
			</div>

			<button
				:class="$style.runTester"
				:disabled="probing"
				data-testid="agent-crew-run-tester"
				@click="onRunTester"
			>
				{{ probing ? 'Tester is trying things…' : '🤖 Have the Tester try a few things' }}
			</button>
		</template>
	</div>
</template>

<style lang="scss" module>
.panel {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
	padding: 10px 12px;
	margin-bottom: 8px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: transparent;
	border: none;
	padding: 0;
	cursor: pointer;
}

.headerLabel {
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--color--text--tint-1);
}

.headerChevron {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
}

.roster {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.memberChip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: var(--color--background);
	border: 1px solid var(--color--foreground);
	border-radius: 999px;
	padding: 3px 10px;
	font-size: var(--font-size--3xs);
	color: var(--color--text);
}

.memberRemove {
	background: transparent;
	border: none;
	padding: 0;
	font-size: 9px;
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.addWrapper {
	position: relative;
}

.addChip {
	background: transparent;
	border: 1px dashed var(--color--foreground--shade-1);
	border-radius: 999px;
	padding: 3px 10px;
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
		border-color: var(--color--text--tint-1);
	}
}

.addMenu {
	position: absolute;
	bottom: calc(100% + 6px);
	left: 0;
	z-index: 10;
	display: flex;
	flex-direction: column;
	width: 300px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	overflow: hidden;
}

.addOption {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	padding: 8px 10px;
	background: transparent;
	border: none;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: var(--color--background);
	}
}

.addOptionName {
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
}

.addOptionDetail {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	text-wrap: pretty;
}

.memberNote {
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	padding: 4px 8px;
	background: var(--color--background);
	border-radius: var(--radius);
	text-wrap: pretty;
}

.finding {
	display: flex;
	gap: 8px;
	padding: 6px 0;
}

.findingAvatar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	background: #3c8c69;
	color: #fff;
	font-size: 10px;
	font-weight: var(--font-weight--bold);
}

.findingBody {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.findingAuthor {
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	color: #3c8c69;
}

.findingText {
	font-size: var(--font-size--3xs);
	color: var(--color--text);
	line-height: 1.45;
	text-wrap: pretty;
	overflow-wrap: anywhere;
}

.findingStage {
	align-self: flex-start;
	background: transparent;
	border: 1px dashed var(--color--foreground--shade-1);
	border-radius: var(--radius);
	padding: 3px 8px;
	font-size: var(--font-size--3xs);
	color: var(--color--text--tint-1);
	cursor: pointer;

	&:hover {
		color: var(--color--text);
	}
}

.runTester {
	align-self: flex-start;
	background: var(--color--background);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--md);
	padding: 6px 12px;
	font-size: var(--font-size--3xs);
	font-weight: var(--font-weight--bold);
	color: var(--color--text);
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	&:active:not(:disabled) {
		scale: 0.96;
	}

	&:disabled {
		opacity: 0.6;
		cursor: default;
	}
}
</style>
