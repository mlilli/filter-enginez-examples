/**
 * `filter-bundle` — dataset-agnostic predictive-disable plumbing.
 *
 * @remarks
 * "Predictive disable" is the promise that **no facet can drive the result set to zero**: before the
 * user clicks a chip, we already know whether clicking it would empty the results, and we disable it
 * if so. The engine computes that in one pass via `applyFiltersAndQuery`, which returns per-candidate
 * `wouldBeEmpty` / `projectedCount` for chip groups and filtered-except-self bounds for slider fields.
 *
 * This module owns the React side of that: fetch one bundle per engine change, distribute it through
 * context, and expose small reader hooks that reshape it into what each control understands. None of
 * it is dataset-specific — the query names the rule ids and fields, and everything downstream is
 * generic: books, real estate and wine all consume it.
 *
 * ### The two engine shapes
 *
 * On a main-thread engine (books `/books`, real estate, wine's small tier) the bundle resolves
 * SYNCHRONOUSLY from `engine.core.applyFiltersAndQuery(...)`. On an async engine — the HTTP-backed
 * `/books-server` route, or a Comlink worker tier — `.core` is a shim with no synchronous
 * `applyFiltersAndQuery`, so we await `engine.asyncEngine.applyFiltersAndQuery(...)` and ignore any
 * resolution a newer change has already superseded. Both paths live here so a dataset can move to a
 * worker tier with no panel changes.
 *
 * ### What is NOT expressible as a bundle candidate
 *
 * `FilterBundleChipGroupQuery` has exactly two kinds, `inSet` and `inSetOfSets`, and the engine's
 * chip accumulator skips items whose field value is not a string. So single-value toggles
 * (`BooleanRule` / `ExistsRule` / `BloomMembershipRule`) and array-valued fields (real estate's
 * `features: string[]`, via `ContainsAllRule`) cannot be queried as chip groups. Toggles are served
 * by {@link useToggleWouldBeEmpty}, a one-pass equivalent. Array-valued fields have no predictive
 * disable in any panel; supporting them would need a new candidate kind in `core`.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleQuery, FilterRule } from '@filter-enginez/core';
import type { HistogramBucket, NumericBounds } from '@filter-enginez/react-ui';

import { type ExclusionMap, useFilterEngine, useLastChange } from '@filter-enginez/react-signals';
import { createContext, use, useEffect, useEffectEvent, useMemo, useState } from 'react';

import { type BundleFetcher, createBundleFetcher } from './bundleFetcher.js';
import { chipExclusionMap, fieldBounds, fieldHistogram } from './bundleReaders.js';

/**
 * Shape provided through {@link FilterBundleContext}. `bundle` is `null` during the first render
 * window after boot (before the first fetch resolves); consumers degrade to "no exclusion data",
 * which renders every control enabled rather than every control disabled.
 */
export interface FilterBundleValue {
	readonly bundle: FilterBundle | null;
}

/**
 * Context distributing the single fetched bundle to every section of the active panel.
 *
 * @remarks
 * One context serves every dataset because only one panel is mounted at a time (they are separate
 * routes). If two panels ever nest, the inner provider wins, which is the correct semantic anyway.
 */
export const FilterBundleContext = createContext<FilterBundleValue | null>(null);

/**
 * Fetch a fresh bundle on every engine change.
 *
 * @remarks
 * **Keyed on the query's VALUE, not its reference.** The obvious implementation lists `query` in the
 * effect deps, which turns an object literal that is not memoized into an infinite render loop: fetch → set
 * state → re-render → new literal → fetch. That is a nasty failure to debug, because it presents as
 * a hang with no error — a test written that way locks up the suite with no output at all — and it
 * makes correctness depend on every caller remembering a `useMemo`.
 *
 * Serializing instead makes the hazard structurally impossible. The query is small and fully
 * JSON-serializable by construction (it has to be: it crosses Comlink to the worker tier and JSON to
 * the server tier), so stringifying it each render is cheap and total. Callers may still memoize —
 * the panels do — but it is an optimization rather than a correctness requirement.
 *
 * @param query - The bundle query. Need not be memoized.
 * @returns The current bundle, or `null` until the first one resolves.
 */
export function useFetchFilterBundle<T>(query: FilterBundleQuery): FilterBundle | null {
	const engine = useFilterEngine<T>();
	const lastChange = useLastChange();
	const [bundle, setBundle] = useState<FilterBundle | null>(null);

	// The effect reads the LATEST query through an Effect Event rather than closing over the one that
	// was current when the key last changed. Same content by definition — the key is derived from it —
	// but this keeps the two from drifting if the shape ever gains a non-serializable member, and it
	// keeps `query` itself out of the dependency list, which is the whole point of the key.
	const requestLatestQuery = useEffectEvent((fetcher: BundleFetcher): void => {
		fetcher.request(query);
	});

	const queryKey = JSON.stringify(query);

	useEffect(() => {
		// The transport branch and the stale guard live in `createBundleFetcher`, shared with the wine
		// panel and the non-React verticals. This hook is only the React binding: an effect keyed on
		// the engine's change tick, and a teardown.
		const fetcher = createBundleFetcher(engine, { onBundle: setBundle });

		requestLatestQuery(fetcher);

		return () => {
			fetcher.dispose();
		};
	}, [engine, lastChange, queryKey]);

	return bundle;
}

/**
 * Read one chip group's exclusion data as the `ExclusionMap` that `ChipToggleGroup` / `CheckboxList`
 * understand. Empty map until the bundle is ready, or when `ruleId` was not part of the query.
 *
 * @param ruleId - The chip group's rule id, matching the one used in the bundle query.
 * @returns Value → `{ wouldBeEmpty, projectedCount }`.
 */
export function useChipExclusion(ruleId: string): ExclusionMap {
	const ctx = use(FilterBundleContext);

	return useMemo<ExclusionMap>(() => chipExclusionMap(ctx?.bundle ?? null, ruleId), [ctx, ruleId]);
}

/**
 * Read one slider field's filtered-except-self bounds — the `RangeSlider` `available` zone that dims
 * the parts of the track no current result occupies.
 *
 * @param ruleId - The field's rule id, matching the one used in the bundle query.
 * @returns The bounds, or `null` until the bundle is ready / when the field was not queried / when
 *   its subset is empty. Callers fall back to the baseline bounds in that case.
 */
export function useFieldBounds(ruleId: string): NumericBounds | null {
	const ctx = use(FilterBundleContext);

	return fieldBounds(ctx?.bundle ?? null, ruleId);
}

/**
 * Read one slider field's distribution — the `RangeSlider` `histogram` overlay.
 *
 * @remarks
 * `undefined` rather than `[]` when there is nothing to draw, because the sliders distinguish the two:
 * absent renders no overlay, empty renders an overlay of nothing, and the second is a 38px blank band
 * above the track for the frame before the first bundle resolves.
 *
 * @param ruleId - The field's rule id, matching the one used in the bundle query.
 * @param selectedMin - The slider's committed lower bound.
 * @param selectedMax - The slider's committed upper bound.
 * @returns The buckets, or `undefined` when the bundle is absent, did not carry the field, or carried
 *   no buckets for it.
 */
export function useFieldHistogram(
	ruleId: string,
	selectedMin: number,
	selectedMax: number,
): undefined | readonly HistogramBucket[] {
	const ctx = use(FilterBundleContext);
	const bundle = ctx?.bundle ?? null;

	return useMemo(() => fieldHistogram(bundle, ruleId, selectedMin, selectedMax), [bundle, ruleId, selectedMin, selectedMax]);
}

/**
 * Whether turning ON a single toggle would empty the result set — `true` when no current result
 * passes the toggle's rule, so the toggle should be disabled.
 *
 * @remarks
 * Single-value toggles aren't expressible as bundle chip candidates, so this does the equivalent
 * one-pass check directly: adding the rule ANDs it with the current results, which is empty iff none
 * of the current results already pass it. An already-active toggle is never reported empty (all its
 * results pass it by construction), so the user can always turn it back off — the same
 * selected-is-never-disabled invariant the bundle guarantees for chips.
 *
 * @param candidateRule - The rule the toggle would add. Memoize it in the caller so this only
 *   recomputes on an actual engine change rather than every render.
 * @returns Whether the toggle should be disabled.
 */
export function useToggleWouldBeEmpty<T>(candidateRule: FilterRule): boolean {
	const engine = useFilterEngine<T>();

	// Re-render on ANY engine change so the disable state stays fresh even when a *different* facet
	// is what changed. `getResults()` is a memoized computed — its reference is stable until the
	// engine recomputes, so it is the honest memo dependency.
	useLastChange();

	const results = engine.core.getResults();

	return useMemo(
		() => !results.some((item) => candidateRule.action(item, candidateRule)),
		[results, candidateRule],
	);
}
