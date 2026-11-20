import type { AgentSseEvent, AgentTestChannelContext } from '@n8n/api-types';
import { useI18n } from '@n8n/i18n';
import { isRecord } from '@n8n/utils/is-record';
import { computed, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter } from 'vue';

import { TIME } from '@/app/constants/durations';

import { useOptionalAgentTestCopyStore } from './testCopy.store';

/** The server can store a channel reply just after the stream ends. */
const LATE_REFRESH_DELAY = TIME.SECOND;

const REFRESH_EVENTS = new Set<AgentSseEvent['type']>(['tool-result', 'finish', 'done']);

/** Connects the test chat page to the test copy store. */
export function useTestCopyChatPage(options: {
	projectId: MaybeRefOrGetter<string>;
	agentId: MaybeRefOrGetter<string>;
	sessionId: MaybeRefOrGetter<string | undefined>;
	placeholder: MaybeRefOrGetter<string | undefined>;
	agentName: MaybeRefOrGetter<string | undefined>;
}) {
	const store = useOptionalAgentTestCopyStore();
	const i18n = useI18n();

	let lateRefresh: ReturnType<typeof setTimeout> | undefined;

	watch(
		() => [toValue(options.projectId), toValue(options.agentId), toValue(options.sessionId)],
		([projectId, agentId, sessionId], previous) => {
			if (!store) return;
			if (previous?.[2] && previous[2] !== sessionId) store.clearContext(previous[2]);
			if (!projectId || !agentId || !sessionId) return;
			void store.setContext({ projectId, agentId, sessionId });
		},
		{ immediate: true },
	);

	watch(
		() => toValue(options.agentName),
		(name) => store?.setAgentName(name?.trim() ?? ''),
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		clearTimeout(lateRefresh);
		const sessionId = toValue(options.sessionId);
		if (sessionId) store?.clearContext(sessionId);
	});

	const hasChannels = computed(() => (store?.channels.length ?? 0) > 0);

	/** The picker shows only before the first message. After it, the placeholder is the only cue. */
	const showPlaceControl = computed(() => hasChannels.value && !store?.isPlaceLocked);

	const placeholder = computed(() => {
		const channel = store?.sendChannel;
		if (!channel) return toValue(options.placeholder);
		return i18n.baseText(
			store?.isPlaceLocked
				? 'agents.testCopy.channel.placeholderThread'
				: 'agents.testCopy.channel.placeholder',
			{ interpolate: { label: channel.label } },
		);
	});

	/** Every send of a Slack session goes to its thread, the first one and each follow-up. */
	function clientContext(): Record<string, unknown> | undefined {
		const channel = store?.sendChannel;
		if (!channel) return undefined;
		const testChannel: AgentTestChannelContext = { type: 'slack', label: channel.label };
		return { testChannel };
	}

	function onStreamEvent(event: AgentSseEvent) {
		if (!store?.isActive || !REFRESH_EVENTS.has(event.type)) return;
		void store.refreshChanges();
		if (event.type === 'tool-result') return;
		clearTimeout(lateRefresh);
		lateRefresh = setTimeout(() => {
			void store.refreshChanges();
		}, LATE_REFRESH_DELAY);
	}

	function onMessageSending(payload: {
		text: string;
		clientContext?: Record<string, unknown>;
		isFirstMessage?: boolean;
	}) {
		if (!store) return;
		const testChannel = payload.clientContext?.testChannel;
		const send =
			isRecord(testChannel) && typeof testChannel.label === 'string'
				? {
						text: payload.text,
						label: testChannel.label,
						senderName:
							store.channels.find((item) => item.label === testChannel.label)?.senderName ?? '',
					}
				: null;
		if (send) store.recordChannelSend(send);
		// The first message fixes the place, so the picker goes away at once.
		if (payload.isFirstMessage) store.setSessionPlace(send);
	}

	function selectChannel(label: string | null) {
		store?.selectChannel(label);
	}

	return {
		placeholder,
		clientContext,
		hasChannels,
		showPlaceControl,
		onStreamEvent,
		onMessageSending,
		selectChannel,
	};
}
