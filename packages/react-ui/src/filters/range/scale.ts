/**
 * Slider scales — how a range slider maps values onto its track, and the histogram math that has to
 * follow the same mapping.
 *
 * @remarks
 * ## Why a slider needs a scale at all
 *
 * A linear track is right when values spread across their range. It is wrong for a heavy-tailed field.
 * Wine prices run from $4 to over $3,000 with half the bottles under $30: on a linear track the whole
 * everyday range is the first 1% of the control, the histogram is one tall bar and eighty-three empty
 * ones, and the thumb cannot be placed on $25 by hand. Vintages have the same shape reversed — a few
 * bottles from the 1910s and nearly everything since 2005.
 *
 * ## The log scale used here
 *
 * {@link logSliderScale} places a value at
 *
 *     fraction = ln(1 + d / k) / ln(1 + span / k)
 *
 * where `d` is the value's distance from the ANCHOR — the dense end of the data (the minimum for
 * prices, the maximum for vintages) — and `k` is a softening constant. Near the anchor, within a few
 * `k`, the track is close to linear; further out it is logarithmic, so every doubling of distance gets
 * the same length of track. Without the softening, `ln(d)` diverges at the anchor and the first
 * grid step would take an unbounded share of the track. Every value stays reachable, by drag, by
 * keyboard and by typing; only the spacing changes.
 *
 * ## The histogram has to follow
 *
 * The bars are equal-width flex children, so a bar is a slice of the TRACK, not of the value range.
 * Under a log scale those slices are log-spaced in value, which the engine's equal-width histogram
 * cannot produce directly. So a log-scaled field asks the engine for a FINE histogram — one bucket per
 * value-grid position, each centered on its grid value ({@link fineHistogramQuery}) — and
 * {@link rebinHistogram} sums those into the track's slices. Near the anchor one grid step takes the
 * most track, and a slice narrower than that step could fall between two grid values and draw empty,
 * so {@link scaledBucketCount} sizes the slices to be at least that wide: the comb rule
 * `sliderBucketCount` applies to linear tracks, applied in track space.
 *
 * This module imports only types, from import-free siblings, so it belongs on the import-free
 * `@filter-enginez/react-ui/bounds` subpath every non-React slider reads.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from './bounds.js';

import { DENSE_BUCKET_COUNT, type HistogramBucket, sliderBucketCount } from './histogram.js';

/**
 * How many positions a slider control runs over when its scale is not linear.
 *
 * @remarks
 * Used by controls whose own position model is value-based (Radix): a log-scaled slider runs the
 * control over `0..SLIDER_POSITION_RESOLUTION` and converts at the edges. A thousand positions is a
 * finer grain than any pointer can choose on a phone-width track.
 */
export const SLIDER_POSITION_RESOLUTION = 1000;

/**
 * The share of the track one arrow-key press moves a thumb on a log-scaled slider.
 *
 * @remarks
 * A value-space step would make the keyboard useless at one end of a log track: a $1 step is right at
 * $8 and takes three thousand presses to cross the tail. One percent of the track per press is a
 * hundred presses end to end, whatever the scale.
 */
export const LOG_KEYBOARD_FRACTION = 0.01;

/**
 * How many value-grid steps soften a log scale near its anchor.
 *
 * @remarks
 * Ten steps: within about $10 of a $4 floor, or ten years of the youngest vintage, the track is close
 * to linear, and beyond that every doubling of distance gets the same length of track. Expressed in
 * grid steps so the same rule serves every log-scaled field.
 */
export const LOG_SOFTENING_GRID_STEPS = 10;

/**
 * The most buckets {@link fineHistogramQuery} asks the engine for.
 *
 * @remarks
 * One per grid position is exact; the cap bounds the bundle's size for a field with a very fine grid.
 * A field over the cap gets equal-width buckets slightly wider than its grid, and
 * {@link rebinHistogram} places each by its center, which can put a value on a slice boundary into the
 * neighboring slice.
 */
export const FINE_HISTOGRAM_BUCKET_CAP = 4096;

/** Which end of a log scale the data crowds against. */
export type LogScaleAnchor = 'max' | 'min';

/**
 * A slider's mapping between values and track position.
 *
 * @remarks
 * Every slider in the repo renders through one of these. A linear scale is the identity on the
 * value-to-fraction ratio, so a slider given no scale behaves exactly as before.
 */
export interface SliderScale {
	/** Which mapping this is. Controls with a value-based position model branch on it. */
	readonly kind: 'linear' | 'log';
	/**
	 * Place a value on the track.
	 *
	 * @param value - The value. Values outside the baseline clamp to the ends.
	 * @returns The track position, `0` at the baseline minimum and `1` at the maximum.
	 */
	toFraction(value: number): number;
	/**
	 * Read a value off the track.
	 *
	 * @param fraction - The track position; clamped to `0..1`.
	 * @returns The value there, unsnapped.
	 */
	fromFraction(fraction: number): number;
}

/** What a field declares about its scale; turned into a {@link SliderScale} once its baseline is known. */
export type SliderScaleSpec = { readonly anchor: LogScaleAnchor; readonly kind: 'log' } | { readonly kind: 'linear' };

/**
 * Clamp a number into `0..1`.
 *
 * @param fraction - Any number.
 * @returns It, clamped.
 * @internal
 */
function clampFraction(fraction: number): number {
	return Math.max(0, Math.min(1, fraction));
}

/**
 * The linear scale: equal value spans get equal track.
 *
 * @param baseline - The track's extent.
 * @returns The scale. A degenerate baseline maps every value to `0`.
 */
export function linearSliderScale(baseline: NumericBounds): SliderScale {
	const span = baseline.max - baseline.min;

	return {
		fromFraction: (fraction) => baseline.min + clampFraction(fraction) * span,
		kind: 'linear',
		toFraction: (value) => (span <= 0 ? 0 : clampFraction((value - baseline.min) / span)),
	};
}

/**
 * The softened log scale described in the module docblock.
 *
 * @param baseline - The track's extent.
 * @param anchor - The dense end of the data.
 * @param softening - `k`, in value units; must be positive. A non-positive value falls back to linear.
 * @returns The scale.
 */
export function logSliderScale(baseline: NumericBounds, anchor: LogScaleAnchor, softening: number): SliderScale {
	const span = baseline.max - baseline.min;

	if (span <= 0 || !(softening > 0)) {
		return linearSliderScale(baseline);
	}
	const total = Math.log1p(span / softening);
	const distanceToFraction = (distance: number): number => Math.log1p(Math.max(0, distance) / softening) / total;
	const fractionToDistance = (fraction: number): number => softening * Math.expm1(clampFraction(fraction) * total);

	return anchor === 'min'
		? {
			fromFraction: (fraction) => Math.min(baseline.max, baseline.min + fractionToDistance(fraction)),
			kind: 'log',
			toFraction: (value) => clampFraction(distanceToFraction(value - baseline.min)),
		}
		: {
			fromFraction: (fraction) => Math.max(baseline.min, baseline.max - fractionToDistance(1 - clampFraction(fraction))),
			kind: 'log',
			toFraction: (value) => clampFraction(1 - distanceToFraction(baseline.max - value)),
		};
}

/**
 * Build the scale a field declares, over its baseline.
 *
 * @param spec - The field's declaration.
 * @param baseline - The field's baseline bounds.
 * @param valueStep - The grid the field's values fall on; a log scale softens by
 *   {@link LOG_SOFTENING_GRID_STEPS} of these. `0` (continuous) softens by one hundredth of the span.
 * @returns The scale.
 */
export function createSliderScale(spec: SliderScaleSpec, baseline: NumericBounds, valueStep: number): SliderScale {
	if (spec.kind === 'linear') {
		return linearSliderScale(baseline);
	}
	const softening = valueStep > 0
		? valueStep * LOG_SOFTENING_GRID_STEPS
		: (baseline.max - baseline.min) / 100;

	return logSliderScale(baseline, spec.anchor, softening);
}

/**
 * Snap a value onto a step grid.
 *
 * @remarks
 * Rounds in integer space (`round(value / step) * step`), then trims the float noise the multiply
 * leaves (`0.1 * 3` is `0.30000000000000004`) to the step's own decimal places.
 *
 * @param value - The value.
 * @param step - The grid; `0` or less leaves the value as it is.
 * @returns The snapped value.
 */
export function snapToStep(value: number, step: number): number {
	if (!(step > 0)) {
		return value;
	}
	const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);

	return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * The value one keyboard press moves a thumb to.
 *
 * @remarks
 * Linear: one `step`, as every slider has always done. Log: {@link LOG_KEYBOARD_FRACTION} of the
 * track, snapped to `step`, and never less than one `step` — so a press always moves the thumb.
 *
 * @param scale - The slider's scale.
 * @param value - The thumb's current value.
 * @param direction - `1` for up/right, `-1` for down/left.
 * @param step - The slider's step.
 * @returns The next value, unclamped; the slider clamps it to its available zone.
 */
export function stepScaledValue(scale: SliderScale, value: number, direction: -1 | 1, step: number): number {
	if (scale.kind === 'linear') {
		return value + direction * step;
	}
	const moved = snapToStep(scale.fromFraction(scale.toFraction(value) + direction * LOG_KEYBOARD_FRACTION), step);
	const minimumMove = value + direction * step;

	return direction > 0 ? Math.max(moved, minimumMove) : Math.min(moved, minimumMove);
}

/**
 * How many histogram bars a scaled slider draws.
 *
 * @remarks
 * Linear tracks keep {@link sliderBucketCount}. A log track gets as many equal bars as fit with each
 * bar at least as wide as the widest single value step — the one at the anchor, where the scale
 * stretches most — capped at {@link DENSE_BUCKET_COUNT}. A narrower bar there could fall between two
 * grid values and draw empty. See the module docblock.
 *
 * @param scale - The slider's scale.
 * @param baseline - The baseline the scale spans.
 * @param valueStep - The grid the values fall on; `0` for a continuous field.
 * @returns The bar count, at least 1.
 */
export function scaledBucketCount(scale: SliderScale, baseline: NumericBounds, valueStep: number): number {
	if (scale.kind === 'linear' || !(valueStep > 0)) {
		return sliderBucketCount(baseline, valueStep);
	}
	// One grid step takes the most track at the anchor, where the scale stretches; which end that is
	// depends on the anchor, so both ends are measured and the wider step wins.
	const stepAtMin = scale.toFraction(baseline.min + valueStep) - scale.toFraction(baseline.min);
	const stepAtMax = scale.toFraction(baseline.max) - scale.toFraction(baseline.max - valueStep);
	const widestStep = Math.max(stepAtMin, stepAtMax);

	return Math.max(1, Math.min(DENSE_BUCKET_COUNT, Math.floor(1 / widestStep)));
}

/** The histogram part of a bundle field query: the engine's equal-width buckets over a range. */
export interface HistogramQuery {
	/** Left edge of the first bucket. */
	readonly baselineMin: number;
	/** Right edge of the last bucket. */
	readonly baselineMax: number;
	/** How many equal-width buckets. */
	readonly bucketCount: number;
}

/**
 * The fine histogram a log-scaled field asks the engine for.
 *
 * @remarks
 * One bucket per grid position, each CENTERED on its grid value — the range is widened by half a step
 * at each end, so a value on the grid sits mid-bucket and never on an edge, where a float rounding
 * could tip it into the neighbor. {@link rebinHistogram} then places each bucket by its center, which
 * is the grid value itself. Above {@link FINE_HISTOGRAM_BUCKET_CAP} positions, equal buckets over the
 * baseline instead.
 *
 * @param baseline - The field's baseline bounds.
 * @param valueStep - The grid the values fall on.
 * @returns The histogram part of the field query.
 */
export function fineHistogramQuery(baseline: NumericBounds, valueStep: number): HistogramQuery {
	const positions = valueStep > 0 ? Math.round((baseline.max - baseline.min) / valueStep) + 1 : Number.POSITIVE_INFINITY;

	if (positions <= FINE_HISTOGRAM_BUCKET_CAP) {
		return {
			baselineMax: baseline.min + (positions - 0.5) * valueStep,
			baselineMin: baseline.min - valueStep / 2,
			bucketCount: positions,
		};
	}

	return { baselineMax: baseline.max, baselineMin: baseline.min, bucketCount: FINE_HISTOGRAM_BUCKET_CAP };
}

/**
 * Sum a fine histogram into equal slices of a scaled track.
 *
 * @remarks
 * Each fine bucket lands in the slice holding its center. The returned buckets carry VALUE-space
 * edges (the scale's inverse at each slice boundary), so the tier classification and the selection
 * flag compare them against handle values exactly as they do for a linear histogram.
 *
 * @param fine - The engine's fine buckets, in order.
 * @param scale - The slider's scale.
 * @param sliceCount - How many slices — {@link scaledBucketCount}.
 * @param selectedMin - The slider's lower handle, for the `inSelection` flag.
 * @param selectedMax - The slider's upper handle.
 * @returns One bucket per slice, left to right; empty when there is nothing to slice.
 */
export function rebinHistogram(
	fine: readonly HistogramBucket[],
	scale: SliderScale,
	sliceCount: number,
	selectedMin: number,
	selectedMax: number,
): readonly HistogramBucket[] {
	if (fine.length === 0 || sliceCount <= 0) {
		return [];
	}
	const counts = new Array<number>(sliceCount).fill(0);

	for (const bucket of fine) {
		const slice = Math.min(sliceCount - 1, Math.floor(scale.toFraction((bucket.bucketMin + bucket.bucketMax) / 2) * sliceCount));

		counts[slice] = (counts[slice] ?? 0) + bucket.count;
	}
	const tallest = Math.max(1, ...counts);
	const slices: HistogramBucket[] = [];

	for (const [index, count] of counts.entries()) {
		const bucketMin = scale.fromFraction(index / sliceCount);
		const bucketMax = scale.fromFraction((index + 1) / sliceCount);

		slices.push({
			bucketMax,
			bucketMin,
			count,
			heightFraction: count / tallest,
			inSelection: bucketMin <= selectedMax && bucketMax >= selectedMin,
		});
	}

	return slices;
}
