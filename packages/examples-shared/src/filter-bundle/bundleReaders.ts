/**
 * `bundleReaders` — pure, framework-neutral readers over a resolved `FilterBundle`.
 *
 * @remarks
 * Each of these shapes a bundle into what a control understands. They are pure functions of a bundle,
 * so nothing about them is dataset- or framework-specific: books, wine and real estate all read their
 * bundles through them. The dataset `*-domain` modules re-export them for their own imports.
 *
 * ### The `./bundle-readers` subpath
 *
 * This module has its own entry point on the package, deliberately, even though `./books-domain`,
 * `./wine-domain` and `./real-estate-domain` all re-export it. Those three are DATASET addresses, and
 * a generic control — `<CheckboxList>`, `<ChipToggleGroup>`, `<RangeSlider>` — that reaches into one
 * of them for `ExclusionMap` or `NumericBounds` teaches the next reader that the control belongs to
 * that dataset. It does not; it belongs to whichever panel imports it.
 *
 * Same reasoning as `./picker` next door: the dataset addresses keep resolving, and generic consumers
 * reach for the honest address. Unlike `./picker` this one needs no re-export hop — the definitions
 * live here.
 *
 * The sibling `index.tsx` in this directory is React (hooks + a provider), which is why the subpath
 * points at this FILE rather than at the barrel. Registered in `tests/tooling/reactFreeSubpaths.test.ts`.
 *
 * **Every one of them treats "missing" as "no information", never as "nothing available."** That
 * asymmetry is the whole design. Before the first bundle resolves, and for any facet the query did not
 * cover, the honest answer is that we do not know — and rendering a control as ENABLED when we do not
 * know is recoverable (the user clicks it and sees the result), while rendering it DISABLED is not
 * (the user never clicks it and concludes the data is not there). So the empty map and the null bound
 * are load-bearing return values, not defensive filler.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleFieldMeta, FilterRule } from '@filter-enginez/core';
import type { HistogramBucket, NumericBounds } from '@filter-enginez/react-ui/bounds';

/** Per-candidate exclusion datum consumed by {@link ExclusionMap} + the chip-toggle controls. */
export interface ChipExclusion {
	/** Projected result count if this candidate were added to its rule. */
	readonly projectedCount: number;
	/** `true` when adding this candidate (given the other active rules) would empty the result set. */
	readonly wouldBeEmpty: boolean;
}

/** Per-chip-group exclusion lookup keyed by candidate value — the chip-toggle control contract. */
export type ExclusionMap = ReadonlyMap<string, ChipExclusion>;

/**
 * Tight numeric bounds — the slider's "available" zone.
 *
 * @remarks
 * Re-exported from `@filter-enginez/react-ui/bounds` rather than declared here. A local
 * `{ readonly max: number; readonly min: number }` would be structurally compatible with that one, so
 * TypeScript would accept both side by side and nothing would catch the two drifting apart: every
 * panel in the repo annotates its `fieldBounds(...)` result with the react-ui type. One name for one
 * contract.
 *
 * The react-ui subpath wins because it owns the bounds MATH (`deriveBounds`, `deriveBaselineBounds`,
 * `clampToBounds`) that produces and consumes these pairs. Despite the package name it is an
 * import-free subpath — see `tests/tooling/reactFreeSubpaths.test.ts`.
 */
export type { NumericBounds };

/**
 * Read one chip group's exclusion data from the bundle as the `ExclusionMap` a chip-toggle control
 * understands.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The chip group's rule id.
 * @returns A value → {@link ChipExclusion} map. Empty when the bundle is absent or did not carry
 *   this group — which the controls read as "all enabled", not "all disabled".
 */
export function chipExclusionMap(bundle: FilterBundle | null, ruleId: string): ExclusionMap {
	const out = new Map<string, ChipExclusion>();

	if (bundle === null) {
		return out;
	}
	const group = bundle.chipGroups.find((candidateGroup) => candidateGroup.ruleId === ruleId);

	if (group === undefined) {
		return out;
	}
	for (const candidate of group.candidates) {
		out.set(candidate.value, { projectedCount: candidate.projectedCount, wouldBeEmpty: candidate.wouldBeEmpty });
	}

	return out;
}

/**
 * Read one chip group's projected result counts, keyed by candidate value.
 *
 * @remarks
 * The badge a hierarchical picker paints on each row: how many RECORDS would match if this candidate
 * were selected. Only the engine knows that number — a tree can report how many leaves sit beneath a
 * node, which is a different quantity (a country with a single leaf region would read `1` and
 * produce two results).
 *
 * This and {@link chipDisabledSet} take the rule id as a parameter: wine's origin tree reads them
 * over `'origin'` and real estate's location tree over `'location'`.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The chip group's rule id.
 * @returns Candidate value → projected count. Empty before the bundle arrives, so rows render no
 *   badge rather than a number that is about to change.
 */
export function chipProjectedCounts(bundle: FilterBundle | null, ruleId: string): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();

	for (const [value, exclusion] of chipExclusionMap(bundle, ruleId)) {
		counts.set(value, exclusion.projectedCount);
	}

	return counts;
}

/**
 * Read the candidates in one chip group whose selection would empty the result set.
 *
 * @remarks
 * The `disabledNodes` set a hierarchical picker consumes. Note what this deliberately does NOT do:
 * exclude candidates that are already selected. That escape-hatch rule ("a selected node stays
 * clickable so the user can get back out") is the CONTROL's, because only the control knows how a
 * node's state resolves through its ancestors — a node can render checked without its own id being in
 * the selection at all.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The chip group's rule id.
 * @returns Candidate values to disable. Empty when the bundle is absent or carried no such group —
 *   which every control reads as "everything selectable", the recoverable direction to be wrong in.
 */
export function chipDisabledSet(bundle: FilterBundle | null, ruleId: string): ReadonlySet<string> {
	const disabled = new Set<string>();

	for (const [value, exclusion] of chipExclusionMap(bundle, ruleId)) {
		if (exclusion.wouldBeEmpty) {
			disabled.add(value);
		}
	}

	return disabled;
}

/**
 * Read one slider field's filtered-except-self bounds from the bundle — the dimmed "available" zone.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The slider field's rule id.
 * @returns The available bounds, or `null` to signal "fall back to the baseline". Null covers three
 *   cases that mean the same thing to a slider: no bundle yet, the field was not queried, and no
 *   current result occupies the field at all.
 */
export function fieldBounds(bundle: FilterBundle | null, ruleId: string): NumericBounds | null {
	if (bundle === null) {
		return null;
	}
	const field = bundle.fields.find((candidateField) => candidateField.ruleId === ruleId);

	if (field === undefined || field.bounds.min === null || field.bounds.max === null) {
		return null;
	}

	return { max: field.bounds.max, min: field.bounds.min };
}

/**
 * Convert the bundle's typed-array histogram into the per-bucket shape a range slider renders.
 *
 * @remarks
 * Nothing in it is about any one dataset — the bundle carries a histogram for EVERY queried field,
 * unconditionally, and wine, books and real estate render the same bars in all six verticals.
 * `wine-domain/bundle.ts` re-exports it for wine's own imports.
 *
 * The engine aligns bucket edges to the field's BASELINE range (via the query's `baselineMin` /
 * `baselineMax`), which is what makes bar `i` sit above the track position its values occupy. A
 * caller that omits those from the query gets a histogram spanning the FILTERED range instead, and
 * bars that drift out from under the thumbs as the user filters.
 *
 * @param histogram - The bundle field's histogram.
 * @param selectedMin - The slider's current lower handle.
 * @param selectedMax - The slider's current upper handle.
 * @returns One bucket per count, with a normalized height and an in-selection flag. Empty when the
 *   field carried no buckets.
 */
export function bundleHistogramToBuckets(
	histogram: FilterBundleFieldMeta['histogram'],
	selectedMin: number,
	selectedMax: number,
): readonly HistogramBucket[] {
	const counts = histogram.counts;
	const edges = histogram.bucketEdges;

	if (counts.length === 0) {
		return [];
	}
	let maxCount = 0;

	for (const count of counts) {
		if (count > maxCount) {
			maxCount = count;
		}
	}
	// An all-zero histogram is a real state (every bucket filtered out). Dividing by it would make
	// every bar NaN-tall, which renders as no bars at all rather than as a flat empty distribution.
	const safeMax = maxCount === 0 ? 1 : maxCount;
	const out: HistogramBucket[] = new Array<HistogramBucket>(counts.length);

	for (let i = 0; i < counts.length; i++) {
		const bucketMin = edges[i] as number;
		const bucketMax = edges[i + 1] as number;
		const count = counts[i] as number;

		out[i] = {
			bucketMax,
			bucketMin,
			count,
			heightFraction: count / safeMax,
			// Overlap test: bucket [bucketMin, bucketMax) overlaps selection [selectedMin, selectedMax]
			// when bucketMin <= selectedMax AND bucketMax >= selectedMin.
			inSelection: bucketMin <= selectedMax && bucketMax >= selectedMin,
		};
	}

	return out;
}

/**
 * Read one slider field's distribution from the bundle as the buckets a range slider renders.
 *
 * @remarks
 * {@link fieldBounds}'s sibling, and the one call a panel needs: it finds the field and reshapes its
 * histogram in one step. Both readers exist because they answer different questions about the same
 * field — where the data STOPS (the dimmed zone) versus where inside that zone it actually LIVES.
 *
 * **`undefined`, not `[]`.** Same asymmetry as every reader in this module, and it matters more here
 * than most: the sliders treat an absent histogram as "no overlay" and an empty one as "an overlay
 * with nothing in it", which is 38px of blank space above a track. Before the first bundle resolves
 * the honest answer is that we do not know the distribution yet, so there should be no overlay at
 * all rather than an empty frame that collapses a moment later.
 *
 * Note the `inSelection` flag on the returned buckets is NOT what tiers the bars — the controls
 * recompute that from their own displayed handle positions, per `histogramBarTier`. Passing
 * `selectedMin` / `selectedMax` here still matters for any consumer reading the flag directly.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The slider field's rule id.
 * @param selectedMin - The slider's current lower handle.
 * @param selectedMax - The slider's current upper handle.
 * @returns The buckets, or `undefined` when there is no bundle, the field was not queried, or the
 *   field carried no buckets.
 */
export function fieldHistogram(
	bundle: FilterBundle | null,
	ruleId: string,
	selectedMin: number,
	selectedMax: number,
): undefined | readonly HistogramBucket[] {
	if (bundle === null) {
		return undefined;
	}
	const field = bundle.fields.find((candidateField) => candidateField.ruleId === ruleId);

	if (field === undefined) {
		return undefined;
	}
	const buckets = bundleHistogramToBuckets(field.histogram, selectedMin, selectedMax);

	return buckets.length === 0 ? undefined : buckets;
}

/**
 * Whether turning ON a single toggle would empty the result set.
 *
 * @remarks
 * The one-pass equivalent for controls a bundle cannot describe: `BooleanRule` / `ExistsRule` have no
 * chip-group candidate kind, so their disable state is computed directly. Adding the rule ANDs it
 * with the current results, which is empty iff none of the current results already pass it.
 *
 * It answers for turning a toggle ON only. For a toggle that is already on, the current results all
 * pass its rule, so the answer is `true` exactly when the results are already empty (a search that
 * matches nothing, say), and disabling the box then would trap the user in that state. A control
 * decides with {@link isToggleDisabled}, which never disables a checked toggle.
 *
 * @param results - The engine's current result set.
 * @param candidateRule - The rule the toggle would add.
 * @returns `true` when enabling the toggle would produce zero results.
 */
export function toggleWouldBeEmpty<T>(results: readonly T[], candidateRule: FilterRule): boolean {
	return !results.some((item) => candidateRule.action(item, candidateRule));
}

/**
 * Whether a toggle (checkbox) is disabled by predictive disable.
 *
 * @remarks
 * The rule every chip in every app already follows (`wouldBeEmpty && !isSelected`), for a checkbox:
 * an unchecked box is disabled when checking it would empty the results, and a checked box is never
 * disabled, so the user can always turn a filter back off, even when something else has emptied the
 * results.
 *
 * @param isChecked - Whether the toggle is on.
 * @param results - The engine's current result set.
 * @param candidateRule - The rule the toggle adds when turned on.
 * @returns `true` when the toggle should be disabled.
 */
export function isToggleDisabled<T>(isChecked: boolean, results: readonly T[], candidateRule: FilterRule): boolean {
	return !isChecked && toggleWouldBeEmpty(results, candidateRule);
}
