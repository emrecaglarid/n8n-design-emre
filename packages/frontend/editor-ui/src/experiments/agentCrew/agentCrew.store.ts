import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';

import { useAgentEvalsStore } from '@/features/agents/agentEvals.store';
import { useAgentChatStream } from '@/features/agents/composables/useAgentChatStream';
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

interface AgentCrewState {
	activeMemberIds: string[];
	findings: TesterFinding[];
	testerStatus: 'idle' | 'probing';
	stagedFindingId: string | null;
	/** rowIds of cases the tester already tried, so reruns pick fresh ones */
	probedRowIds: number[];
}

function emptyState(): AgentCrewState {
	return {
		activeMemberIds: ['builder', 'tester'],
		findings: [],
		testerStatus: 'idle',
		stagedFindingId: null,
		probedRowIds: [],
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
		if (!state.activeMemberIds.includes(memberId)) state.activeMemberIds.push(memberId);
	}

	function removeMember(agentId: string, memberId: string) {
		const member = CREW_CATALOGUE.find((candidate) => candidate.id === memberId);
		if (member?.fixed) return;
		const state = stateFor(agentId);
		state.activeMemberIds = state.activeMemberIds.filter((id) => id !== memberId);
	}

	const getFindings = computed(() => (agentId: string) => stateFor(agentId).findings);
	const getTesterStatus = computed(() => (agentId: string) => stateFor(agentId).testerStatus);

	const getStagedFinding = computed(() => (agentId: string) => {
		const state = stateFor(agentId);
		return state.findings.find((finding) => finding.id === state.stagedFindingId) ?? null;
	});

	function stageFinding(agentId: string, findingId: string | null) {
		stateFor(agentId).stagedFindingId = findingId;
	}

	/**
	 * The live tester run: make sure drafted requests exist, pick up to `count`
	 * fresh ones, and send each through its own throwaway chat session. The
	 * reply text becomes the finding the Tester reports back.
	 */
	async function runTester(projectId: string, agentId: string, count = 2): Promise<void> {
		const state = stateFor(agentId);
		if (state.testerStatus === 'probing') return;
		state.testerStatus = 'probing';
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

			for (const evalCase of cases.slice(0, count)) {
				state.probedRowIds.push(evalCase.rowId);
				const finding = reactive<TesterFinding>({
					id: crypto.randomUUID(),
					input: evalCase.input,
					reply: '',
					whatToCheck: evalCase.whatToCheck ?? '',
					status: 'probing',
				});
				state.findings.push(finding);
				try {
					// A throwaway session per probe: the tester never touches the
					// builder's own preview conversation.
					const chat = useAgentChatStream({
						projectId: ref(projectId),
						agentId: ref(agentId),
						continueSessionId: ref(crypto.randomUUID()),
					});
					await chat.sendMessage(evalCase.input);
					const reply = [...chat.messages.value]
						.reverse()
						.find((message) => message.role === 'assistant' && message.content);
					finding.reply = reply?.content ?? '';
					finding.status = reply && reply.status !== 'error' ? 'done' : 'error';
				} catch {
					finding.status = 'error';
				}
			}
		} finally {
			state.testerStatus = 'idle';
		}
	}

	return {
		getActiveMembers,
		getAddableMembers,
		addMember,
		removeMember,
		getFindings,
		getTesterStatus,
		getStagedFinding,
		stageFinding,
		runTester,
	};
});
