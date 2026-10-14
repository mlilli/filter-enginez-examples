/**
 * Committed reference benchmark numbers — the honest fallback the live widget shows when the
 * browser's own timing is too noisy to trust (throttled tab, coarse timer, busy CPU).
 *
 * @remarks
 * These are the `simulate-per-option` cells at the 10k tier, measured with the engine repository's
 * tinybench harness (`benchmarks/`, run with `--tiers=10k --scenarios=simulate-per-option`) on
 * 2026-10-13, over the 10,000-wine default tier of the realistic synthetic generator. That scenario
 * sweeps all three toggles the widget exposes — bitmap × exclusion-graph × memoization — so the eight
 * cells map one-to-one onto the widget's eight reachable configurations. The all-off cell (≈38.5 ms)
 * is the naive baseline; the all-on cell (≈0.092 ms) is the fully-stacked result, a ~418× span. If
 * the harness is re-run, refresh these from its output.
 *
 * @packageDocumentation
 */

/** The three acceleration layers the widget toggles, as booleans. */
export interface BenchmarkConfig {
	/** Roaring-Bitmap intersection (`bitmap: 'on' | 'off'`). */
	readonly bitmap: boolean;
	/** Mutual-exclusion-graph short-circuit (`exclusionGraph: 'lazy' | 'off'`). */
	readonly exclusionGraph: boolean;
	/** LRU memoization of `simulate()` (`simulationCache: true | false`). */
	readonly memoization: boolean;
}

/**
 * Every key {@link configKey} can produce — three booleans, so exactly eight.
 *
 * @remarks
 * Spelled out as a union rather than `string` so {@link REFERENCE_MS_BY_CONFIG} is a TOTAL map. That
 * turns a missing cell into a compile error instead of a silent `??` fallback to the naive baseline,
 * which would render a plausible-looking bar carrying the wrong number.
 */
export type BenchmarkConfigKey =
	| '000' | '001' | '010' | '011'
	| '100' | '101' | '110' | '111';

/** Stable string key for a config — used to index the reference table and the measured-value cache. */
export function configKey(config: BenchmarkConfig): BenchmarkConfigKey {
	const bitmap = config.bitmap ? '1' : '0';
	const exclusionGraph = config.exclusionGraph ? '1' : '0';
	const memoization = config.memoization ? '1' : '0';

	return `${bitmap}${exclusionGraph}${memoization}`;
}

/**
 * `simulate-per-option` @ 10k wines — mean ms per full facet sweep, per configuration.
 * Keyed by {@link configKey} (`bitmap · exclusionGraph · memoization`).
 */
export const REFERENCE_MS_BY_CONFIG: Readonly<Record<BenchmarkConfigKey, number>> = {
	'000': 38.4699, // bitmap:off · exclGraph:off · simCache:off — fully naive
	'001': 0.093, // bitmap:off · exclGraph:off · simCache:on
	'010': 39.3831, // bitmap:off · exclGraph:lazy · simCache:off
	'011': 0.0941, // bitmap:off · exclGraph:lazy · simCache:on
	100: 16.6045, // bitmap:on · exclGraph:off · simCache:off
	101: 0.0927, // bitmap:on · exclGraph:off · simCache:on
	110: 16.52, // bitmap:on · exclGraph:lazy · simCache:off
	111: 0.092, // bitmap:on · exclGraph:lazy · simCache:on — fully stacked
};

/** The naive baseline (all layers off) — the always-parked reference bar. */
export const NAIVE_BASELINE_MS = REFERENCE_MS_BY_CONFIG['000'];

/** Corpus size the reference numbers were measured against. */
export const REFERENCE_CORPUS_SIZE = 10_000;

/** Human label for the reference provenance (no fabricated machine specs — just the honest source). */
export const REFERENCE_LABEL = 'reference bench · 10k wines · 2026-10-13';

/** Look up the reference mean-ms for a configuration. */
export function referenceMsFor(config: BenchmarkConfig): number {
	return REFERENCE_MS_BY_CONFIG[configKey(config)];
}
