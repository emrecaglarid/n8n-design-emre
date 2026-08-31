/**
 * AI Trust prototype: the design alternatives that need to coexist so they can
 * be compared in front of people, rather than argued about on paper. Each axis
 * is one open question from the solution brief; a notch is one answer to it.
 *
 * Pure data — no imports, so the store, the menu and the components that branch
 * on a notch all read the same definitions.
 */

/** How a rejection finds the step that caused it */
export type LocalizationVariant = 'provenance' | 'ranked' | 'off';

/** Whether a verdict can be scoped to part of an output */
export type AnnotationVariant = 'on' | 'off';

/** Whether a run produces a second candidate to choose between */
export type SecondCandidateVariant = 'on' | 'off';

export interface VariantState {
	localization: LocalizationVariant;
	annotation: AnnotationVariant;
	secondCandidate: SecondCandidateVariant;
	/** Numeric tunables, exposed to DialKit rather than the menu */
	rankedCandidateCount: number;
}

export const DEFAULT_VARIANTS: VariantState = {
	localization: 'provenance',
	annotation: 'on',
	secondCandidate: 'off',
	rankedCandidateCount: 3,
};

export interface VariantNotch<T extends string> {
	value: T;
	label: string;
	/** One honest line about what this notch is betting on */
	hint: string;
}

export interface VariantAxis<T extends string> {
	key: 'localization' | 'annotation' | 'secondCandidate';
	label: string;
	/** The question this axis answers, shown above its notches */
	question: string;
	notches: Array<VariantNotch<T>>;
	/** Query parameter that pins this axis in a shared link */
	param: string;
}

export const LOCALIZATION_AXIS: VariantAxis<LocalizationVariant> = {
	key: 'localization',
	label: 'Finding the cause',
	question: 'After a thumbs down, how do we say which step caused it?',
	param: 'localize',
	notches: [
		{
			value: 'provenance',
			label: 'Trace the value',
			hint: 'search the run — passed through, or written',
		},
		{ value: 'ranked', label: 'Rank likely steps', hint: 'two or three guesses, you confirm' },
		{ value: 'off', label: 'Just the verdict', hint: 'no cause, the control condition' },
	],
};

export const ANNOTATION_AXIS: VariantAxis<AnnotationVariant> = {
	key: 'annotation',
	label: 'Scoping a verdict',
	question: 'Can a note point at part of the output?',
	param: 'annotation',
	notches: [
		{ value: 'on', label: 'Select and annotate', hint: 'notes carry a scope' },
		{ value: 'off', label: 'Whole output only', hint: 'one verdict, nothing to scope' },
	],
};

export const SECOND_CANDIDATE_AXIS: VariantAxis<SecondCandidateVariant> = {
	key: 'secondCandidate',
	label: 'Judging',
	question: 'Do we ask for a verdict, or a choice?',
	param: 'candidates',
	notches: [
		{ value: 'off', label: 'One output', hint: 'thumbs up or down' },
		{ value: 'on', label: 'Pick one of two', hint: 'no words — but doubles model spend' },
	],
};

/** Every axis, in the order the menu lists them */
export const VARIANT_AXES = [LOCALIZATION_AXIS, ANNOTATION_AXIS, SECOND_CANDIDATE_AXIS] as const;

export interface VariantPreset {
	id: string;
	label: string;
	hint: string;
	values: Pick<VariantState, 'localization' | 'annotation' | 'secondCandidate'>;
}

/**
 * Whole configurations, so showing someone an argument is one click rather
 * than three. These are the positions actually in play, not a demo tour.
 */
export const VARIANT_PRESETS: VariantPreset[] = [
	{
		id: 'recommended',
		label: 'Our recommendation',
		hint: 'trace the value, notes carry a scope',
		values: { localization: 'provenance', annotation: 'on', secondCandidate: 'off' },
	},
	{
		id: 'brief',
		label: 'Brief as written',
		hint: 'ranked guesses at the cause',
		values: { localization: 'ranked', annotation: 'on', secondCandidate: 'off' },
	},
	{
		id: 'minimal',
		label: 'Verdict only',
		hint: 'no scope, no cause — the floor',
		values: { localization: 'off', annotation: 'off', secondCandidate: 'off' },
	},
	{
		id: 'choice',
		label: 'Choice instead of verdict',
		hint: 'two candidates, no articulation',
		values: { localization: 'off', annotation: 'off', secondCandidate: 'on' },
	},
];
