/**
 * Tests for the live benchmark workload behind the how-it-works page's widget.
 *
 * @remarks
 * A synthetic corpus is used rather than the real 10k wine records: `measureConfig` takes the corpus
 * as a parameter precisely so it is not welded to the dataset, and a 60-record fixture exercises every
 * branch in milliseconds instead of seconds. `loadWineCorpus` is tested separately, since loading the
 * real corpus is its only job.
 *
 * **The assertion that matters is the invariant, not the timings.** The widget's entire claim is that
 * toggling an acceleration layer changes only HOW LONG the same work takes. If two configurations
 * produced different result counts they would be doing different work, and every number on the page
 * would be comparing apples to oranges while looking perfectly plausible. Durations themselves are
 * deliberately NOT asserted — they are machine- and load-dependent, and a test that expected bitmap-on
 * to beat bitmap-off would be flaky by construction and would teach nothing when it failed.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_TIMED_PASSES,
	DEFAULT_WARMUP_PASSES,
	HEAVY_TIMED_PASSES,
	loadWineCorpus,
	measureConfig,
	toAcceleration,
} from './benchmarkWorkload.js';
import { type BenchmarkConfig } from './referenceResults.js';

/** A corpus big enough to exercise the facet sweep and the standing rules, small enough to be fast. */
const corpus: readonly Wine[] = Array.from({ length: 60 }, (_unused, index) => ({
	color: index % 2 === 0 ? 'red' : 'white',
	points: 80 + (index % 20),
	varietal: `varietal-${index % 12}`,
}) as unknown as Wine);

/** Every layer off — the baseline configuration. */
const allOff: BenchmarkConfig = { bitmap: false, exclusionGraph: false, memoization: false };

describe('toAcceleration', () => {
	it('maps the widget booleans onto the engine option object', () => {
		expect(toAcceleration({ bitmap: true, exclusionGraph: true, memoization: true })).toMatchObject({
			bitmap: 'on',
			exclusionGraph: 'lazy',
			simulationCache: true,
		});
	});

	it('maps both booleans off', () => {
		expect(toAcceleration(allOff)).toMatchObject({ bitmap: 'off', exclusionGraph: 'off', simulationCache: false });
	});

	it('passes memoization through as a boolean rather than a string enum', () => {
		// The odd one out: `bitmap` and `exclusionGraph` map onto string enums ('on'/'off',
		// 'lazy'/'off'), but `simulationCache` really is `true | false`. Mapping it to a string here
		// would be silently truthy in BOTH directions — 'off' is a non-empty string — so the widget's
		// memoization toggle would appear to work while the layer stayed permanently on.
		expect(toAcceleration({ ...allOff, memoization: true }).simulationCache).toBe(true);
		expect(toAcceleration({ ...allOff, memoization: false }).simulationCache).toBe(false);
	});

	it('pins the geo and text axes OFF regardless of the widget state', () => {
		// This scenario touches neither, so leaving them enabled would let an unrelated index's build
		// cost land in the measurement and be attributed to the three layers the widget names.
		for (const config of [allOff, { bitmap: true, exclusionGraph: true, memoization: true }]) {
			expect(toAcceleration(config)).toMatchObject({ spatialIndex: 'off', textIndex: 'off' });
		}
	});
});

describe('pass-count constants', () => {
	it('records more warmup-excluded passes for the heavy run than the interactive one', () => {
		// The heavy affordance exists to be MORE stable. If it were not larger, the button would
		// promise a better measurement and deliver the same one.
		expect(HEAVY_TIMED_PASSES).toBeGreaterThan(DEFAULT_TIMED_PASSES);
		expect(DEFAULT_WARMUP_PASSES).toBeGreaterThan(0);
	});
});

describe('measureConfig', () => {
	it('records warmup + timed passes, in that order, as one sample list', async () => {
		// The caller discards the leading warmup samples, so the COUNT and the ordering are the
		// contract. Returning only the timed passes would make the consumer drop real measurements.
		const result = await measureConfig(corpus, allOff);

		expect(result.samples).toHaveLength(DEFAULT_WARMUP_PASSES + DEFAULT_TIMED_PASSES);
	});

	it('honors explicit pass counts', async () => {
		const result = await measureConfig(corpus, allOff, { timedPasses: 3, warmupPasses: 1 });

		expect(result.samples).toHaveLength(4);
	});

	it('supports zero warmup', async () => {
		const result = await measureConfig(corpus, allOff, { timedPasses: 2, warmupPasses: 0 });

		expect(result.samples).toHaveLength(2);
	});

	it('produces a non-negative duration for every pass', async () => {
		const result = await measureConfig(corpus, allOff, { timedPasses: 2, warmupPasses: 0 });

		expect(result.samples.every((ms) => ms >= 0)).toBe(true);
	});

	it('reports the count under the two standing rules, not the whole corpus', async () => {
		// red AND points in [88, 100] — 30 reds, of which the ones whose points land in range.
		const expected = corpus.filter((wine) => {
			const row = wine as unknown as { color: string; points: number };

			return row.color === 'red' && row.points >= 88 && row.points <= 100;
		}).length;
		const result = await measureConfig(corpus, allOff, { timedPasses: 1, warmupPasses: 0 });

		expect(result.resultCount).toBe(expected);
		expect(result.resultCount).toBeLessThan(corpus.length);
	});

	it.each([
		['bitmap only', { bitmap: true, exclusionGraph: false, memoization: false }],
		['exclusion graph only', { bitmap: false, exclusionGraph: true, memoization: false }],
		['memoization only', { bitmap: false, exclusionGraph: false, memoization: true }],
		['everything on', { bitmap: true, exclusionGraph: true, memoization: true }],
	])('yields the SAME result count with %s as with everything off', async (_label, config) => {
		// The invariant the whole widget rests on: acceleration changes how long the work takes, never
		// what the work returns. If these diverged, the A/B would be timing two different computations
		// and every speedup on the page would be meaningless — while looking entirely credible.
		const baseline = await measureConfig(corpus, allOff, { timedPasses: 1, warmupPasses: 0 });
		const accelerated = await measureConfig(corpus, config, { timedPasses: 1, warmupPasses: 0 });

		expect(accelerated.resultCount).toBe(baseline.resultCount);
	});

	it('handles a corpus with fewer distinct facet values than the sweep cap', async () => {
		// The `slice(0, OPTION_CAP)` upper bound. A tiny corpus must sweep what it has rather than
		// producing an empty sweep that times nothing and reports suspiciously fast numbers.
		const tiny = corpus.slice(0, 4);
		const result = await measureConfig(tiny, allOff, { timedPasses: 1, warmupPasses: 0 });

		expect(result.samples).toHaveLength(1);
		expect(result.resultCount).toBeGreaterThanOrEqual(0);
	});
});

describe('loadWineCorpus', () => {
	it('resolves the bundled wine corpus', async () => {
		// Dynamic import so the ~10k-record JSON is a separate chunk and the how-it-works page's
		// initial bundle stays light. Worth asserting it actually resolves records: a wrong specifier would
		// leave the widget permanently showing reference numbers with no error.
		const wines = await loadWineCorpus();

		expect(wines.length).toBeGreaterThan(0);
		expect(wines[0]).toHaveProperty('varietal');
	});
});
