/**
 * `@filter-enginez/examples-shared/bounds` — the slider's geometry contract and the math that derives
 * it, belonging to no dataset.
 *
 * @remarks
 * A `<RangeSlider>` needs four things it cannot compute for itself: the `NumericBounds` pair that
 * describes a track, the `HistogramBucket` shape it draws a distribution from, the helpers that turn
 * a corpus into a baseline (`deriveBaselineBounds`) or clamp a selection back inside one
 * (`clampToBounds`), and the shared bar primitives every vertical's histogram overlay renders through
 * (`histogramBarTier`, `histogramBarHeightPercent`, plus `sliderBucketCount` for the panel that
 * builds the bundle query), and the scale a track lays its values out on (`SliderScale`, with the
 * keyboard and snapping rules that follow it). None of that is about books, or wine, or real estate.
 *
 * They live in `@filter-enginez/react-ui/bounds` — an import-free subpath despite the package name,
 * per `tests/tooling/reactFreeSubpaths.test.ts` — but `examples-shared` is the only facade the
 * non-React verticals declare as a dependency, so they need a subpath here to reach them. Without a
 * neutral one, every generic slider would import its bounds types from a DATASET subpath such as
 * `./books-domain`, including the ones rendering wine and real estate.
 *
 * That is the same reasoning behind `./picker`, one facet over: a control in a neutral controls tier
 * that takes its contract from a dataset subpath teaches the reader that the control belongs to that
 * dataset. This is the neutral address. The dataset subpaths keep their re-exports, so imports
 * through them resolve too.
 *
 * **Why re-export rather than move.** Identical reasoning to `./picker`: the definitions are
 * `react-ui`'s and the React sliders are their first consumer. Relocating them would make a React
 * component import its own contract from an examples package, inverting the dependency. The hop costs
 * one build-time indirection and nothing at runtime.
 *
 * `NumericBounds` is also reachable from `./bundle-readers`, which returns one from `fieldBounds` —
 * the same symbol by the same identity, not a second declaration; see the note on that module.
 *
 * @packageDocumentation
 */

export {
	clampToBounds,
	createSliderScale,
	DENSE_BUCKET_COUNT,
	deriveBaselineBounds,
	deriveBounds,
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBarTier,
	histogramBarTier,
	type HistogramBucket,
	linearSliderScale,
	nearestThumb,
	type NumericBounds,
	resolveTypedBound,
	sliderBucketCount,
	type SliderScale,
	snapClampToBounds,
	snapToStep,
	stepScaledValue,
} from '@filter-enginez/react-ui/bounds';
