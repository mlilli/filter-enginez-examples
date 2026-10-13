/**
 * `@filter-enginez/examples-shared/wine-domain` — the framework-neutral wine domain logic.
 *
 * @remarks
 * The counterpart to `./books-domain`: everything the non-React wine verticals (SvelteKit, Vue,
 * Angular, vanilla) share, with no hook or component in any file.
 *
 * Four concerns:
 *
 *   - {@link ./filterConfig} — chip vocabularies, slider field getters, snap steps, fallback bounds,
 *     and the selection-equality helper. Split from `filters/filterConfig.ts`, which keeps the one
 *     React hook and re-exports all of this.
 *   - {@link ./bundle} — the wine bundle query and the two readers that are genuinely wine's own,
 *     because wine is the only panel with a TREE facet (queried as `inSetOfSets`) and histogram
 *     sliders (which need the whole field metadata, not just its bounds).
 *   - {@link ./smartFilters} — the four expression-mode presets, re-exported from the already-neutral
 *     `../smartFilters.ts`, with `buildSmartFilterExpression` as the write half of the round trip
 *     `deriveSelectedPresetIds` reads back.
 *   - {@link ./commit} — the one place a wine mutation is written to the engine, so no vertical keeps
 *     a hand-typed copy of `WINE_FACET_RULE_IDS`.
 *
 * The generic bundle readers and the fetch loop are NOT here — they are shared with books and live in
 * `filter-bundle/`. Duplicating them per dataset is exactly the drift this subpath exists to prevent.
 *
 * @packageDocumentation
 */

// Re-exported so a consumer needs ONLY this subpath. `react-ui/bounds` is import-free and safe, but
// making every vertical add `@filter-enginez/react-ui` to its package.json to reach a type would be a
// dependency edge that exists purely as an artifact of where the type happens to live.
export {
	ariaCheckedFor,
	clampToBounds,
	deriveBaselineBounds,
	hasChildren,
	type HistogramBucket,
	type IndexedNode,
	indexTree,
	isRowVisible,
	type NodeSelectionState,
	type NumericBounds,
	type PickerTreeNode,
	resolveNodeState,
	toggleNodeSelection,
} from '@filter-enginez/react-ui/bounds';

export * from './bundle.js';
export * from './commit.js';
// Shared by the Angular, Vue, SvelteKit and vanilla wine routes. Pure, engine-free, testable without a
// worker.
export { deriveWineFacets, type WineFacets } from './facets.js';
// The tracker the commit helpers bump, exported from the same subpath that exports them — a vertical
// that writes through `commitRule` and reads busy state from a DIFFERENT instance gets an indicator
// that never lights, with nothing erroring. One import path, one instance.
//
// Real estate exports its equivalent from `./real-estate-core` instead. That is not an inconsistency
// worth chasing: wine's `./wine-core` must be imported dynamically under SvelteKit (it reaches the
// worker bridge, and a static import evaluates during SSR), so the busy core cannot live there and
// still be reachable from a component's static import list.
export { wineBusyCore } from '../engineBusyCore.js';
export * from './filterConfig.js';
export * from './ruleSummaries.js';
export {
	buildSmartFilterExpression,
	deriveSelectedPresetIds,
	WINE_SMART_FILTERS,
	type WineSmartFilter,
} from '../smartFilters.js';
export { formatVintageRange, vintageBoundsFromSet, vintageYearsFromRange } from './vintage.js';
export {
	type BundleFetcher,
	type BundleFetchHandlers,
	type BundleQueryable,
	createBundleFetcher,
} from '../../filter-bundle/bundleFetcher.js';
export {
	chipDisabledSet,
	type ChipExclusion,
	chipExclusionMap,
	chipProjectedCounts,
	type ExclusionMap,
	fieldBounds,
	fieldHistogram,
	toggleWouldBeEmpty,
} from '../../filter-bundle/bundleReaders.js';
