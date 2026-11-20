import type { AgentTestChannelContext } from '@n8n/api-types';

/** Reads `clientContext.testChannel` from a chat message. Anything else is ignored. */
export function readTestChannel(
	clientContext: Record<string, unknown> | undefined,
): AgentTestChannelContext | undefined {
	const channel = clientContext?.testChannel;
	if (!channel || typeof channel !== 'object') return undefined;
	const { type, label } = channel as Record<string, unknown>;
	if (type !== 'slack' || typeof label !== 'string' || !/^#[\w-]{1,80}$/.test(label)) {
		return undefined;
	}
	return { type, label };
}
