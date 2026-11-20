import type {
	AgentTestChange,
	AgentTestChannel,
	AgentTestCopyInfo,
	AgentTestSuggestion,
} from '@n8n/api-types';
import { defineStore, getActivePinia } from 'pinia';
import { computed, ref } from 'vue';
import { useRootStore } from '@n8n/stores/useRootStore';

import { useEnvFeatureFlag } from '@/features/shared/envFeatureFlag/useEnvFeatureFlag';

import {
	applyAgentTestChange,
	getAgentTestChanges,
	getAgentTestCopyInfo,
	getAgentTestSuggestions,
} from './testCopy.api';
import type { TestChannelSend } from './testCopy.utils';

interface TestCopyContext {
	projectId: string;
	agentId: string;
	sessionId: string;
}

/**
 * State of the test copy of the open test chat (prototype). One test chat is
 * open at a time, so the store follows that chat only.
 */
export const useAgentTestCopyStore = defineStore('agentTestCopy', () => {
	const rootStore = useRootStore();
	const envFeatureFlag = useEnvFeatureFlag();

	const isFlagEnabled = computed(() => envFeatureFlag.check.value('AGENT_TEST_COPIES'));

	const context = ref<TestCopyContext | null>(null);
	const info = ref<AgentTestCopyInfo | null>(null);
	const infoAgentKey = ref<string | null>(null);
	const changes = ref<AgentTestChange[]>([]);
	/** Messages sent from a channel, per session, in send order. */
	const channelSends = ref<Record<string, TestChannelSend[]>>({});
	/** Name of the agent under test. Its writes to a chat app show under this name. */
	const agentName = ref('');
	/** Label of the channel chosen in the composer. `null` is the chat. */
	const selectedChannelLabel = ref<string | null>(null);
	/**
	 * The place of the session, fixed by its first user message: a channel, or
	 * `null` for the chat. `undefined` until the session has a message.
	 */
	const sessionPlace = ref<TestChannelSend | null | undefined>(undefined);
	/** Text of the session's first user message, without a channel's context line. */
	const firstMessageText = ref('');
	/** Why a change did not go through in the real app, per change id. Never retried. */
	const applyErrors = ref<Record<string, string>>({});

	/** Suggested first messages, per agent. Kept while a newer list loads. */
	const suggestionsByAgent = ref<Record<string, AgentTestSuggestion[]>>({});
	const suggestionsLoadingKey = ref<string | null>(null);

	let fetchToken = 0;

	/** The agent of the open test chat. */
	const contextAgentId = computed(() => context.value?.agentId ?? '');

	const isActive = computed(
		() => isFlagEnabled.value && context.value !== null && info.value?.enabled === true,
	);

	const activeChanges = computed(() => (isActive.value ? changes.value : []));

	const channels = computed<AgentTestChannel[]>(() =>
		isActive.value ? (info.value?.channels ?? []) : [],
	);

	const selectedChannel = computed(
		() => channels.value.find((channel) => channel.label === selectedChannelLabel.value) ?? null,
	);

	/** The session has a first message, so its place cannot change. */
	const isPlaceLocked = computed(() => sessionPlace.value !== undefined);

	/** Where the next message goes: the session's place once locked, else the picker's choice. */
	const sendChannel = computed<{ label: string; senderName: string } | null>(() => {
		if (sessionPlace.value !== undefined) return sessionPlace.value;
		return selectedChannel.value;
	});

	/** The session is a Slack thread, so the chat draws it as one. */
	const threadPlace = computed(() => (isActive.value ? (sessionPlace.value ?? null) : null));

	const sessionChannelSends = computed<TestChannelSend[]>(() =>
		context.value ? (channelSends.value[context.value.sessionId] ?? []) : [],
	);

	const agentKey = computed(() =>
		context.value ? `${context.value.projectId}:${context.value.agentId}` : null,
	);

	/** Up to 4 suggestions for the empty chat: chat ones and channel ones. */
	const suggestions = computed<AgentTestSuggestion[]>(() =>
		isActive.value && agentKey.value
			? (suggestionsByAgent.value[agentKey.value] ?? []).slice(0, 4)
			: [],
	);

	/** Loading with nothing to show yet. A cached list shows while a new one loads. */
	const isLoadingSuggestions = computed(
		() =>
			isActive.value &&
			agentKey.value !== null &&
			suggestionsLoadingKey.value === agentKey.value &&
			suggestionsByAgent.value[agentKey.value] === undefined,
	);

	async function loadSuggestions(projectId: string, agentId: string) {
		const key = `${projectId}:${agentId}`;
		if (suggestionsLoadingKey.value === key) return;
		suggestionsLoadingKey.value = key;
		try {
			const result = await getAgentTestSuggestions(rootStore.restApiContext, projectId, agentId);
			suggestionsByAgent.value = { ...suggestionsByAgent.value, [key]: result.suggestions };
		} catch {
			// Suggestions are optional: on an error the empty chat shows none.
			if (suggestionsByAgent.value[key] === undefined) {
				suggestionsByAgent.value = { ...suggestionsByAgent.value, [key]: [] };
			}
		} finally {
			if (suggestionsLoadingKey.value === key) suggestionsLoadingKey.value = null;
		}
	}

	async function loadInfo(projectId: string, agentId: string) {
		const key = `${projectId}:${agentId}`;
		if (infoAgentKey.value === key && info.value) return;
		infoAgentKey.value = key;
		try {
			const result = await getAgentTestCopyInfo(rootStore.restApiContext, projectId, agentId);
			if (infoAgentKey.value === key) info.value = result;
		} catch {
			if (infoAgentKey.value === key) info.value = null;
		}
	}

	async function refreshChanges() {
		const current = context.value;
		if (!isFlagEnabled.value || !current) return;
		const token = ++fetchToken;
		try {
			const result = await getAgentTestChanges(
				rootStore.restApiContext,
				current.projectId,
				current.agentId,
				current.sessionId,
			);
			if (token === fetchToken && context.value === current) changes.value = result.changes;
		} catch {
			// A session that has not started yet has no changes.
			if (token === fetchToken && context.value === current) changes.value = [];
		}
	}

	/** Carries one change out for real, then reloads the list so every view shows it done. */
	async function setContext(next: TestCopyContext | null) {
		if (!isFlagEnabled.value) return;
		const previous = context.value;
		if (
			previous &&
			next &&
			previous.projectId === next.projectId &&
			previous.agentId === next.agentId &&
			previous.sessionId === next.sessionId
		) {
			return;
		}
		context.value = next;
		changes.value = [];
		if (!next) return;
		if (previous?.sessionId !== next.sessionId) {
			selectedChannelLabel.value = null;
			sessionPlace.value = undefined;
			firstMessageText.value = '';
			applyErrors.value = {};
		}
		await loadInfo(next.projectId, next.agentId);
		// The server caches suggestions per agent config, so a new session picks up edits.
		if (info.value?.enabled) void loadSuggestions(next.projectId, next.agentId);
		await refreshChanges();
	}

	/** Fixes the place of the session. Only its first message counts. */
	function setSessionPlace(place: TestChannelSend | null) {
		if (sessionPlace.value !== undefined && sessionPlace.value?.label === place?.label) return;
		sessionPlace.value = place;
	}

	function setFirstMessageText(text: string) {
		firstMessageText.value = text;
	}

	/**
	 * Makes the changes in the real apps, one at a time and in order. A change
	 * that fails keeps its error and is not retried. Returns how many went through.
	 */
	async function applyChanges(changeIds: string[]): Promise<number> {
		const current = context.value;
		if (!current) return 0;
		let done = 0;
		for (const changeId of changeIds) {
			try {
				await applyAgentTestChange(
					rootStore.restApiContext,
					current.projectId,
					current.agentId,
					current.sessionId,
					changeId,
				);
				done++;
				const rest = { ...applyErrors.value };
				delete rest[changeId];
				applyErrors.value = rest;
			} catch (error) {
				applyErrors.value = {
					...applyErrors.value,
					[changeId]: error instanceof Error ? error.message : String(error),
				};
			}
		}
		await refreshChanges();
		return done;
	}

	function clearContext(sessionId: string) {
		if (context.value?.sessionId !== sessionId) return;
		context.value = null;
		changes.value = [];
	}

	function setAgentName(name: string) {
		agentName.value = name;
	}

	function selectChannel(label: string | null) {
		selectedChannelLabel.value = label;
	}

	function recordChannelSend(send: TestChannelSend) {
		const sessionId = context.value?.sessionId;
		if (!sessionId) return;
		channelSends.value = {
			...channelSends.value,
			[sessionId]: [...(channelSends.value[sessionId] ?? []), send],
		};
	}

	return {
		isActive,
		info,
		changes: activeChanges,
		channels,
		selectedChannel,
		sessionChannelSends,
		suggestions,
		isLoadingSuggestions,
		agentName,
		setAgentName,
		setContext,
		clearContext,
		refreshChanges,
		selectChannel,
		recordChannelSend,
		isPlaceLocked,
		sendChannel,
		threadPlace,
		setSessionPlace,
		contextAgentId,
		firstMessageText,
		setFirstMessageText,
		applyErrors,
		applyChanges,
	};
});

/**
 * The store, or `null` without an active Pinia. Some unit tests of the shared
 * chat components mount them without Pinia, and the prototype must not break them.
 */
export function useOptionalAgentTestCopyStore() {
	return getActivePinia() ? useAgentTestCopyStore() : null;
}
