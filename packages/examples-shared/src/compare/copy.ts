/**
 * The comparison strings whose truth depends on how many verticals serve the dataset.
 *
 * @remarks
 * Three user-facing strings name how many apps a comparison reaches. Not every dataset is served by
 * all six verticals (`wine-server` is served by two), so each count is derived from the registry
 * rather than written as a constant: a count in prose is the one kind of copy that goes stale
 * without anybody editing it, and one of these is an **accessible name** a screen reader announces
 * over the list it labels.
 *
 * ## Why this is its own module rather than more of `target.ts`
 *
 * `target.ts` is about building an href. Two of these three strings hang off that button and the
 * third names a list on the destination page, so grouping by "the button's strings" would split
 * the family that actually shares a failure mode. Grouped by what makes them wrong, all three are
 * one import and one place to look when a vertical is added.
 *
 * @packageDocumentation
 */

import { type CompareDataset, verticalsServing } from './links.js';

/**
 * How the copy refers to the set of apps a dataset reaches.
 *
 * @remarks
 * Two arms, both reachable — three datasets are served by all six verticals and `wine-server` by
 * two — which is why this is a branch rather than a `v8 ignore`.
 *
 * "both" rather than "all 2", because "all 2" is the tell of a sentence assembled by a machine and
 * these strings are read aloud by screen readers.
 *
 * @param dataset - The dataset being compared.
 * @returns A phrase to drop before a noun — `both` or `all 6`.
 */
function servingPhrase(dataset: CompareDataset): string {
	const count = verticalsServing(dataset).length;

	return count === 2 ? 'both' : `all ${count}`;
}

/**
 * The Compare button's accessible name — more specific than the visible label, which has no object.
 *
 * @param dataset - The dataset the current route filters.
 * @returns The button's `aria-label` / `title`.
 */
export function compareButtonTitle(dataset: CompareDataset): string {
	return `Compare this filter state across ${servingPhrase(dataset)} demo apps`;
}

/**
 * What the Compare button says for itself when there is nothing to compare yet.
 *
 * @remarks
 * The empty state is `aria-disabled` rather than absent, and an inert control with no explanation is
 * a worse screen-reader story than no control at all — so every shell wires this as the button's
 * description. It names the action that would enable it, which is the only useful thing to say.
 *
 * @param dataset - The dataset the current route filters.
 * @returns The disabled button's `aria-label` / `title`.
 */
export function compareEmptyHint(dataset: CompareDataset): string {
	return `Apply a filter first — then this compares that exact state across ${servingPhrase(dataset)} apps.`;
}

/**
 * The comparison page's `<h1>`.
 *
 * @remarks
 * Derived here for the count, beside the button's strings that share its failure mode. It reads from the
 * same count as {@link compareListLabel}, so a `?dataset=wine-server` page's heading and its list's
 * accessible name always agree — a sighted reader and a screen-reader user hear the same number,
 * the "never color alone" accessibility rule applied to prose.
 *
 * @param dataset - The dataset the comparison page is showing.
 * @returns The heading text.
 */
export function compareHeading(dataset: CompareDataset): string {
	return `The same filter state, in ${servingPhrase(dataset)} stacks`;
}

/**
 * The accessible name of the comparison table's list.
 *
 * @remarks
 * A bare count rather than {@link servingPhrase}: "the both demo apps" is not English, and this
 * one is announced immediately before the item count, so the number is the useful part.
 *
 * @param dataset - The dataset the comparison page is showing.
 * @returns The `aria-label` for the `<ul>` of vertical rows.
 */
export function compareListLabel(dataset: CompareDataset): string {
	return `The ${verticalsServing(dataset).length} demo apps`;
}
