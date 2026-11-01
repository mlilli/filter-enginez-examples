/**
 * The live workload behind the benchmark widget — a faithful in-browser replica of the
 * `simulate-per-option` benchmark scenario, run against the 10k wine corpus with the acceleration
 * layers toggled on and off.
 *
 * @remarks
 * Mirrors `benchmarks/src/scenarios/simulate-per-option.bench.ts` exactly (same standing rules, same
 * facet sweep, same `engine.simulate(...).resultCount` inner loop) so the numbers the user measures
 * here are directly comparable to the committed reference bench. Each configuration builds a FRESH
 * engine — acceleration is a construction-time choice — then times the full facet sweep several
 * times; the caller feeds those raw samples to the pure `assessSamples` for a robust median + a
 * live-vs-reference verdict.
 *
 * The corpus is loaded via dynamic `import()` so the ~10k-record JSON never weighs down the
 * how-it-works page's initial bundle — the widget shows reference numbers until the corpus resolves, then upgrades
 * to live. Browser-only (uses `performance.now`), and it lives in the browser-only examples package.
 *
 * **Bitmaps are initialized before they are measured.** The engine engages its Roaring-bitmap path
 * only once `initializeBitmapAcceleration()` has resolved; until then `bitmap: 'on'` runs the
 * per-record predicates, with the same results. {@link prepareBitmapAcceleration} awaits that init
 * (fetching `roaring-wasm` and compiling its WebAssembly, on demand) and reports whether it worked,
 * and every {@link measureConfig} result names the path its engine actually ran on, so the widget
 * never presents a predicate timing as a bitmap one.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { type AccelerationOptions, createFilterEngine, FilterEngineModeError, initializeBitmapAcceleration, inSet, range } from '@filter-enginez/core';

import type { BitmapAvailability, BitmapUnavailableReason } from './benchmarkBitmapCopy.js';

import { type BenchmarkConfig } from './referenceResults.js';

/** How many distinct facet options to sweep per pass — matches the reference scenario's cap. */
const OPTION_CAP = 40;

/** Default warmup passes discarded (JIT + lazy bitmap/index builds) before timing. */
export const DEFAULT_WARMUP_PASSES = 2;

/** Default number of timed passes for an interactive toggle flip. */
export const DEFAULT_TIMED_PASSES = 7;

/** A heavier, more stable run for the explicit "run 20 passes" affordance. */
export const HEAVY_TIMED_PASSES = 20;

/**
 * Which evaluation path a measured engine ran on: `'bitmap'` when its Roaring-bitmap index was engaged
 * and built bitmaps for the standing rules, `'predicate'` when every filter ran per record.
 */
export type EvaluationPath = 'bitmap' | 'predicate';

/** Raw output of a measurement: per-pass durations (ms) plus the constant result count. */
export interface WorkloadSamples {
	/** The path the engine ran the sweep on. A bitmap configuration measured before init reads `'predicate'`. */
	readonly path: EvaluationPath;
	/** The filtered result count under the two standing rules — constant across every config. */
	readonly resultCount: number;
	/** Per-pass sweep durations in ms, in measurement order (includes warmup passes at the front). */
	readonly samples: readonly number[];
}

/** Options for {@link measureConfig}. */
export interface MeasureOptions {
	/** Timed passes to record after warmup. Defaults to {@link DEFAULT_TIMED_PASSES}. */
	readonly timedPasses?: number;
	/** Warmup passes to record (and later discard). Defaults to {@link DEFAULT_WARMUP_PASSES}. */
	readonly warmupPasses?: number;
}

/** Translate the widget's three booleans into the engine's acceleration option object. */
export function toAcceleration(config: BenchmarkConfig): AccelerationOptions {
	return {
		bitmap: config.bitmap ? 'on' : 'off',
		exclusionGraph: config.exclusionGraph ? 'lazy' : 'off',
		// Geo / text axes are irrelevant to this scenario; pin them off so the A/B is purely the
		// three layers the widget exposes.
		simulationCache: config.memoization,
		spatialIndex: 'off',
		textIndex: 'off',
	};
}

/**
 * Why `initializeBitmapAcceleration()` rejected, as the widget words it.
 *
 * @param error - The rejection.
 * @returns `'peer-missing'` for `MODE_ACCELERATION_PEER_MISSING` (the optional peer is not in the
 *   build), `'init-failed'` for anything else (`ACCELERATION_INIT_FAILED`: the library or its
 *   WebAssembly did not load).
 */
export function bitmapInitFailureReason(error: unknown): Exclude<BitmapUnavailableReason, 'not-engaged'> {
	return error instanceof FilterEngineModeError && error.code === 'MODE_ACCELERATION_PEER_MISSING' ? 'peer-missing' : 'init-failed';
}

/**
 * Initialize bitmap acceleration, once, and report whether the bitmap path is available.
 *
 * @remarks
 * Never rejects: a failed init leaves the configurations without bitmaps measurable, so the widget
 * keeps measuring those live and shows the reason for the rest. The engine's init is idempotent and a
 * failure is final, so calling this again returns the same answer.
 *
 * @param initialize - Stands in for the engine's `initializeBitmapAcceleration()`, which runs when it
 *   is omitted; tests pass one that rejects.
 * @returns `{ status: 'ready' }`, or `{ status: 'unavailable', reason }`.
 */
export async function prepareBitmapAcceleration(initialize?: () => Promise<void>): Promise<BitmapAvailability> {
	try {
		await (initialize === undefined ? initializeBitmapAcceleration() : initialize());

		return { status: 'ready' };
	} catch (error: unknown) {
		return { reason: bitmapInitFailureReason(error), status: 'unavailable' };
	}
}

/**
 * Lazily load the 10,000-wine default tier. Isolated so the generator is a separate async chunk.
 */
export async function loadWineCorpus(): Promise<readonly Wine[]> {
	const module = await import('@filter-enginez/mock-data/wine');

	return module.wines;
}

/**
 * Build a fresh engine for `config` and time the facet sweep `warmup + timed` times.
 *
 * @param corpus - The wine records to filter.
 * @param config - Which acceleration layers to enable.
 * @param options - Warmup / timed pass counts.
 * @returns The raw per-pass samples and the constant result count.
 */
export async function measureConfig(
	corpus: readonly Wine[],
	config: BenchmarkConfig,
	options: MeasureOptions = {},
): Promise<WorkloadSamples> {
	const { timedPasses = DEFAULT_TIMED_PASSES, warmupPasses = DEFAULT_WARMUP_PASSES } = options;
	const engine = createFilterEngine<Wine>({ acceleration: toAcceleration(config), sourceData: corpus });

	// The two standing rules — something for the intersection + exclusion graph to work against.
	engine.addRule('color', inSet('color', ['red']));
	engine.addRule('points', range('points', { max: 100, min: 88 }));

	// The facet swept every pass: distinct varietals, capped to a realistic panel size.
	const facetOptions = Array.from(new Set(corpus.map((wine) => wine.varietal))).slice(0, OPTION_CAP);
	const resultCount = engine.getResultCount();

	const runSweep = (): number => {
		let total = 0;

		for (const option of facetOptions) {
			total += engine.simulate({ withRule: ['varietal-sim', inSet('varietal', [option])]}).resultCount;
		}

		return total;
	};

	const samples: number[] = [];

	for (let pass = 0; pass < warmupPasses + timedPasses; pass += 1) {
		const start = performance.now();

		runSweep();
		samples.push(performance.now() - start);
	}

	// Read before `destroy()`, which drops the cached bitmaps. An engaged index has built one bitmap per
	// standing rule by now; a predicate-path engine has built none.
	const path: EvaluationPath = engine.bitmapIndex.isReady && engine.bitmapIndex.cachedBitmapCount > 0 ? 'bitmap' : 'predicate';

	await engine.destroy();

	return { path, resultCount, samples };
}
