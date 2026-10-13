/**
 * Pure timing + statistics helpers for the live benchmark widget — deliberately free of React, the
 * DOM, and the engine so they can be unit-tested exhaustively (the numbers on screen are only as
 * trustworthy as this math).
 *
 * @remarks
 * The widget measures a workload many times and must decide two things from the raw samples: what
 * single number to show (a robust central tendency, not the mean — microbenchmarks are heavy-tailed),
 * and whether the measurement is stable enough to trust versus falling back to the committed
 * reference numbers. Both decisions live here as small, total functions.
 *
 * @packageDocumentation
 */

/** The verdict of {@link assessSamples}: show live numbers, or fall back to the reference bench. */
export type MeasurementMode = 'live' | 'reference';

/** Outcome of assessing a batch of raw per-pass timings. */
export interface SampleAssessment {
	/** Robust central estimate (median of the post-warmup samples), in ms. */
	readonly medianMs: number;
	/** Whether the batch is stable enough to display as a live measurement. */
	readonly mode: MeasurementMode;
	/** Relative dispersion (MAD / median) — exposed for display/debugging. */
	readonly relativeSpread: number;
}

/** Tuning for {@link assessSamples}. */
export interface AssessOptions {
	/** Discard this many leading samples as warmup (JIT + lazy index builds). Defaults to 2. */
	readonly warmupDiscard?: number;
	/** Minimum post-warmup samples required to trust a live reading. Defaults to 3. */
	readonly minSamples?: number;
	/** Max relative spread (MAD/median) still considered reliable. Defaults to 0.5. */
	readonly maxRelativeSpread?: number;
}

/**
 * Median of a list of numbers. Returns `0` for an empty list.
 *
 * @param values - The numbers (order-independent; a copy is sorted internally).
 */
export function median(values: readonly number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	// Take the middle SLICE — one element for an odd count, two for an even one — and average it.
	// Indexing directly would need `?? 0` fallbacks under `noUncheckedIndexedAccess` that are
	// unreachable (the empty case returned above, so `mid` is always in range) yet still count against
	// branch coverage. A slice carries the same intent with nothing to fall back from.
	const middle = sorted.length % 2 === 1 ? sorted.slice(mid, mid + 1) : sorted.slice(mid - 1, mid + 1);

	return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}

/**
 * Median absolute deviation from the median — a robust, outlier-resistant spread estimator.
 *
 * @param values - The samples.
 * @param center - Precomputed median (pass it to avoid recomputing).
 */
export function medianAbsoluteDeviation(values: readonly number[], center: number): number {
	if (values.length === 0) {
		return 0;
	}

	return median(values.map((value) => Math.abs(value - center)));
}

/**
 * Assess a batch of per-pass timings: drop warmup, compute a robust median + spread, and decide
 * whether the reading is stable enough to show live.
 *
 * @param samples - Raw per-pass durations in ms, in measurement order.
 * @param options - Warmup / minimum-sample / spread thresholds.
 * @returns The median, the live/reference verdict, and the relative spread.
 */
export function assessSamples(samples: readonly number[], options: AssessOptions = {}): SampleAssessment {
	const { maxRelativeSpread = 0.5, minSamples = 3, warmupDiscard = 2 } = options;
	const usable = samples.slice(warmupDiscard).filter((value) => Number.isFinite(value) && value >= 0);
	const medianMs = median(usable);

	if (usable.length < minSamples || medianMs <= 0) {
		// Too few samples or a degenerate/zero timer (coarse clock) — don't trust it.
		const spreadWhenUnusable = medianMs <= 0 ? Number.POSITIVE_INFINITY : 0;

		return { medianMs, mode: 'reference', relativeSpread: spreadWhenUnusable };
	}
	const relativeSpread = medianAbsoluteDeviation(usable, medianMs) / medianMs;
	const mode: MeasurementMode = relativeSpread <= maxRelativeSpread ? 'live' : 'reference';

	return { medianMs, mode, relativeSpread };
}

/**
 * Speedup of `currentMs` relative to `baselineMs` (how many times faster). Guards against a
 * zero/negative current reading (returns `1`, i.e. "no speedup shown" rather than infinity).
 *
 * @param baselineMs - The naive baseline duration.
 * @param currentMs - The current configuration's duration.
 */
export function computeSpeedup(baselineMs: number, currentMs: number): number {
	if (currentMs <= 0 || baselineMs <= 0) {
		return 1;
	}

	return baselineMs / currentMs;
}

/**
 * Format a duration in ms for display, with resolution that scales to the magnitude:
 * sub-millisecond → 3 decimals; under 10 ms → 2; otherwise → 1.
 *
 * @param ms - The duration in milliseconds.
 */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) {
		return '—';
	}
	if (ms < 1) {
		return `${ms.toFixed(3)} ms`;
	}
	if (ms < 10) {
		return `${ms.toFixed(2)} ms`;
	}

	return `${ms.toFixed(1)} ms`;
}

/**
 * Format a speedup multiplier: under 10× → one decimal (`3.4×`); otherwise whole (`334×`).
 *
 * @param factor - The multiplier from {@link computeSpeedup}.
 */
export function formatSpeedup(factor: number): string {
	if (!Number.isFinite(factor) || factor <= 0) {
		return '—';
	}
	if (factor < 10) {
		return `${factor.toFixed(1)}×`;
	}

	return `${Math.round(factor)}×`;
}

/**
 * Map a duration to a 0–100 bar width on a log scale (a linear axis would render the fast bars
 * invisible). Clamps to `[floorMs, ceilMs]`.
 *
 * @param ms - The duration to plot.
 * @param floorMs - Low end of the axis (defaults to 0.05 ms).
 * @param ceilMs - High end of the axis (defaults to 40 ms).
 * @returns A percentage in `[0, 100]`.
 */
export function logBarWidthPercent(ms: number, floorMs = 0.05, ceilMs = 40): number {
	if (!Number.isFinite(ms) || ms <= 0) {
		return 0;
	}
	const clamped = Math.min(Math.max(ms, floorMs), ceilMs);
	const fraction = (Math.log10(clamped) - Math.log10(floorMs)) / (Math.log10(ceilMs) - Math.log10(floorMs));

	return Math.min(Math.max(fraction * 100, 0), 100);
}
