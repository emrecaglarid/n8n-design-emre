import type { BuiltTool } from '@n8n/agents';
import { Container } from '@n8n/di';
import { UserError } from 'n8n-workflow';

import { TestCopyService } from './test-copy.service';

/**
 * Prototype: a tool that can't reach the test copy (for example a workflow
 * tool) is skipped in a test chat, so it never acts on the real apps.
 */
export function skipInTestChats(tool: BuiltTool): BuiltTool {
	const handler = tool.handler;
	if (!handler) return tool;
	return {
		...tool,
		handler: async (input, ctx) => {
			const threadId = ctx && 'persistence' in ctx ? ctx.persistence?.threadId : undefined;
			if (Container.get(TestCopyService).isTestThread(threadId)) {
				throw new UserError(`Skipped: ${tool.name} can't run in a test`);
			}
			return await handler(input, ctx);
		},
	};
}
