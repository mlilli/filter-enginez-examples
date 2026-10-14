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
 * The `vintage` value a non-vintage wine carries.
 *
 * @remarks
 * Most Champagne and Port blends several harvests and names none. `@filter-enginez/mock-data` stores
 * such a wine with the year after the youngest possible vintage — 2025 — so the field stays a number
 * the vintage filter can select, no harvest year collides with it, and it sorts as the youngest. Every
 * place a vintage is SHOWN reads it as `NV` through {@link formatVintage}; the generated names already
 * do ("Maison Roux NV Brut Champagne").
 */
export const NON_VINTAGE_YEAR = 2025;

/** What a non-vintage wine's vintage reads as, wherever a vintage is shown. */
export const NON_VINTAGE_LABEL = 'NV';

/**
 * Show a vintage year.
 *
 * @param year - The `vintage` value.
 * @returns `NV` for {@link NON_VINTAGE_YEAR}, otherwise the year.
 */
export function formatVintage(year: number): string {
	return year === NON_VINTAGE_YEAR ? NON_VINTAGE_LABEL : year.toFixed(0);
}

/**
 * Read a vintage typed into a slider's bound field.
 *
 * @remarks
 * The inverse of {@link formatVintage}, so a field showing `NV` commits as itself rather than as
 * `NaN`. Case-insensitive; spaces and thousands separators are ignored.
 *
 * @param raw - The field's text.
 * @returns The year, {@link NON_VINTAGE_YEAR} for `NV`, or `NaN` for anything else.
 */
export function parseVintage(raw: string): number {
	const cleaned = raw.replace(/[\s,]/gu, '');

	return cleaned.toUpperCase() === NON_VINTAGE_LABEL ? NON_VINTAGE_YEAR : Number.parseInt(cleaned, 10);
}

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
 * @returns `2019` for a single year, `2015 – 2022` for a span; a non-vintage end reads `NV`
 *   (`2015 – NV`: 2015 and younger, non-vintage included).
 */
export function formatVintageRange(set: readonly number[]): string {
	const { max, min } = vintageBoundsFromSet(set, { max: 0, min: 0 });

	return min === max ? formatVintage(min) : `${formatVintage(min)} – ${formatVintage(max)}`;
}
