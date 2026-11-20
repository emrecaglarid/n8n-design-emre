<script setup lang="ts">
import type { AgentTestChange } from '@n8n/api-types';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { useOptionalAgentTestCopyStore } from '../testCopy.store';
import AgentTestCopySlackMessage from './AgentTestCopySlackMessage.vue';
import AgentTestCopyTile from './AgentTestCopyTile.vue';

const props = defineProps<{ change: AgentTestChange }>();

const i18n = useI18n();
const store = useOptionalAgentTestCopyStore();

function channelLabel(channel: string): string {
	return channel.startsWith('#') || channel.length === 0 ? channel : `#${channel}`;
}

const source = computed(() => {
	const { change } = props;
	if (change.kind === 'email' && change.email) {
		return i18n.baseText('agents.testCopy.source.emailTo', {
			interpolate: { to: change.email.to.join(', ') },
		});
	}
	if (change.kind === 'message' && change.message) {
		const channel = channelLabel(change.message.channel);
		return change.message.inThread
			? i18n.baseText('agents.testCopy.source.thread', { interpolate: { channel } })
			: channel;
	}
	if (change.kind === 'row' && change.row) return change.row.sheet;
	if (change.kind === 'record' && change.record) {
		return i18n.baseText('agents.testCopy.source.record', {
			interpolate: {
				label: change.record.label,
				app: change.app,
				object: change.record.object.toLowerCase(),
			},
		});
	}
	return change.app;
});

const isSend = computed(() => props.change.status === 'notSent');
/** Why the change did not go through in the real app, if it was tried and failed. */
const applyError = computed(() =>
	props.change.appliedAt ? undefined : store?.applyErrors[props.change.id],
);

const status = computed(() => {
	if (props.change.appliedAt) {
		return i18n.baseText(
			isSend.value ? 'agents.testCopy.status.sent' : 'agents.testCopy.status.saved',
		);
	}
	if (applyError.value) return i18n.baseText('agents.testCopy.status.failed');
	return i18n.baseText(
		isSend.value ? 'agents.testCopy.status.notSent' : 'agents.testCopy.status.notSaved',
	);
});

/** The agent posts the message, so it shows under the agent's name. */
const senderName = computed(
	() => store?.agentName || props.change.message?.senderName || props.change.app,
);

const otherBody = computed(() => {
	const body = props.change.other?.body;
	if (body === undefined) return '';
	if (typeof body === 'string') return body;
	return JSON.stringify(body, null, 2) ?? '';
});
</script>

<template>
	<AgentTestCopyTile
		:app-key="change.appKey"
		:source="source"
		:status="status"
		write
		:data-test-copy-preview="change.id"
		data-testid="agent-test-copy-change-preview"
	>
		<template v-if="change.kind === 'email' && change.email">
			<span :class="$style.subject">{{ change.email.subject }}</span>
			<span v-if="change.email.cc?.length" :class="$style.meta">
				{{
					i18n.baseText('agents.testCopy.preview.cc', {
						interpolate: { cc: change.email.cc.join(', ') },
					})
				}}
			</span>
			<span :class="$style.pre">{{ change.email.body }}</span>
		</template>

		<AgentTestCopySlackMessage
			v-else-if="change.kind === 'message' && change.message"
			:sender-name="senderName"
			:text="change.message.text"
			:time="change.createdAt"
			is-app
		/>

		<div v-else-if="change.kind === 'row' && change.row" :class="$style.sheetScroll">
			<table :class="$style.sheet">
				<thead>
					<tr>
						<th v-for="(column, index) in change.row.columns" :key="index">{{ column }}</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(contextRow, rowIndex) in change.row.contextRows" :key="rowIndex">
						<td v-for="(cell, cellIndex) in contextRow" :key="cellIndex">{{ cell }}</td>
					</tr>
					<tr :class="$style.newRow">
						<td v-for="(cell, cellIndex) in change.row.values" :key="cellIndex">{{ cell }}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<ul v-else-if="change.kind === 'record' && change.record" :class="$style.fields">
			<li v-for="field in change.record.fields" :key="field.name" :class="$style.field">
				<span :class="$style.meta">{{ field.name }}</span>
				<span :class="$style.values">
					<span :class="field.before === null ? $style.empty : $style.before">
						{{ field.before ?? i18n.baseText('agents.testCopy.preview.empty') }}
					</span>
					<span :class="$style.meta" aria-hidden="true">→</span>
					<span :class="field.after === null ? $style.empty : $style.after">
						{{ field.after ?? i18n.baseText('agents.testCopy.preview.empty') }}
					</span>
				</span>
			</li>
		</ul>

		<template v-else-if="change.other">
			<span :class="$style.request">
				<span :class="$style.after">{{ change.other.method }}</span>
				<span :class="$style.url">{{ change.other.url }}</span>
			</span>
			<pre v-if="otherBody" :class="[$style.pre, $style.code]">{{ otherBody }}</pre>
		</template>

		<span v-else>{{ change.title }}</span>

		<span v-if="applyError" :class="$style.applyError" data-testid="agent-test-copy-apply-error">
			{{ applyError }}
		</span>
	</AgentTestCopyTile>
</template>

<style lang="scss" module>
.applyError {
	color: var(--text-color--subtle);
	font-size: var(--test-copy--font-size--meta);
	overflow-wrap: anywhere;
}

.subject {
	font-weight: var(--font-weight--bold);
}

.meta {
	color: var(--text-color--subtler);
	font-size: var(--test-copy--font-size--meta);
}

.pre {
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.code {
	font-family: var(--font-family--monospace, monospace);
	font-size: var(--test-copy--font-size--meta);
}

.sheetScroll {
	border: var(--border);
	border-radius: var(--radius--xs);
	overflow: hidden;
}

.sheet {
	width: 100%;
	border-collapse: collapse;

	/* Cells wrap between words only, so every value stays readable and short ones stay whole. */
	th,
	td {
		padding: var(--spacing--3xs) var(--spacing--xs);
		text-align: left;
		vertical-align: top;
		white-space: normal;
		overflow-wrap: break-word;
	}

	th {
		color: var(--text-color--subtle);
		font-size: var(--test-copy--font-size--meta);
		font-weight: var(--font-weight--bold);
		background-color: var(--background--subtle);
	}

	tr + tr td,
	tbody tr:first-child td {
		border-top: var(--border);
	}

	td + td,
	th + th {
		border-left: var(--border);
	}
}

.newRow td {
	background-color: var(--background--success, var(--background--subtle));
	font-weight: var(--font-weight--bold);
}

.fields {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}

.field {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--5xs);
}

.values {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: var(--spacing--3xs);
}

.before {
	color: var(--text-color--subtler);
	text-decoration: line-through;
}

.empty {
	color: var(--text-color--subtler);
	font-style: italic;
}

.after {
	font-weight: var(--font-weight--bold);
}

.request {
	display: flex;
	gap: var(--spacing--2xs);
	overflow-wrap: anywhere;
}

.url {
	min-width: 0;
	color: var(--text-color--subtle);
}
</style>
