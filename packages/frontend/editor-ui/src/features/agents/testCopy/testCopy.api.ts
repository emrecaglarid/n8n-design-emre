import type {
	AgentTestChange,
	AgentTestChangesResponse,
	AgentTestCopyInfo,
	AgentTestSuggestionsResponse,
} from '@n8n/api-types';
import { makeRestApiRequest } from '@n8n/rest-api-client';
import type { IRestApiContext } from '@n8n/rest-api-client';

const testCopyPath = (projectId: string, agentId: string) =>
	`/projects/${encodeURIComponent(projectId)}/agents/v2/${encodeURIComponent(agentId)}/test-copy`;

export async function getAgentTestCopyInfo(
	context: IRestApiContext,
	projectId: string,
	agentId: string,
): Promise<AgentTestCopyInfo> {
	return await makeRestApiRequest<AgentTestCopyInfo>(
		context,
		'GET',
		testCopyPath(projectId, agentId),
	);
}

export async function getAgentTestChanges(
	context: IRestApiContext,
	projectId: string,
	agentId: string,
	threadId: string,
): Promise<AgentTestChangesResponse> {
	return await makeRestApiRequest<AgentTestChangesResponse>(
		context,
		'GET',
		`${testCopyPath(projectId, agentId)}/${encodeURIComponent(threadId)}/changes`,
	);
}

/** Calls a model on the server, so it can take several seconds. */
export async function getAgentTestSuggestions(
	context: IRestApiContext,
	projectId: string,
	agentId: string,
): Promise<AgentTestSuggestionsResponse> {
	return await makeRestApiRequest<AgentTestSuggestionsResponse>(
		context,
		'GET',
		`${testCopyPath(projectId, agentId)}/suggestions`,
	);
}

/** Makes one change in the real app: the same request the agent made in the test. */
export async function applyAgentTestChange(
	context: IRestApiContext,
	projectId: string,
	agentId: string,
	threadId: string,
	changeId: string,
): Promise<AgentTestChange> {
	return await makeRestApiRequest<AgentTestChange>(
		context,
		'POST',
		`${testCopyPath(projectId, agentId)}/${encodeURIComponent(threadId)}/changes/${encodeURIComponent(changeId)}/apply`,
	);
}
