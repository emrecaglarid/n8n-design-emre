import { parseTestChannelMessage } from '@n8n/api-types';
import { computed, watch, type Ref } from 'vue';

import { CHAT_MESSAGE_ROLE } from '@/features/ai/shared/agentsChat/constants';
import {
	DISPLAY_GROUP_KIND,
	type DisplayGroup,
} from '@/features/ai/shared/agentsChat/displayGroups';

import {
	getChannelMessages,
	getTurnChanges,
	type TestChannelSend,
	type TestCopyTurnItem,
	type TestCopyTurns,
} from './testCopy.utils';
import { useTestCopyChat } from './useTestCopyChat';

/** Channel tiles for user messages and the changes row of each turn that made changes. */
export function useTestCopyMessageList(
	displayGroups: Ref<DisplayGroup[]>,
	/** The agent finished its turn: nothing streams and nothing is being sent. */
	isIdle: () => boolean = () => true,
) {
	const { store, isActive } = useTestCopyChat();

	const channelSendByGroupId = computed<Map<string, TestChannelSend>>(() => {
		if (!store || !isActive.value) return new Map();
		const userMessages = displayGroups.value.flatMap((group) =>
			group.kind === DISPLAY_GROUP_KIND.MESSAGE && group.message.role === CHAT_MESSAGE_ROLE.USER
				? [{ id: group.id, text: group.message.content }]
				: [],
		);
		return getChannelMessages(userMessages, store.sessionChannelSends);
	});

	const turns = computed<TestCopyTurns>(() => {
		if (!store || !isActive.value || store.changes.length === 0) {
			return { changes: new Map(), replies: new Map() };
		}
		const items: TestCopyTurnItem[] = [];
		for (const group of displayGroups.value) {
			if (group.kind === DISPLAY_GROUP_KIND.BACKGROUND_JOB_SIGNAL) continue;
			if (group.kind === DISPLAY_GROUP_KIND.TOOL_RUN) {
				items.push({
					id: group.id,
					role: 'assistant',
					toolCallIds: group.toolCalls.map((tc) => tc.toolCallId),
					hasText: Boolean(group.finalMessage?.content),
				});
				continue;
			}
			const isUser = group.message.role === CHAT_MESSAGE_ROLE.USER;
			items.push({
				id: group.id,
				role: isUser ? 'user' : 'assistant',
				toolCallIds: (group.message.toolCalls ?? []).map((tc) => tc.toolCallId),
				createdAt: group.message.createdAt,
				hasText: !isUser && Boolean(group.message.content),
			});
		}
		return getTurnChanges(items, store.changes, new Set(channelSendByGroupId.value.keys()));
	});

	// Replies are kept apart from the changes: a Slack session shows them as the agent's messages.
	const turnChangesByGroupId = computed(() => turns.value.changes);

	/** The place of the first user message. A session started from Slack is drawn as its thread. */
	const firstPlace = computed<TestChannelSend | null | undefined>(() => {
		if (!store || !isActive.value) return undefined;
		const first = displayGroups.value.find(
			(group) =>
				group.kind === DISPLAY_GROUP_KIND.MESSAGE && group.message.role === CHAT_MESSAGE_ROLE.USER,
		);
		if (!first) return undefined;
		return channelSendByGroupId.value.get(first.id) ?? null;
	});

	/** The first user message as the builder wrote it, for "Open in n8n Chat". */
	const firstMessageText = computed(() => {
		const first = displayGroups.value.find(
			(group) =>
				group.kind === DISPLAY_GROUP_KIND.MESSAGE && group.message.role === CHAT_MESSAGE_ROLE.USER,
		);
		if (!first || first.kind !== DISPLAY_GROUP_KIND.MESSAGE) return '';
		return (
			channelSendByGroupId.value.get(first.id)?.text ??
			parseTestChannelMessage(first.message.content)?.text ??
			first.message.content
		);
	});
	watch(firstMessageText, (text) => store?.setFirstMessageText(text), { immediate: true });

	// The history is the source of truth for the place, also after a reload.
	watch(
		firstPlace,
		(place) => {
			if (place !== undefined) store?.setSessionPlace(place);
		},
		{ immediate: true },
	);

	const thread = computed(() => store?.threadPlace ?? null);

	/**
	 * The last group of the first reply, once that turn is finished. It gets the
	 * next-step line and keeps it, so the line does not move when the builder
	 * sends more. A first turn whose changes were all made for real already
	 * offers n8n Chat in its changes row, so it gets none.
	 */
	const nextStepGroupId = computed<string | undefined>(() => {
		if (!store || !isActive.value) return undefined;
		const groups = displayGroups.value;
		const isUser = (group: (typeof groups)[number]) =>
			group.kind === DISPLAY_GROUP_KIND.MESSAGE && group.message.role === CHAT_MESSAGE_ROLE.USER;
		const firstUser = groups.findIndex(isUser);
		if (firstUser === -1) return undefined;
		const secondUser = groups.findIndex((group, index) => index > firstUser && isUser(group));
		const turnEnd = secondUser === -1 ? groups.length : secondUser;
		// The first turn is still running while it is the newest one and the chat is busy.
		if (secondUser === -1 && !isIdle()) return undefined;
		const last = groups[turnEnd - 1];
		if (!last || turnEnd - 1 <= firstUser) return undefined;
		if (last.kind === DISPLAY_GROUP_KIND.BACKGROUND_JOB_SIGNAL) return undefined;
		if (
			last.kind === DISPLAY_GROUP_KIND.TOOL_RUN
				? last.active
				: last.message.role !== CHAT_MESSAGE_ROLE.ASSISTANT
		) {
			return undefined;
		}
		const turnChanges = groups
			.slice(firstUser + 1, turnEnd)
			.flatMap((group) => turnChangesByGroupId.value.get(group.id) ?? []);
		if (turnChanges.length > 0 && turnChanges.every((change) => change.appliedAt)) return undefined;
		return last.id;
	});

	return { channelSendByGroupId, turnChangesByGroupId, thread, nextStepGroupId };
}
