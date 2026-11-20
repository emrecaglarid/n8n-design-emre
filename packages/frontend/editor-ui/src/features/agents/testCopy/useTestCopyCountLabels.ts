import type { BaseTextKey } from '@n8n/i18n';
import { useI18n } from '@n8n/i18n';

import { getCountNoun, type AgentTestChangeGroup, type TestCopyCountNoun } from './testCopy.utils';

const COUNT_KEYS: Record<TestCopyCountNoun, BaseTextKey> = {
	email: 'agents.testCopy.count.email',
	message: 'agents.testCopy.count.message',
	row: 'agents.testCopy.count.row',
	contact: 'agents.testCopy.count.contact',
	record: 'agents.testCopy.count.record',
	change: 'agents.testCopy.changes.count',
};

/** Counts that name what an app holds, for example `2 messages`. */
export function useTestCopyCountLabels() {
	const i18n = useI18n();

	function countLabel(group: AgentTestChangeGroup): string {
		const count = group.changes.length;
		return i18n.baseText(COUNT_KEYS[getCountNoun(group.changes)], {
			adjustToNumber: count,
			interpolate: { count: String(count) },
		});
	}

	/** For example `Slack: 2 messages`. */
	function appRowLabel(group: AgentTestChangeGroup): string {
		return i18n.baseText('agents.testCopy.appRow', {
			interpolate: { app: group.app, count: countLabel(group) },
		});
	}

	return { countLabel, appRowLabel };
}
