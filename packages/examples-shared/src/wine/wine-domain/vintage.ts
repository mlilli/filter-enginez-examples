/**
 * `wine-domain/vintage` — the two conversions that let a range slider drive a discrete year SET.
 *
 * @remarks
 * Vintage is the one wine facet whose rule type and whose control disagree on purpose.
 * `mock-data/src/wine/filter-config.ts` declares it an **`InSetRule<number>`**, because a vintage is a
 * discrete year and the engine should see it as one. But nobody picks years individually — people
 * think "wines from 2018 to 2022" — so every vertical renders it as a dual-handle range slider and
 * materializes the span into the set on commit.
 *
 * That leaves two conversions, and they live here so every vertical commits the SAME rule type. A
 * vertical that committed a `RangeRule` instead would be using a different rule type for the same
 * facet, against the dataset's own declared config: a `?f` link would not be portable between wine
 * routes, and loading the wine config and then touching the slider would silently swap the rule type
 * underneath it.
 *
 * Both conversions are pure and framework-neutral, so every wine panel and the rule summaries all read
 * the same definition of what a vintage selection IS.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from '@filter-enginez/react-ui/bounds';

/**
 * Materialize a slider span into the year set the `InSetRule` carries.
 *
 * @remarks
 * **A full-baseline span commits an EMPTY set, not every year.** An empty `InSetRule` is the engine's
 * permissive state, so "the user has not narrowed vintage" and "the user selected all of them" collapse
 * to the same rule — which is what makes the facet disappear from the active-filter chips instead of
 * showing a chip that excludes nothing. Enumerating every year would filter identically and read as an
 * active constraint.
 *
 * Edges are floored / ceiled rather than rounded so a fractional handle position (possible while
 * dragging on a sub-pixel track) widens to include the year it sits inside rather than dropping it.
 *
 * @param span - The slider's committed `[min, max]`.
 * @param baseline - The full corpus extent; a span covering it means "no constraint".
 * @returns The years to commit, ascending. Empty when the span covers the whole baseline.
 */
export function vintageYearsFromRange(span: NumericBounds, baseline: NumericBounds): readonly number[] {
	if (span.min <= baseline.min && span.max >= baseline.max) {
		return [];
	}
	const years: number[] = [];

	for (let year = Math.floor(span.min); year <= Math.ceil(span.max); year++) {
		years.push(year);
	}

	return years;
}

/**
 * Recover the slider's handle positions from a committed year set.
 *
 * @remarks
 * The inverse of {@link vintageYearsFromRange}, and the reason the slider can derive its position from
 * the engine instead of mirroring it. An empty set is the permissive state, so it reads back as the
 * full baseline — the same span that produced it.
 *
 * Uses a loop rather than `Math.min(...set)` deliberately: the spread form throws
 * `RangeError: Maximum call stack size exceeded` once a set is large enough, and a vintage set is one
 * entry per year over a corpus-derived baseline. That is far below the limit, and the loop removes the
 * limit entirely rather than relying on the data staying narrow.
 *
 * @param set - The committed years, in any order.
 * @param baseline - The full corpus extent, returned for an empty set.
 * @returns The span the handles should occupy.
 */
export function vintageBoundsFromSet(set: readonly number[], baseline: NumericBounds): NumericBounds {
	if (set.length === 0) {
		return baseline;
	}
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;

	for (const year of set) {
		if (year < min) {
			min = year;
		}
		if (year > max) {
			max = year;
		}
	}

	return { max, min };
}

/**
 * Render a committed year set as the range the user actually selected.
 *
 * @remarks
 * Exists because the generic set formatter abbreviates — a 2015-2022 selection reads
 * `2015 (+7 more)`, which describes a list nobody picked. The control is a range, so the chip should
 * say so.
 *
 * Called by all three wine summary builders (the shared one plus the two per-app React headers). Those
 * three are a pre-existing triplication; this keeps the vintage FORMAT single-sourced across them
 * rather than adding a fourth spelling of it.
 *
 * @param set - The committed years; assumed non-empty, since an empty set is not a constraint and its
 *   caller has already returned `null`.
 * @returns `2019` for a single year, `2015 – 2022` for a span.
 */
export function formatVintageRange(set: readonly number[]): string {
	const { max, min } = vintageBoundsFromSet(set, { max: 0, min: 0 });

	return min === max ? String(min) : `${String(min)} – ${String(max)}`;
}
