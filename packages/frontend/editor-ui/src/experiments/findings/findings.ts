/**
 * AI Trust prototype: the one object every reaction to an output becomes.
 *
 * The point of the shape is that a person and an agent produce the *same*
 * thing — a tester probe, a colleague's comment and a verdict typed by the
 * builder are one type with a different source. That is what removes the need
 * for a shared room: permissions and credit attach to the source, not to a
 * seat in a chat.
 */

export type FindingSourceKind =
	| 'builder'
	/** The built-in tester */
	| 'tester'
	/** An agent the user registered as a checker */
	| 'user-agent'
	/** A person — the builder, a colleague, a client */
	| 'human'
	/** n8n itself, when it notices something nobody looked at */
	| 'n8n';

export interface FindingSource {
	kind: FindingSourceKind;
	name: string;
}

/**
 * What the finding is about. Research says people locate problems
 * structurally (which node) or by value (which field) — never by sentence —
 * so `span` exists for prose output and `node` for everything else. Agent
 * output has no nodes, hence `turn`.
 */
export type FindingScope =
	| { kind: 'whole' }
	| { kind: 'span'; text: string }
	| { kind: 'node'; nodeName: string }
	| { kind: 'turn'; index: number };

export type FindingStatus = 'open' | 'accepted' | 'dismissed';

/**
 * Which of the two failure classes this was. `certain` separates a value
 * traced through the run data from a ranked guess — they should never read the
 * same to whoever sees the finding later.
 */
export interface FindingCause {
	kind: 'node' | 'model' | 'unclear';
	nodeName?: string;
	certain: boolean;
}

export interface FindingBody {
	/** Why it is wrong, from a chip or typed. May be empty when the correction says it. */
	reason: string;
	/** What it should have said instead */
	replacement?: string;
}

export interface Finding {
	id: string;
	source: FindingSource;
	scope: FindingScope;
	status: FindingStatus;
	body: FindingBody;
	/** The request that produced the output, where there was one */
	request?: string;
	/** The output being judged */
	output?: string;
	/** Where the problem came from, when the run data could say */
	cause?: FindingCause;
	createdAt: number;
}

export const FINDING_SOURCES: Record<FindingSourceKind, FindingSource> = {
	builder: { kind: 'builder', name: 'Builder' },
	tester: { kind: 'tester', name: 'Tester' },
	'user-agent': { kind: 'user-agent', name: 'External agent' },
	human: { kind: 'human', name: 'You' },
	n8n: { kind: 'n8n', name: 'n8n' },
};

export function createFinding(input: {
	source: FindingSource;
	scope?: FindingScope;
	body: FindingBody;
	status?: FindingStatus;
	request?: string;
	output?: string;
	cause?: FindingCause;
}): Finding {
	return {
		id: crypto.randomUUID(),
		source: input.source,
		scope: input.scope ?? { kind: 'whole' },
		status: input.status ?? 'open',
		body: input.body,
		request: input.request,
		output: input.output,
		cause: input.cause,
		createdAt: Date.now(),
	};
}

/**
 * The line shown above the composer. It is the only scoping mechanism in the
 * UI, so it has to read as a plain statement of what you are talking about.
 */
export function scopeLabel(scope: FindingScope): string {
	switch (scope.kind) {
		case 'whole':
			return 'About the whole output';
		case 'span':
			return `“${scope.text}”`;
		case 'node':
			return `${scope.nodeName}`;
		case 'turn':
			return `Turn ${scope.index + 1}`;
	}
}

/** Short attribution for a findings row: who said it. */
export function sourceLabel(source: FindingSource): string {
	return source.name;
}
