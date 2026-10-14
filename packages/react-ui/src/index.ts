/**
 * `@filter-enginez/react-ui` — public barrel for the React presentational component layer.
 *
 * @remarks
 * Dumb, prop-driven components only — no engine, no state library, no browser globals. Each
 * component lives in its own file with a single exported component + its props interface, and
 * pulls its visuals from `@filter-enginez/ui-styles` semantic classes + `@filter-enginez/brand`
 * tokens. Inline styles are reserved for data-driven values (a histogram bar's height, a slider
 * track's gradient, a list's max height).
 *
 * @packageDocumentation
 */

export { RangeSlider } from './filters/range/RangeSlider.js';
export type { RangeSliderProps } from './filters/range/RangeSlider.js';

export { RangeHistogram } from './filters/range/RangeHistogram.js';
export type { RangeHistogramProps } from './filters/range/RangeHistogram.js';

export { SearchInput } from './filters/text-query/SearchInput.js';
export type { SearchInputProps } from './filters/text-query/SearchInput.js';

export { SelectMenu } from './filters/select/SelectMenu.js';
export type { SelectMenuProps, SelectOption } from './filters/select/SelectMenu.js';

export { NumberField } from './filters/number/NumberField.js';
export type { NumberFieldProps } from './filters/number/NumberField.js';

export { ChipToggleGroup } from './filters/in-set/ChipToggleGroup.js';
export type { ChipToggleGroupProps } from './filters/in-set/ChipToggleGroup.js';

export { CheckboxList } from './filters/in-set/CheckboxList.js';
export type { CheckboxListProps } from './filters/in-set/CheckboxList.js';

export { HierarchicalPicker } from './filters/hierarchical/HierarchicalPicker.js';
export type { HierarchicalPickerProps, PickerTreeNode } from './filters/hierarchical/HierarchicalPicker.js';

export { ResultsHeaderView } from './results/ResultsHeaderView.js';
export type { FilterSummary, ResultsHeaderViewProps } from './results/ResultsHeaderView.js';

export { DevtoolsPanelView } from './devtools/DevtoolsPanelView.js';
export type { DevtoolsLogEntry, DevtoolsPanelViewProps } from './devtools/DevtoolsPanelView.js';

export { FilterDrawer } from './overlays/FilterDrawer.js';
export type { FilterDrawerProps } from './overlays/FilterDrawer.js';

export { ScrollRegion } from './shared/ScrollRegion.js';
export type { ScrollRegionProps } from './shared/ScrollRegion.js';

export type { ExclusionEntry, ExclusionMap } from './shared/exclusion.js';

export { clampToBounds, deriveBaselineBounds, deriveBounds } from './filters/range/bounds.js';
export type { NumericBounds } from './filters/range/bounds.js';

export {
	applyRulesExcept,
	computeHistogram,
	DENSE_BUCKET_COUNT,
	histogramBarClassName,
	histogramBarHeightPercent,
	histogramBarTier,
	sliderBucketCount,
} from './filters/range/histogram.js';
export type { HistogramBarTier, HistogramBucket } from './filters/range/histogram.js';
export {
	createSliderScale,
	fineHistogramQuery,
	linearSliderScale,
	logSliderScale,
	rebinHistogram,
	scaledBucketCount,
	SLIDER_POSITION_RESOLUTION,
	snapToStep,
	stepScaledValue,
} from './filters/range/scale.js';
export type { HistogramQuery, LogScaleAnchor, SliderScale, SliderScaleSpec } from './filters/range/scale.js';
