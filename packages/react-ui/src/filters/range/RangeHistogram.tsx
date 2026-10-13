/**
 * `<RangeHistogram />` — the distribution-bar overlay rendered above a `<RangeSlider />` track.
 *
 * @remarks
 * Its own file so `RangeSlider.tsx` stays under the 500-line file-size cap. This is a **pure
 * presentational component**: every input arrives via props, and it reads no engine / store /
 * context. `<RangeSlider />` renders it above its track, so both React apps (RTK and plain) get it
 * unchanged through the shared filter panels in `examples-shared`.
 *
 * ### Three visual tiers (parallel to the slider track's gradient)
 *
 *   1. **In selection + available** → bright cyan accent with glow.
 *   2. **Available but not selected** → subdued gray-5 (visible but quiet).
 *   3. **Outside the available zone** → dim gray-5 at very low opacity (the "disabled" tier; bars
 *      are present only for spatial reference).
 *
 * **None of that arithmetic lives here.** `histogramBarClassName` + `histogramBarHeightPercent`
 * (both in `./histogram.js`, and both on the import-free `@filter-enginez/react-ui/bounds` subpath)
 * own it, because five other verticals render the same overlay and an epsilon comparison whose
 * purpose is to be identical everywhere belongs in one place. The tier resolves to a
 * `fe-range-histogram__bar--*` modifier and `ui-styles` owns the values; only the height stays
 * inline. The reasoning behind the tier rules — "use the slider's DISPLAYED values" and
 * overlap-not-containment — is recorded on `histogramBarTier` itself, next to the code it constrains.
 */

import type { NumericBounds } from './bounds.js';

import { histogramBarClassName, histogramBarHeightPercent, type HistogramBucket } from './histogram.js';

/**
 * Props for `<RangeHistogram />`.
 */
export interface RangeHistogramProps {
	/** Pre-computed distribution buckets (from the engine bundle, reshaped by the panel). */
	readonly histogram: readonly HistogramBucket[];
	/**
	 * The effective available zone — the filtered-except-self bounds the slider's handles are
	 * constrained to. Buckets overlapping this zone render as "available"; buckets outside it
	 * render dim. Pass the slider's `effectiveAvailable` (i.e. `available ?? baseline`).
	 */
	readonly available: NumericBounds;
	/** The slider's currently-displayed lower value (drag-aware). Drives the "in selection" tier. */
	readonly displayLower: number;
	/** The slider's currently-displayed upper value (drag-aware). Drives the "in selection" tier. */
	readonly displayUpper: number;
	/** Formatter for the per-bucket hover title (e.g. `(n) => '$' + n.toFixed(0)`). */
	readonly format: (value: number) => string;
}

/**
 * Distribution-bar overlay for `<RangeSlider />`. Returns `null` when there are no buckets to
 * render (cleaner for tiny ranges where the overlay would just be noise).
 *
 * @example
 *   <RangeHistogram
 *     histogram={priceHistogram}
 *     available={{ min: 10, max: 80 }}
 *     displayLower={20}
 *     displayUpper={50}
 *     format={(n) => '$' + n.toFixed(0)}
 *   />
 */
export const RangeHistogram = (props: RangeHistogramProps): React.ReactElement | null => {
	const { available, displayLower, displayUpper, format, histogram } = props;

	if (histogram.length === 0) {
		return null;
	}

	return (
		<div className="fe-range-histogram" aria-hidden="true">
			{histogram.map((bucket) => (
				<div
					key={bucket.bucketMin}
					className={histogramBarClassName(bucket, available, displayLower, displayUpper)}
					style={{ height: `${histogramBarHeightPercent(bucket)}%` }}
					title={`${bucket.count.toLocaleString()} items in [${format(bucket.bucketMin)}, ${format(bucket.bucketMax)})`}
				/>
			))}
		</div>
	);
};
