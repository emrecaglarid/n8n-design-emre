<script setup lang="ts">
import { computed, ref } from 'vue';
import { N8nTooltip } from '@n8n/design-system';

import { useAgentCrewStore, type CrewMember } from './agentCrew.store';

/**
 * AI Trust prototype: the crew as chat participants. A horizontal avatar
 * stack at the top of the builder thread — who they are lives in the hover
 * tooltip, and the + invites more stakeholders. Clicking the Tester makes it
 * introduce itself in the thread with things to try.
 */
const props = defineProps<{
	projectId: string;
	agentId: string;
}>();

const crew = useAgentCrewStore();

const members = computed(() => crew.getActiveMembers(props.agentId));
const addable = computed(() => crew.getAddableMembers(props.agentId));
const addMenuOpen = ref(false);

const AVATAR_STYLE: Record<string, { bg: string; glyph: string }> = {
	builder: { bg: 'var(--color--primary)', glyph: 'B' },
	tester: { bg: '#3C8C69', glyph: 'T' },
	intercom: { bg: '#1F73B7', glyph: 'I' },
	anna: { bg: '#4A7DAB', glyph: 'A' },
	'external-agent': { bg: '#8E7CC3', glyph: 'E' },
};

function avatarFor(member: CrewMember) {
	return AVATAR_STYLE[member.id] ?? { bg: '#7C7C7C', glyph: member.name[0]?.toUpperCase() ?? '?' };
}

function onAvatarClick(member: CrewMember) {
	if (member.id === 'tester') {
		void crew.showTesterGreeting(props.projectId, props.agentId);
	}
}

function onAdd(memberId: string) {
	crew.addMember(props.agentId, memberId);
	addMenuOpen.value = false;
}
</script>

<template>
	<div :class="$style.row" data-testid="agent-crew-avatar-row">
		<N8nTooltip v-for="member in members" :key="member.id" placement="bottom">
			<template #content>
				<b>{{ member.name }}</b
				><br />{{ member.detail }}
			</template>
			<button
				:class="$style.avatar"
				:style="{ backgroundColor: avatarFor(member).bg }"
				:data-testid="`agent-crew-avatar-${member.id}`"
				@click="onAvatarClick(member)"
			>
				{{ avatarFor(member).glyph }}
			</button>
		</N8nTooltip>

		<span v-if="addable.length > 0" :class="$style.addWrapper">
			<N8nTooltip placement="bottom" :disabled="addMenuOpen">
				<template #content>Add someone to check this agent</template>
				<button
					:class="$style.addButton"
					data-testid="agent-crew-add"
					@click="addMenuOpen = !addMenuOpen"
				>
					+
				</button>
			</N8nTooltip>
			<span v-if="addMenuOpen" :class="$style.addMenu">
				<button
					v-for="candidate in addable"
					:key="candidate.id"
					:class="$style.addOption"
					@click="onAdd(candidate.id)"
				>
					<span
						:class="$style.addOptionAvatar"
						:style="{ backgroundColor: avatarFor(candidate).bg }"
					>
						{{ avatarFor(candidate).glyph }}
					</span>
					<span :class="$style.addOptionText">
						<span :class="$style.addOptionName">{{ candidate.name }}</span>
						<span :class="$style.addOptionDetail">{{ candidate.detail }}</span>
					</span>
				</button>
			</span>
		</span>
	</div>
</template>

<style lang="scss" module>
.row {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	padding: var(--spacing--2xs) var(--spacing--sm);
	border-bottom: var(--border);
}

.avatar {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	border: 2px solid var(--color--background--light-2, #fff);
	color: #fff;
	font-size: 12px;
	font-weight: var(--font-weight--bold);
	cursor: pointer;
	transition-property: scale;
	transition-duration: 100ms;

	/* Chat-app style overlap */
	&:not(:first-child) {
		margin-left: -6px;
	}

	&:hover {
		scale: 1.08;
		z-index: 1;
	}

	&:active {
		scale: 0.96;
	}
}

.addWrapper {
	position: relative;
	margin-left: var(--spacing--3xs);
}

.addButton {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	background: transparent;
	border: 1px dashed var(--color--foreground--shade-1);
	color: var(--color--text--tint-1);
	font-size: 14px;
	cursor: pointer;

	&:hover {
		color: var(--color--text);
		border-color: var(--color--text--tint-1);
	}
}

.addMenu {
	position: absolute;
	top: calc(100% + 6px);
	left: 0;
	z-index: 20;
	display: flex;
	flex-direction: column;
	width: 300px;
	background: var(--color--background--light-2);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius--lg);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
	overflow: hidden;
}

.addOption {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	background: transparent;
	border: none;
	text-align: left;
	cursor: pointer;

	&:hover {
		background: var(--color--background);
	}
}

.addOptionAvatar {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 50%;
	color: #fff;
	font-size: 11px;
	font-weight: var(--font-weight--bold);
}

.addOptionText {
	display: flex;
	flex-direction: column;
	gap: 1px;
	min-width: 0;
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
</style>
