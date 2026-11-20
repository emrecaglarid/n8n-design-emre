import type {
	AgentTestChange,
	AgentTestChangesResponse,
	AgentTestCopyInfo,
	AgentTestSuggestionsResponse,
} from '@n8n/api-types';
import type { AuthenticatedRequest } from '@n8n/db';
import { Get, Param, Post, ProjectScope, RestController } from '@n8n/decorators';
import { NotFoundError } from '@n8n/errors';
import type { Response } from 'express';
import { nodeNameToToolName } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';

import { AgentsCredentialProvider } from '../adapters/agents-credential-provider';
import { AgentConfigService } from '../agent-config.service';
import { AgentExecutionService } from '../agent-execution.service';
import { resolveCredentialAwareModelConfig } from '../json-config/model-config';
import { TestCopyService } from './test-copy.service';

/** Prototype: what the test pane shows about the test copy of a chat. */
@RestController('/projects/:projectId/agents/v2')
export class TestCopyController {
	constructor(
		private readonly testCopies: TestCopyService,
		private readonly agentConfigService: AgentConfigService,
		private readonly agentExecutionService: AgentExecutionService,
		private readonly credentialsService: CredentialsService,
	) {}

	@Get('/:agentId/test-copy')
	@ProjectScope('agent:read')
	async info(
		_req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('projectId') projectId: string,
		@Param('agentId') agentId: string,
	): Promise<AgentTestCopyInfo> {
		if (!this.testCopies.enabled) return { enabled: false, unsupportedTools: [], channels: [] };
		return this.testCopies.describe(await this.agentConfigService.getConfig(agentId, projectId));
	}

	@Get('/:agentId/test-copy/suggestions')
	@ProjectScope('agent:read')
	async suggestions(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('projectId') projectId: string,
		@Param('agentId') agentId: string,
	): Promise<AgentTestSuggestionsResponse> {
		if (!this.testCopies.enabled) return { suggestions: [] };
		const config = await this.agentConfigService.getConfig(agentId, projectId);
		if (!config.model) return { suggestions: [] };
		const credentialProvider = new AgentsCredentialProvider(
			this.credentialsService,
			projectId,
			req.user,
			agentId,
		);
		const suggestions = await this.testCopies.suggest(config, async (prompt) => {
			const modelConfig = config.credential
				? await resolveCredentialAwareModelConfig(
						config.model,
						config.credential,
						credentialProvider,
					)
				: config.model;
			const { createModel } = await import('@n8n/agents');
			const { generateText } = await import('ai');
			const result = await generateText({
				model: createModel(modelConfig),
				prompt,
				abortSignal: AbortSignal.timeout(30_000),
			});
			return result.text;
		});
		return { suggestions };
	}

	@Post('/:agentId/test-copy/:threadId/changes/:changeId/apply')
	@ProjectScope('agent:execute')
	async applyChange(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('projectId') projectId: string,
		@Param('agentId') agentId: string,
		@Param('threadId') threadId: string,
		@Param('changeId') changeId: string,
	): Promise<AgentTestChange> {
		const allowed = await this.agentExecutionService.canUseDraftThread(
			threadId,
			projectId,
			agentId,
			req.user.id,
			{ previewChat: true, sessionMode: 'existing' },
		);
		if (!allowed || !this.testCopies.enabled) throw new NotFoundError('Session not found');
		const config = await this.agentConfigService.getConfig(agentId, projectId);
		const credentialProvider = new AgentsCredentialProvider(
			this.credentialsService,
			projectId,
			req.user,
			agentId,
		);
		return await this.testCopies.applyChange(threadId, changeId, async (toolName, type) => {
			const nodeTools = (config.tools ?? []).filter((t) => t.type === 'node');
			// A channel reply has no tool: use a tool that is set up with an account of that type.
			const tool =
				nodeTools.find((t) => nodeNameToToolName(t.name) === toolName) ??
				(toolName
					? undefined
					: nodeTools.find((t) => t.type === 'node' && t.node.credentials?.[type]));
			const ref = tool?.type === 'node' ? tool.node.credentials?.[type] : undefined;
			if (!ref?.id) return undefined;
			return (await credentialProvider.resolve(ref.id)) as Record<string, unknown>;
		});
	}

	@Get('/:agentId/test-copy/:threadId/changes')
	@ProjectScope('agent:read')
	async changes(
		req: AuthenticatedRequest<{ projectId: string }>,
		_res: Response,
		@Param('projectId') projectId: string,
		@Param('agentId') agentId: string,
		@Param('threadId') threadId: string,
	): Promise<AgentTestChangesResponse> {
		if (!this.testCopies.enabled) return { changes: [] };
		const allowed = await this.agentExecutionService.canUseDraftThread(
			threadId,
			projectId,
			agentId,
			req.user.id,
			{ previewChat: true, sessionMode: 'existing' },
		);
		if (!allowed) throw new NotFoundError('Session not found');
		return { changes: this.testCopies.listChanges(threadId) };
	}
}
