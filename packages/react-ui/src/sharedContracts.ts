/**
 * `@filter-enginez/react-ui/bounds` — the React-free shared-contract subpath.
 *
 * @remarks
 * **The name says `bounds`; the contents are broader, and that is deliberate.** This subpath began as
 * the bounds math alone, then became the place every SHARED, IMPORT-FREE contract lives — because the
 * non-React verticals need the types and the pure helpers that `react-ui`'s components are built
 * around, without the components. Renaming the subpath would break five apps' imports for a cosmetic
 * gain, so the name stayed and this doc carries the caveat.
 *
 * The one hard rule: **everything reachable from here imports nothing.** No React, no engine, no
 * browser globals. The moment that stops being true, five bundles silently re-taint —
 * `tests/tooling/reactFreeSubpaths.test.ts` is what notices.
 *
 * @packageDocumentation
 */

export { type PickerTreeNode } from './filters/hierarchical/pickerTree.js';
export {
	ariaCheckedFor,
	collectDescendantIds,
	hasChildren,
	hasSelectedDescendant,
	type IndexedNode,
	indexTree,
	isRowVisible,
	type NodeSelectionState,
	resolveNodeState,
	toggleNodeSelection,
} from './filters/hierarchical/treeSelection.js';
export { clampToBounds, deriveBaselineBounds, deriveBounds, type NumericBounds } from './filters/range/bounds.js';
export {
	DENSE_BUCKET_COUNT,
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBarTier,
	histogramBarTier,
	type HistogramBucket,
	sliderBucketCount,
} from './filters/range/histogram.js';
export {
	createSliderScale,
	FINE_HISTOGRAM_BUCKET_CAP,
	fineHistogramQuery,
	type HistogramQuery,
	linearSliderScale,
	LOG_KEYBOARD_FRACTION,
	LOG_SOFTENING_GRID_STEPS,
	type LogScaleAnchor,
	logSliderScale,
	rebinHistogram,
	scaledBucketCount,
	SLIDER_POSITION_RESOLUTION,
	type SliderScale,
	type SliderScaleSpec,
	snapToStep,
	stepScaledValue,
} from './filters/range/scale.js';
