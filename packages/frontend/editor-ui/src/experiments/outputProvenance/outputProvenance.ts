/**
 * AI Trust prototype: where a bad value in an output actually came from.
 *
 * Two failure classes look identical in the output and need opposite fixes: a
 * node mapped the wrong field (deterministic — a prompt change would only
 * paper over it), or the model wrote something it shouldn't (instructions are
 * the lever). The run data already knows which: if the value appears verbatim
 * in an upstream node's output it was passed through, not written.
 *
 * That answer is certain for the pass-through case, which is why it runs
 * before any ranking. Ranked guesses are the fallback for values a step
 * reworded, where a confidently wrong answer would be worse than a hedge.
 */

export interface NodeOutputText {
	nodeName: string;
	/** Everything that node emitted, flattened to text */
	text: string;
	/** Position in the run, so candidates can be ranked by proximity */
	order: number;
}

export type ProvenanceResult =
	/** The value came through this node unchanged */
	| { kind: 'passed-through'; nodeName: string }
	/** No step carries it, so it was generated */
	| { kind: 'generated' }
	/** Cannot attribute it — these steps were involved, most likely first */
	| { kind: 'candidates'; nodeNames: string[] }
	/** Nothing to go on (no run data, or nothing selected) */
	| { kind: 'unknown' };

/** Loose match: whitespace and case differences shouldn't count as rewriting. */
function normalise(value: string): string {
	return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Trace one value through a run.
 *
 * `nodeOutputs` must contain only steps that actually feed the output being
 * judged. A sibling destination prints the same values, so including one would
 * name it as the origin of a value it merely also received.
 */
export function traceValue(
	value: string,
	nodeOutputs: NodeOutputText[],
	options: { rankedCandidateCount?: number } = {},
): ProvenanceResult {
	const needle = normalise(value);
	// Very short values match by accident ("1", "of"), which is worse than silence.
	if (needle.length < 3 || nodeOutputs.length === 0) return { kind: 'unknown' };

	// Closest upstream step wins: the value may pass through several, and the
	// nearest one to carry it is where it entered the output.
	const carriers = nodeOutputs
		.filter((output) => normalise(output.text).includes(needle))
		.sort((a, b) => b.order - a.order);
	if (carriers.length > 0) return { kind: 'passed-through', nodeName: carriers[0].nodeName };

	// Nothing carries it. If some step's output overlaps the value in part, the
	// value was probably reworded there rather than invented — rank those.
	const partial = nodeOutputs
		.map((output) => ({ output, score: overlapScore(needle, normalise(output.text)) }))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.output.order - a.output.order)
		.slice(0, options.rankedCandidateCount ?? 3)
		.map((entry) => entry.output.nodeName);

	if (partial.length > 0) return { kind: 'candidates', nodeNames: partial };
	return { kind: 'generated' };
}

/**
 * Always rank, never assert — the variant that matches the brief as written,
 * kept so the two can be compared directly.
 */
export function rankCandidates(
	value: string,
	nodeOutputs: NodeOutputText[],
	count = 3,
): ProvenanceResult {
	const needle = normalise(value);
	if (nodeOutputs.length === 0) return { kind: 'unknown' };
	const ranked = nodeOutputs
		.map((output) => ({
			output,
			score: normalise(output.text).includes(needle)
				? Number.MAX_SAFE_INTEGER
				: overlapScore(needle, normalise(output.text)),
		}))
		.sort((a, b) => b.score - a.score || b.output.order - a.output.order)
		.slice(0, count)
		.map((entry) => entry.output.nodeName);
	return ranked.length > 0 ? { kind: 'candidates', nodeNames: ranked } : { kind: 'unknown' };
}

/** How much of the value's wording survives in a node's output, 0–1. */
function overlapScore(needle: string, haystack: string): number {
	const words = needle.split(' ').filter((word) => word.length > 2);
	if (words.length === 0) return 0;
	const hits = words.filter((word) => haystack.includes(word)).length;
	return hits / words.length;
}
