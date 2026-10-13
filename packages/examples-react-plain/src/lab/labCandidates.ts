/**
 * The candidate rules `/lab`'s simulation pane projects, and the pure formatting decisions that go
 * with them.
 *
 * @remarks
 * React-free by design, so every decision here is unit-testable without a renderer — the split
 * `/lab` needs, since everything under `src/lab/` is measured. The pane above this
 * module holds no logic beyond mapping the list to components.
 *
 * ### One list, two roles — and that is the demonstration
 *
 * Each candidate is BOTH a hypothetical the pane simulates (`engine.simulate({ withRule })`) and a
 * real rule the visitor can commit to the engine. Toggling one on makes every OTHER candidate's
 * projection move, which is precisely what the memoized `SimulationCache` exists for: its key is
 * `(modification + active rule set + source-data version)`, so committing a rule invalidates every
 * projection at once and the pane recomputes N counts against warm bitmaps rather than N corpus
 * scans. A pane with hypotheticals but no way to change the active set would render numbers that
 * never move, and would demonstrate the API without demonstrating the feature.
 *
 * 🔴 **The rule instances are built ONCE, at module load, and that is load-bearing.**
 * `useSimulation` memoizes on `modification.withRule?.[1]` — the rule INSTANCE. Building a rule
 * inside the component would hand it a fresh identity every render, busting the memo on every pass.
 * The result would still be correct, because `SimulationCache`'s own key is content-based rather
 * than identity-based, so the engine would answer from cache regardless — which is exactly what
 * makes the waste invisible. Correct-but-thrashing is the failure mode worth naming, because no
 * test and no gate would ever report it.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { type FilterRule, inSet, range } from '@filter-enginez/core';

/**
 * One rule the lab can either project as a hypothetical or commit to the engine.
 *
 * @remarks
 * `rule` is a single shared instance rather than a factory — see the module docblock. `ruleId` is
 * the id it takes when committed, and the same id namespaces the hypothetical, so committing a
 * candidate REPLACES its own projection rather than stacking beside it.
 */
export interface LabCandidate {
	/** What this rule does, in one clause, for the pane's caption. */
	readonly description: string;
	/** Short human label, e.g. `Fantasy`. */
	readonly label: string;
	/** The rule instance — stable for the lifetime of the module. */
	readonly rule: FilterRule;
	/** The engine rule id, used for both the hypothetical and the committed rule. */
	readonly ruleId: string;
}

/**
 * The lab's candidate set — three chip rules and two ranges, chosen to span the shapes that behave
 * differently under simulation rather than to be exhaustive.
 *
 * @remarks
 * The genres are deliberately picked to differ by an order of magnitude in the corpus, so the
 * projected counts are visibly different numbers rather than three that look alike; the two ranges
 * are there because a `RangeRule` narrows continuously where an `InSetRule` narrows discretely, and
 * the exclusion short-circuit only ever fires for the discrete case.
 */
export const LAB_CANDIDATES: readonly LabCandidate[] = [
	{
		description: 'Genre is exactly Fantasy',
		label: 'Fantasy',
		rule: inSet<Book['genre']>('genre', ['fantasy']),
		ruleId: 'lab-genre-fantasy',
	},
	{
		description: 'Genre is exactly Poetry',
		label: 'Poetry',
		rule: inSet<Book['genre']>('genre', ['poetry']),
		ruleId: 'lab-genre-poetry',
	},
	{
		description: 'Format is Audiobook',
		label: 'Audiobook',
		rule: inSet<Book['format']>('format', ['audiobook']),
		ruleId: 'lab-format-audiobook',
	},
	{
		description: 'Published in 2010 or later',
		label: 'Published 2010+',
		rule: range('publicationYear', { max: Number.POSITIVE_INFINITY, min: 2010 }),
		ruleId: 'lab-year-modern',
	},
	{
		description: 'Rated 4.5 stars or better',
		label: 'Rated 4.5+',
		rule: range('averageRating', { max: 5, min: 4.5 }),
		ruleId: 'lab-rating-high',
	},
];

/**
 * Format a projected result count for display.
 *
 * @remarks
 * `wouldBeEmpty` is reported as words rather than as `0`, because the two say different things to a
 * reader: `0` is a count, "no results" is a verdict, and the verdict is what the engine's exclusion
 * short-circuit actually produces without counting anything.
 *
 * @param resultCount - The projected number of matching records.
 * @param wouldBeEmpty - The engine's own verdict for the projection.
 * @returns The display string.
 */
export function formatProjection(resultCount: number, wouldBeEmpty: boolean): string {
	if (wouldBeEmpty) {
		return 'no results';
	}

	return `${resultCount.toLocaleString()} ${resultCount === 1 ? 'book' : 'books'}`;
}

/**
 * Describe a projection's effect relative to the live result count.
 *
 * @remarks
 * A bare projected count is not calibratable on its own — a reader cannot tell whether 1,204 is a
 * narrowing or barely a filter without knowing what it is 1,204 OF. This turns the pair into the
 * comparison the pane is actually making.
 *
 * ⚠ **A projection can EXCEED the live count**, and treating that as impossible is the trap. A
 * candidate already committed is replaced rather than intersected — `withRule` reuses its id — so
 * projecting a WIDER version of a committed rule legitimately grows the set.
 *
 * @param projectedCount - The simulated result count.
 * @param liveCount - The engine's current result count.
 * @returns A short human clause, e.g. `−82%`.
 */
export function describeDelta(projectedCount: number, liveCount: number): string {
	if (liveCount === 0) {
		return 'no baseline';
	}
	if (projectedCount === liveCount) {
		return 'no change';
	}
	const ratio = (projectedCount - liveCount) / liveCount;
	const sign = ratio > 0 ? '+' : '−';

	return `${sign}${Math.abs(Math.round(ratio * 100)).toString()}%`;
}
