/**
 * `filterBundle.tsx` — the single-round-trip bundle plumbing for the wine filter panel.
 *
 * @remarks
 * One round trip per filter event: each filter event fires ONE engine call
 * (`applyFiltersAndQuery`) that returns the bundle of everything the panel needs to render —
 * result indices, per-slider bounds, per-slider pre-bucketed histograms, per-chip exclusion data.
 * This module owns the context, the fetch hook, and the per-field reader hooks that distribute
 * slices of the bundle to each section container.
 *
 * Extracted from the former monolithic `WineFilterPanel.tsx`.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleFieldMeta } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { HistogramBucket, NumericBounds } from '@filter-enginez/react-ui';

import { type ExclusionMap, useFilterEngine, useLastChange } from '@filter-enginez/react-signals';
import { createContext, use, useEffect, useMemo, useState } from 'react';

import type { SliderFieldId } from './filterConfig.js';

import { createBundleFetcher } from '../../filter-bundle/bundleFetcher.js';
import { chipDisabledSet, chipExclusionMap, chipProjectedCounts } from '../../filter-bundle/bundleReaders.js';
import { captureCurrentVersion, markResolvedAtLeast } from '../engineBusy.js';
import {
	buildWineBundleQuery,
	type OriginNodeSpec,
	type WineBundleQuery,
	wineFieldMeta,
	wineSliderHistogram,
} from '../wine-domain/bundle.js';

export {
	buildOriginNodeSpecs,
	bundleHistogramToBuckets,
	type OriginNodeSpec,
} from '../wine-domain/bundle.js';
export { FIELD_VALUE_STEPS } from '../wine-domain/filterConfig.js';

/**
 * Shape provided through `FilterBundleContext`. The bundle is `null` during the first render
 * window after engine boot (before the bundle fetch resolves); consumer hooks render with
 * baseline-only data in that case.
 */
export interface BundleContextValue {
	readonly baselines: Record<SliderFieldId, NumericBounds>;
	readonly bundle: FilterBundle | null;
}

/**
 * Context distributing the single fetched bundle (+ the slider baselines) to every section.
 */
export const FilterBundleContext = createContext<BundleContextValue | null>(null);

/**
 * Hook the wine panel uses to fetch a fresh bundle on every engine event. Stores in local state;
 * re-fetches in a useEffect keyed on `lastChange` so changes propagate.
 *
 * **Cancellation.** A stale-fetch guard discards the resolution if a NEWER lastChange tick fires
 * while a previous fetch is still in flight — prevents older results overwriting newer ones
 * during rapid filter changes.
 *
 * **Sync-engine support.** If `engine.asyncEngine` isn't present (sync engine on the main
 * thread), the bundle is computed synchronously via `engine.core.applyFiltersAndQuery(...)` with
 * no Promise round-trip. The shape returned is identical; consumers don't care which path produced it.
 */
export function useFetchFilterBundle(
	baselines: Record<SliderFieldId, NumericBounds>,
	chipVocabularies: Record<'body' | 'color' | 'sweetness' | 'varietal', readonly string[]>,
	originNodeSpecs: readonly OriginNodeSpec[],
): FilterBundle | null {
	const engine = useFilterEngine<Wine>();
	const lastChange = useLastChange();
	const [bundle, setBundle] = useState<FilterBundle | null>(null);

	useEffect(() => {
		const query: WineBundleQuery = buildWineBundleQuery(baselines, chipVocabularies, originNodeSpecs);

		// The transport branch, the stale guard, and "settle on every outcome" all live in
		// `createBundleFetcher`, shared with the books panel and the non-React verticals. What is
		// here is the React binding plus the busy-tracker wiring, which the fetcher takes as
		// callbacks rather than knowing about.
		//
		// `captureVersion` snapshots the userActionVersion current when this effect fired; `onSettled`
		// advances resolvedVersion to AT LEAST that value on EVERY outcome — resolved, superseded, or
		// failed. Clicks landing during the round trip push userActionVersion past the snapshot, which
		// is what keeps the indicator lit through the gap instead of blinking off mid-drag.
		const fetcher = createBundleFetcher(engine, {
			captureVersion: captureCurrentVersion,
			onBundle: setBundle,
			onError: (err) => {
				console.error('[useFetchFilterBundle] worker fetch failed:', err);
			},
			onSettled: markResolvedAtLeast,
		});

		fetcher.request(query);

		return () => {
			fetcher.dispose();
		};
	}, [engine, lastChange, baselines, chipVocabularies, originNodeSpecs]);

	return bundle;
}

/**
 * Read a single chip group's exclusion data from the bundle and reshape into the `ExclusionMap`
 * the `ChipToggleGroup` / `CheckboxList` components understand. Returns an empty map when the
 * bundle isn't ready yet.
 */
export function useBundleChipExclusion(ruleId: 'body' | 'color' | 'sweetness' | 'varietal'): ExclusionMap {
	const ctx = use(FilterBundleContext);

	return useMemo<ExclusionMap>(() => chipExclusionMap(ctx?.bundle ?? null, ruleId), [ctx, ruleId]);
}

/**
 * Pull a single field's metadata out of the bundle by ruleId. Returns `null` if the bundle isn't
 * ready yet OR if the queried field wasn't part of the query.
 */
export function useBundleFieldMeta(ruleId: SliderFieldId): FilterBundleFieldMeta | null {
	const ctx = use(FilterBundleContext);

	return wineFieldMeta(ctx?.bundle ?? null, ruleId);
}

/** One shared empty bar list, so a slider without a bundle keeps a stable `histogram` prop. */
const EMPTY_HISTOGRAM: readonly HistogramBucket[] = [];

/**
 * One slider's histogram bars, sliced for its scale.
 *
 * @remarks
 * The React face of `wineSliderHistogram`, which every wine panel in every app reads its bars
 * through: a log-scaled field's fine histogram is summed into equal slices of its track here, so the
 * React sliders draw the same bars as the other five apps.
 *
 * @param ruleId - The slider's field id.
 * @param baseline - The slider's baseline bounds.
 * @param selectedMin - The slider's lower handle.
 * @param selectedMax - The slider's upper handle.
 * @returns The bars, or an empty list before the first bundle settles.
 */
export function useBundleSliderHistogram(
	ruleId: SliderFieldId,
	baseline: NumericBounds,
	selectedMin: number,
	selectedMax: number,
): readonly HistogramBucket[] {
	const ctx = use(FilterBundleContext);

	return useMemo(
		() => wineSliderHistogram(ctx?.bundle ?? null, ruleId, baseline, selectedMin, selectedMax) ?? EMPTY_HISTOGRAM,
		[ctx, ruleId, baseline, selectedMin, selectedMax],
	);
}

/**
 * Read the origin chip group's per-node `wouldBeEmpty` data from the bundle and reshape into a
 * `Set<string>` of disabled node ids for the `HierarchicalPicker`'s `disabledNodes` prop.
 * Returns an empty set when the bundle isn't ready yet.
 */
export function useBundleOriginDisabledSet(): ReadonlySet<string> {
	const ctx = use(FilterBundleContext);

	return useMemo<ReadonlySet<string>>(() => chipDisabledSet(ctx?.bundle ?? null, 'origin'), [ctx]);
}

/**
 * Projected result counts per origin node, for the picker's per-row badges.
 *
 * @remarks
 * From the same bundle as the disabled set. The count has to come from the ENGINE — it is how many
 * wines a node covers, which the tree cannot know. A count of the node's leaf descendants looks
 * similar and is a different number: a country with one leaf region beneath it reads `1` and yields
 * two results.
 *
 * @returns Node id → projected count. Empty until the first bundle settles.
 */
export function useBundleOriginCounts(): ReadonlyMap<string, number> {
	const ctx = use(FilterBundleContext);

	return useMemo<ReadonlyMap<string, number>>(() => chipProjectedCounts(ctx?.bundle ?? null, 'origin'), [ctx]);
}
