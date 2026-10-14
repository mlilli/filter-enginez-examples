/**
 * Tiny histogram helper — bucket a numeric field's values into N buckets and report
 * per-bucket counts + whether each bucket falls inside the currently-selected
 * `[selectedMin, selectedMax]` range.
 *
 * @remarks
 * Used by `<RangeSlider />` to draw the distribution-overlay bars per the design system's
 * canonical range-slider mockup (see `docs/branding/design-system/preview/range-slider.html`).
 * The mockup shows 12 bars for the price filter; we default to 12 to match.
 *
 * **What "in-range" means for a bucket.** A bucket is treated as in-range if ANY part of
 * its `[bucketMin, bucketMax)` interval overlaps the user's `[selectedMin, selectedMax]`
 * selection. The user thinks of the slider as "include everything from here to here," and
 * a bucket whose right edge falls past the selected min visually belongs to the selection
 * even if a tiny sliver of its values would technically miss.
 *
 * **Normalized bucket heights.** Heights are returned as `0..1` (proportional to the
 * max-count bucket) rather than raw counts, so the slider component can render them with
 * simple `height: ${pct * 100}%` styling without knowing the dataset's absolute scale.
 *
 * ### Also the home of the shared BAR primitives
 *
 * {@link histogramBarTier}, {@link histogramBarClassName}, {@link histogramBarHeightPercent} and
 * {@link sliderBucketCount} are
 * here because they are pure bucket math and this module is import-free, which puts them on the
 * `@filter-enginez/react-ui/bounds` subpath every non-React vertical consumes. All six verticals'
 * range overlays render through them, so there is one copy of an epsilon comparison whose whole
 * purpose is to be identical everywhere.
 *
 * The single `import type` below reaches `./bounds.js`, which is itself import-free and already on
 * that subpath, so the "everything reachable from here imports nothing" promise still holds.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from './bounds.js';

/**
 * One bucket in a histogram.
 */
export interface HistogramBucket {
	/** Left edge of the bucket (inclusive). */
	readonly bucketMin: number;
	/** Right edge of the bucket (exclusive, except for the last bucket which is inclusive). */
	readonly bucketMax: number;
	/** Raw item count for this bucket. */
	readonly count: number;
	/** Normalized 0..1 height — `count / maxCountAcrossAllBuckets`. */
	readonly heightFraction: number;
	/**
	 * Whether this bucket's interval overlaps the currently-selected `[selectedMin,
	 * selectedMax]` range. Used by the slider component to render in/out colors.
	 */
	readonly inSelection: boolean;
}

/**
 * Apply every active rule on the engine EXCEPT one (typically the rule whose slider is
 * showing the histogram) to a dataset, returning the items that pass. Used to compute
 * "if I weren't constraining on price, where would my current results sit on the price
 * axis?" — the right semantic for a slider histogram.
 *
 * @remarks
 * Equivalent to `engine.simulate({ ignoreRules: [excludeId] }).items` would be, except
 * `simulate()` only returns a 5-item `sample` rather than the full filtered set. We
 * duplicate the evaluation here for histogram bucketing purposes. At 10k records × 10
 * rules this runs in well under 1ms; if it ever becomes a bottleneck the right fix is to
 * extend core's `simulate()` to return the full items.
 *
 * @param items - The full source-data array (typically the module-level constant)
 * @param rules - The currently-active rules from the engine (via `engine.core.getRules()`)
 * @param excludeRuleId - The rule id to skip during evaluation
 * @returns Items that pass every rule except the excluded one
 */
export function applyRulesExcept<T>(
	items: readonly T[],
	rules: ReadonlyMap<string, { readonly action: (item: T, rule: unknown) => boolean }>,
	excludeRuleId: string,
): readonly T[] {
	// Materialize the rule list once (excluding the target) so the per-item inner loop
	// stays tight.
	const activeRules: { readonly action: (item: T, rule: unknown) => boolean }[] = [];

	for (const [id, rule] of rules) {
		if (id === excludeRuleId) {
			continue;
		}
		activeRules.push(rule);
	}
	if (activeRules.length === 0) {
		return items;
	}
	const result: T[] = [];

	for (const item of items) {
		let didPass = true;

		for (const rule of activeRules) {
			if (!rule.action(item, rule)) {
				didPass = false;
				break;
			}
		}
		if (didPass) {
			result.push(item);
		}
	}

	return result;
}

/**
 * Compute a histogram of values across `bucketCount` equal-width buckets in `[bounds.min,
 * bounds.max]`, marking each bucket as in/out of `[selectedMin, selectedMax]`.
 *
 * @remarks
 * The corpus-scanning path, kept for callers that hold the values themselves. Every panel in the
 * repo takes its buckets from the engine's predictive-disable bundle instead — see
 * `bundleHistogramToBuckets` in `examples-shared/filter-bundle/bundleReaders`, which produces the
 * same {@link HistogramBucket} shape from the bundle's typed arrays without touching the corpus.
 *
 * @param values - The numeric field values to bucket (typically pulled from the engine's
 *   source data via `wines.map(w => w.priceUsd)` etc.)
 * @param bounds - The full legal range — the histogram spans this exact range regardless
 *   of the value distribution, so the slider's 0% position aligns with `bounds.min`
 * @param selectedMin - The currently-selected lower bound (handle position)
 * @param selectedMax - The currently-selected upper bound (handle position)
 * @param bucketCount - How many buckets to compute. Defaults to 12 to match the design-system
 *   mockup.
 * @returns An array of `bucketCount` buckets in left-to-right order
 */
export function computeHistogram(
	values: readonly number[],
	bounds: { readonly max: number; readonly min: number; },
	selectedMin: number,
	selectedMax: number,
	bucketCount = 12,
): readonly HistogramBucket[] {
	const { max, min } = bounds;
	const span = max - min;

	if (span <= 0 || bucketCount <= 0) {
		return [];
	}

	const bucketWidth = span / bucketCount;

	// Tally counts per bucket.
	const counts = new Array<number>(bucketCount).fill(0);

	for (const v of values) {
		if (v < min || v > max) {
			continue;
		}
		// `Math.min(..., bucketCount - 1)` so values exactly at `max` land in the last bucket
		// rather than overflowing into an out-of-range index `bucketCount`.
		const idx = Math.min(Math.floor((v - min) / bucketWidth), bucketCount - 1);

		/* v8 ignore next -- defensive: noUncheckedIndexedAccess fallback; idx is clamped to [0, bucketCount-1] */
		counts[idx] = (counts[idx] ?? 0) + 1;
	}

	// Normalize against the tallest bucket so heights span 0..1.
	let maxCount = 0;

	for (const c of counts) {
		if (c > maxCount) {
			maxCount = c;
		}
	}
	const safeMaxCount = maxCount === 0 ? 1 : maxCount; // avoid division by zero

	// Build the bucket descriptors.
	const result: HistogramBucket[] = [];

	for (let i = 0; i < bucketCount; i++) {
		const bucketMin = min + i * bucketWidth;
		const bucketMax = min + (i + 1) * bucketWidth;
		/* v8 ignore next -- defensive: noUncheckedIndexedAccess fallback; i < bucketCount = counts.length */
		const count = counts[i] ?? 0;
		// Overlap test: bucket [bucketMin, bucketMax) overlaps selection [selectedMin, selectedMax]
		// when bucketMin <= selectedMax AND bucketMax >= selectedMin.
		const isInSelection = bucketMin <= selectedMax && bucketMax >= selectedMin;

		result.push({
			bucketMax,
			bucketMin,
			count,
			heightFraction: count / safeMaxCount,
			inSelection: isInSelection,
		});
	}

	return result;
}

/**
 * Which of a range slider's three visual tiers a histogram bar belongs to.
 *
 * @remarks
 * The same three tiers the slider TRACK paints as a gradient, so the bars and the track read as one
 * control: `'selected'` is the user's current range (cyan, glowing), `'available'` is selectable
 * territory outside it (quiet gray), `'outside'` is beyond the filtered-except-self zone (dim gray,
 * present only for spatial reference).
 */
export type HistogramBarTier = 'available' | 'outside' | 'selected';

/**
 * Float slop for the tier boundary comparisons.
 *
 * @remarks
 * Bucket edges and handle values are both computed floats, so a bar sitting exactly on a tier
 * boundary can miss its comparison by ~1e-16 and render as out-of-range — one bar in a run of
 * eighty rendering dim for no visible reason.
 *
 * @internal
 */
const TIER_BOUNDARY_EPSILON = 1e-6;

/**
 * Classify one bucket into its visual tier.
 *
 * @remarks
 * **Overlap, not containment.** "Within available" means the bucket's range
 * OVERLAPS the available zone rather than being strictly contained by it. Under containment the
 * boundary bucket — the one straddling the available edge — would read as outside-available and
 * render dim, leaving the thumb parked at `available.max` visually hanging over a dim bar. Overlap lets
 * the boundary bucket read as available (the thumb is inside it) and starts the dim band cleanly
 * one bar over.
 *
 * **Pass the slider's DISPLAYED values, not its committed ones.** Computing the tier upstream from
 * raw rule config would classify default-wide rules — wine's ABV `{ min: 0, max: 25 }` — as fully
 * in-selection until the user touched the slider. Passing the
 * clamped, drag-aware displayed values keeps the bars in lockstep with the thumbs both mid-drag and
 * on the first render after a sibling filter narrows the zone.
 *
 * @param bucket - The bucket to classify.
 * @param available - The effective available zone — `available ?? baseline`, never the raw
 *   `available`, or a slider with no filtered-except-self subset yet would dim every bar.
 * @param displayLower - The slider's currently-displayed lower value.
 * @param displayUpper - The slider's currently-displayed upper value.
 * @returns The bucket's tier.
 */
export function histogramBarTier(
	bucket: HistogramBucket,
	available: NumericBounds,
	displayLower: number,
	displayUpper: number,
): HistogramBarTier {
	const isWithinAvailable =
		bucket.bucketMax > available.min - TIER_BOUNDARY_EPSILON
		&& bucket.bucketMin < available.max + TIER_BOUNDARY_EPSILON;

	if (!isWithinAvailable) {
		return 'outside';
	}
	const isInSelection =
		bucket.bucketMax > displayLower - TIER_BOUNDARY_EPSILON
		&& bucket.bucketMin < displayUpper + TIER_BOUNDARY_EPSILON;

	return isInSelection ? 'selected' : 'available';
}

/**
 * The complete `class` attribute for one histogram bar.
 *
 * @remarks
 * The one call render code needs. {@link histogramBarTier} is the primitive underneath it — exported
 * because the classification is the part worth testing directly, and because a consumer may want the
 * tier without a class string — but every one of the six verticals renders through THIS function, so
 * the `fe-range-histogram__bar` BEM literals exist exactly once in the repo. A returned string works
 * unchanged as React's `className`, Vue's `:class`, Angular's `[class]`, Svelte's `class` and
 * vanilla's `element.className`.
 *
 * The `--empty` modifier is additive rather than a fourth tier: an empty bucket is a real datum
 * ("nothing here given your other filters"), so it stays visible, knocked back WITHIN whichever tier
 * it belongs to. `ui-styles` owns the resulting opacity pairs.
 *
 * @param bucket - The bucket.
 * @param available - The effective available zone (`available ?? baseline`).
 * @param displayLower - The slider's currently-displayed lower value.
 * @param displayUpper - The slider's currently-displayed upper value.
 * @returns The space-separated class list, base class first.
 */
export function histogramBarClassName(
	bucket: HistogramBucket,
	available: NumericBounds,
	displayLower: number,
	displayUpper: number,
): string {
	const tier = histogramBarTier(bucket, available, displayLower, displayUpper);
	const classes = ['fe-range-histogram__bar', `fe-range-histogram__bar--${tier}`];

	if (bucket.count === 0) {
		classes.push('fe-range-histogram__bar--empty');
	}

	return classes.join(' ');
}

/**
 * A bar's height as a percentage of the overlay's height.
 *
 * @remarks
 * **Two-tier minimum.** An EMPTY bucket clamps to 4% — a tiny visible nub
 * that keeps the bucket's position legible against the row baseline while reading unmistakably as
 * "nothing here". A populated one clamps to 18%, meaningfully taller, because at corpus scale a
 * single item maps to ~0% (1/150,000) and would otherwise be indistinguishable from empty.
 *
 * @param bucket - The bucket.
 * @returns Its height in percent, in `[4, 100]`.
 */
export function histogramBarHeightPercent(bucket: HistogramBucket): number {
	const minimumHeightPercent = bucket.count === 0 ? 4 : 18;

	return Math.max(bucket.heightFraction * 100, minimumHeightPercent);
}

/**
 * Bucket count for a dense, distribution-profile histogram.
 *
 * @remarks
 * By design the bars are `flex: 1 1 0%`, so bar width is `trackWidth / bucketCount`. On
 * the ~260px sidebar track, 84 buckets land each bar at ≈2px with the sheet's 1px gap — the fine
 * profile look, rather than a dozen fat columns.
 */
export const DENSE_BUCKET_COUNT = 84;

/**
 * How many buckets to request for one slider field's histogram.
 *
 * @remarks
 * **The comb problem this exists to avoid.** A field bucketed finer than its values are spaced
 * straddles them into a run of uneven-height bars — 21 integer wine `points` across 84 buckets is a
 * comb, not a distribution. So a field on a value grid gets at most one bucket per grid position.
 *
 * **`valueStep` is a property of the DATA, and is NOT the slider's `step`.** The two are different
 * numbers for most fields and confusing them is the whole trap here: real estate's `price` slider
 * steps by `10_000` because that is a comfortable drag granularity, while `priceUsd` is stored to the
 * dollar. Read the corpus, not the control — `bathrooms` is the case that punishes guessing, since it
 * generates as `Math.round(x * 2) / 2` and therefore lives on a **0.5** grid, so the "obvious"
 * integer answer of 11 buckets would pair every half-bath with a whole one.
 *
 * **Why capping at {@link DENSE_BUCKET_COUNT} is enough**, rather than searching for a divisor of the
 * grid: the comb is only legible when the bars are FAT. Real estate's `year-built` spans 126 years,
 * and 126 values across 84 buckets is formally uneven at 1.5 years per bucket — invisible at ≈2px per
 * bar. Unevenness reads as noise only when a handful of wide columns make each straddle obvious.
 *
 * For wine this yields `points` 21, `price` and `abv` 84, and one bucket per year for `vintage` —
 * the one-bucket-per-value rule that makes `points` legible, applied consistently.
 *
 * @param baseline - The field's baseline bounds, i.e. the extent the track spans. Bucket edges are
 *   aligned to this same range by the engine, so the bars line up with the thumbs.
 * @param valueStep - The grid the underlying values fall on: `1` for integers, `0.5` for half-steps,
 *   `0.1` for one decimal. Pass `0` for a genuinely continuous field, which always gets the dense
 *   count.
 * @returns The bucket count to put on the field's bundle query. Never below 1, so a degenerate
 *   single-value baseline still yields a renderable bar rather than an empty overlay.
 */
export function sliderBucketCount(baseline: NumericBounds, valueStep: number): number {
	if (valueStep <= 0) {
		return DENSE_BUCKET_COUNT;
	}
	const gridPositionCount = Math.round((baseline.max - baseline.min) / valueStep) + 1;

	return Math.max(1, Math.min(gridPositionCount, DENSE_BUCKET_COUNT));
}
