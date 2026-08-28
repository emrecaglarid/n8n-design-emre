import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';

import { useRootStore } from '@n8n/stores/useRootStore';

import { useAgentEvalsStore } from '@/features/agents/agentEvals.store';
import { useAgentChatStream } from '@/features/agents/composables/useAgentChatStream';
import { getAgentConfig, updateAgentConfig } from '@/features/agents/composables/useAgentApi';
import { isDataTableDataset, toCaseSource } from '@/features/agents/utils/agentEvalCases.utils';

/**
 * AI Trust prototype: the crew checking an agent. The Builder and the Tester
 * are always present; scenario sources, humans and external agents can join.
 * Only the Tester is live — it borrows drafted requests from the eval
 * machinery, runs each through a real chat session of its own (never the
 * user's preview session), and posts what it saw as a question.
 */

export type CrewMemberKind = 'builder' | 'tester' | 'scenario-source' | 'human' | 'external-agent';

export interface CrewMember {
	id: string;
	kind: CrewMemberKind;
	name: string;
	/** One-line honesty note shown when the member is active */
	detail: string;
	/** Members that ship with the crew and cannot be removed */
	fixed?: boolean;
}

export interface TesterFinding {
	id: string;
	input: string;
	reply: string;
	whatToCheck: string;
	status: 'probing' | 'done' | 'error';
}

export const CREW_CATALOGUE: CrewMember[] = [
	{
		id: 'builder',
		kind: 'builder',
		name: 'Builder',
		detail: 'builds and edits this agent',
		fixed: true,
	},
	{
		id: 'tester',
		kind: 'tester',
		name: 'Tester',
		detail: 'tries drafted requests on its own and posts what it saw',
		fixed: true,
	},
	{
		id: 'intercom',
		kind: 'scenario-source',
		name: 'Intercom',
		detail: 'feeds real incoming requests in as scenarios — replayed here, never answered live',
	},
	{
		id: 'anna',
		kind: 'human',
		name: 'Anna (human)',
		detail: 'gets drafts in a test channel; her reactions feed the same loop. She is asked first.',
	},
	{
		id: 'external-agent',
		kind: 'external-agent',
		name: 'External agent',
		detail: 'an agent outside this instance joins as a checker (via MCP)',
	},
];

export interface TesterSuggestion {
	rowId: number;
	input: string;
	whatToCheck: string;
}

/**
 * A verdict on the stage turned into a proposed instruction change. Apply is
 * real: the line is written into the agent's instructions and the same
 * request replays through a fresh session so before/after is a true diff.
 * Only the wording of the proposed line is templated from the reason.
 */
export interface FixProposal {
	id: string;
	reason: string;
	request: string;
	beforeReply: string;
	addedLine: string;
	status: 'proposed' | 'applying' | 'replaying' | 'done' | 'skipped' | 'error';
	afterReply: string;
}

export type CrewFeedItem =
	| { id: string; kind: 'system'; text: string }
	| { id: string; kind: 'verdict'; text: string }
	| { id: string; kind: 'finding'; finding: TesterFinding }
	| { id: string; kind: 'proposal'; proposal: FixProposal };

interface AgentCrewState {
	activeMemberIds: string[];
	feed: CrewFeedItem[];
	testerStatus: 'idle' | 'probing';
	stagedFindingId: string | null;
	stagedProposalId: string | null;
	/** rowIds of cases the tester already tried, so reruns pick fresh ones */
	probedRowIds: number[];
	/** The Tester introduced itself and offered things to try */
	greetingShown: boolean;
	suggestions: TesterSuggestion[];
	loadingSuggestions: boolean;
}

const MEMBER_JOIN_EVENTS: Record<string, string> = {
	anna: '🧑 Anna joined — she was asked first',
	intercom: '🔌 Intercom connected — real requests, replayed here, never answered live',
	'external-agent': '🛰️ External agent connected via MCP — joins as a checker',
};

function emptyState(): AgentCrewState {
	return {
		// The Tester joins only once the Builder has created the agent — see
		// ensureTester().
		activeMemberIds: ['builder'],
		feed: [],
		testerStatus: 'idle',
		stagedFindingId: null,
		stagedProposalId: null,
		probedRowIds: [],
		greetingShown: false,
		suggestions: [],
		loadingSuggestions: false,
	};
}

export const useAgentCrewStore = defineStore('experiments.agentCrew', () => {
	const evals = useAgentEvalsStore();
	const states = ref<Record<string, AgentCrewState>>({});

	function stateFor(agentId: string): AgentCrewState {
		if (!states.value[agentId]) states.value[agentId] = reactive(emptyState());
		return states.value[agentId];
	}

	const getActiveMembers = computed(() => (agentId: string) => {
		const active = new Set(stateFor(agentId).activeMemberIds);
		return CREW_CATALOGUE.filter((member) => active.has(member.id));
	});

	const getAddableMembers = computed(() => (agentId: string) => {
		const active = new Set(stateFor(agentId).activeMemberIds);
		return CREW_CATALOGUE.filter((member) => !member.fixed && !active.has(member.id));
	});

	function addMember(agentId: string, memberId: string) {
		const state = stateFor(agentId);
		if (state.activeMemberIds.includes(memberId)) return;
		state.activeMemberIds.push(memberId);
		const eventText = MEMBER_JOIN_EVENTS[memberId];
		if (eventText) {
			state.feed.push({ id: crypto.randomUUID(), kind: 'system', text: eventText });
		}
	}

	/** The agent exists now: the Tester takes its seat, announced in the thread. */
	function ensureTester(agentId: string) {
		const state = stateFor(agentId);
		if (state.activeMemberIds.includes('tester')) return;
		state.activeMemberIds.push('tester');
		state.feed.push({ id: crypto.randomUUID(), kind: 'system', text: '🤖 Tester joined' });
	}

	function removeMember(agentId: string, memberId: string) {
		const member = CREW_CATALOGUE.find((candidate) => candidate.id === memberId);
		if (member?.fixed) return;
		const state = stateFor(agentId);
		state.activeMemberIds = state.activeMemberIds.filter((id) => id !== memberId);
	}

	const getFeed = computed(() => (agentId: string) => stateFor(agentId).feed);
	const getTesterStatus = computed(() => (agentId: string) => stateFor(agentId).testerStatus);

	const getStagedFinding = computed(() => (agentId: string) => {
		const state = stateFor(agentId);
		for (const item of state.feed) {
			if (item.kind === 'finding' && item.finding.id === state.stagedFindingId) {
				return item.finding;
			}
		}
		return null;
	});

	const getStagedProposal = computed(() => (agentId: string) => {
		const state = stateFor(agentId);
		for (const item of state.feed) {
			if (item.kind === 'proposal' && item.proposal.id === state.stagedProposalId) {
				return item.proposal;
			}
		}
		return null;
	});

	function stageFinding(agentId: string, findingId: string | null) {
		const state = stateFor(agentId);
		state.stagedFindingId = findingId;
		if (findingId !== null) state.stagedProposalId = null;
	}

	function stageProposal(agentId: string, proposalId: string | null) {
		const state = stateFor(agentId);
		state.stagedProposalId = proposalId;
		if (proposalId !== null) state.stagedFindingId = null;
	}

	const getGreetingShown = computed(() => (agentId: string) => stateFor(agentId).greetingShown);
	const getSuggestions = computed(() => (agentId: string) => stateFor(agentId).suggestions);
	const getLoadingSuggestions = computed(
		() => (agentId: string) => stateFor(agentId).loadingSuggestions,
	);

	/** Drafted requests the Tester can offer, freshest first, already-tried excluded. */
	async function loadSuggestions(projectId: string, agentId: string): Promise<void> {
		const state = stateFor(agentId);
		state.loadingSuggestions = true;
		try {
			await evals.fetchDatasets(projectId, agentId);
			let dataset = evals.getDatasets(agentId)[0];
			if (!dataset) {
				await evals.generateDraftCases(projectId, agentId);
				await evals.fetchDatasets(projectId, agentId);
				dataset = evals.getDatasets(agentId)[0];
			}
			if (!dataset || !isDataTableDataset(dataset)) return;
			const source = toCaseSource(dataset);
			if (!source) return;
			await evals.fetchCases(projectId, source);
			let cases = evals
				.getCases(dataset.id)
				.filter((candidate) => !state.probedRowIds.includes(candidate.rowId));
			if (cases.length === 0) {
				await evals.generateDraftCases(projectId, agentId);
				await evals.fetchCases(projectId, source);
				cases = evals
					.getCases(dataset.id)
					.filter((candidate) => !state.probedRowIds.includes(candidate.rowId));
			}
			state.suggestions = cases.slice(0, 3).map((evalCase) => ({
				rowId: evalCase.rowId,
				input: evalCase.input,
				whatToCheck: evalCase.whatToCheck ?? '',
			}));
		} finally {
			state.loadingSuggestions = false;
		}
	}

	/** Clicking the Tester's avatar: it says hello and offers things to try. */
	async function showTesterGreeting(projectId: string, agentId: string): Promise<void> {
		const state = stateFor(agentId);
		state.greetingShown = true;
		if (state.suggestions.length === 0 && !state.loadingSuggestions) {
			await loadSuggestions(projectId, agentId);
		}
	}

	/**
	 * One live probe: the suggestion goes through a throwaway chat session (the
	 * tester never touches the builder's own preview conversation) and the reply
	 * comes back as a finding.
	 */
	async function probeSuggestion(
		projectId: string,
		agentId: string,
		suggestion: TesterSuggestion,
	): Promise<void> {
		const state = stateFor(agentId);
		if (state.probedRowIds.includes(suggestion.rowId)) return;
		state.probedRowIds.push(suggestion.rowId);
		state.suggestions = state.suggestions.filter((entry) => entry.rowId !== suggestion.rowId);
		state.testerStatus = 'probing';
		const finding = reactive<TesterFinding>({
			id: crypto.randomUUID(),
			input: suggestion.input,
			reply: '',
			whatToCheck: suggestion.whatToCheck,
			status: 'probing',
		});
		state.feed.push({ id: finding.id, kind: 'finding', finding });
		try {
			finding.reply = await runThrowawayExchange(projectId, agentId, suggestion.input);
			finding.status = finding.reply ? 'done' : 'error';
		} catch {
			finding.status = 'error';
		} finally {
			state.testerStatus = 'idle';
		}
	}

	/** One request through a fresh, throwaway session; returns the reply text. */
	async function runThrowawayExchange(
		projectId: string,
		agentId: string,
		input: string,
	): Promise<string> {
		const chat = useAgentChatStream({
			projectId: ref(projectId),
			agentId: ref(agentId),
			continueSessionId: ref(crypto.randomUUID()),
		});
		await chat.sendMessage(input);
		const reply = [...chat.messages.value]
			.reverse()
			.find((message) => message.role === 'assistant' && message.content);
		return reply && reply.status !== 'error' ? reply.content : '';
	}

	/**
	 * A 👎 with a reason on the stage lands here: the verdict shows in the
	 * thread, and the Builder proposes turning the reason into an instruction.
	 */
	function reportStageVerdict(
		agentId: string,
		exchange: { request: string; reply: string; reason: string },
	): void {
		const state = stateFor(agentId);
		state.feed.push({
			id: crypto.randomUUID(),
			kind: 'verdict',
			text: exchange.reason,
		});
		const trimmed = exchange.reason.trim().replace(/[.。]\s*$/, '');
		const proposal = reactive<FixProposal>({
			id: crypto.randomUUID(),
			reason: exchange.reason,
			request: exchange.request,
			beforeReply: exchange.reply,
			addedLine: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
			status: 'proposed',
			afterReply: '',
		});
		state.feed.push({ id: proposal.id, kind: 'proposal', proposal });
	}

	/**
	 * Apply is real: the proposed line is written into the agent's instructions,
	 * then the same request replays through a fresh session for a true
	 * before/after. Nothing here is simulated except the wording of the line.
	 */
	async function applyProposal(
		projectId: string,
		agentId: string,
		proposalId: string,
	): Promise<void> {
		const state = stateFor(agentId);
		const item = state.feed.find(
			(entry) => entry.kind === 'proposal' && entry.proposal.id === proposalId,
		);
		if (!item || item.kind !== 'proposal' || item.proposal.status !== 'proposed') return;
		const proposal = item.proposal;
		proposal.status = 'applying';
		try {
			const context = useRootStore().restApiContext;
			const config = await getAgentConfig(context, projectId, agentId);
			const instructions = `${config.instructions ?? ''}\n- ${proposal.addedLine}`.trim();
			await updateAgentConfig(context, projectId, agentId, { ...config, instructions });
			proposal.status = 'replaying';
			proposal.afterReply = await runThrowawayExchange(projectId, agentId, proposal.request);
			proposal.status = proposal.afterReply ? 'done' : 'error';
			if (proposal.status === 'done') stageProposal(agentId, proposal.id);
		} catch {
			proposal.status = 'error';
		}
	}

	function skipProposal(agentId: string, proposalId: string): void {
		const state = stateFor(agentId);
		const item = state.feed.find(
			(entry) => entry.kind === 'proposal' && entry.proposal.id === proposalId,
		);
		if (item?.kind === 'proposal' && item.proposal.status === 'proposed') {
			item.proposal.status = 'skipped';
		}
	}

	return {
		getActiveMembers,
		getAddableMembers,
		addMember,
		ensureTester,
		removeMember,
		getFeed,
		getTesterStatus,
		getStagedFinding,
		getStagedProposal,
		stageFinding,
		stageProposal,
		getGreetingShown,
		getSuggestions,
		getLoadingSuggestions,
		showTesterGreeting,
		probeSuggestion,
		reportStageVerdict,
		applyProposal,
		skipProposal,
	};
});
