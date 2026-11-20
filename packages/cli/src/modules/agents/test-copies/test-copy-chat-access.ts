import type { User } from '@n8n/db';

import { userHasScopes } from '@/permissions.ee/check-access';

/**
 * Prototype (test copies): in n8n Chat the agent acts for real. Its builder can
 * use it there before publishing; publishing only lets other people reach it.
 */
export async function canBuilderUseDraftInChat(
	user: User | undefined,
	projectId: string,
): Promise<boolean> {
	if (process.env.N8N_ENV_FEAT_AGENT_TEST_COPIES !== 'true' || !user) return false;
	return await userHasScopes(user, ['agent:update'], false, { projectId });
}
