/**
 * The live benchmark's bitmap configurations run on the bitmap path once bitmaps are initialized, and
 * a failed init is reported rather than measured.
 *
 * @remarks
 * Against the real engine and the real `roaring-wasm`. The engine engages its Roaring-bitmap index
 * only after `initializeBitmapAcceleration()` has resolved, and its init is a process-wide singleton,
 * so the order of these cases is the point: the first measures a bitmap configuration BEFORE init and
 * must see the predicate path (which is what a widget that never initialized would have timed under
 * the bitmap label), the next initializes through {@link prepareBitmapAcceleration}, and the rest see
 * the bitmap path engage. Vitest runs the cases of one file in order, and each file in a fresh module
 * graph, so no other suite's init leaks in.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { FilterEngineError, FilterEngineModeError, isBitmapAccelerationReady } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { BITMAP_UNAVAILABLE_COPY, bitmapUnavailableStatus } from './benchmarkBitmapCopy.js';
import { bitmapInitFailureReason, measureConfig, prepareBitmapAcceleration } from './benchmarkWorkload.js';
import { type BenchmarkConfig, REFERENCE_LABEL } from './referenceResults.js';

/** A small corpus: enough for the standing rules and the facet sweep. */
const corpus: readonly Wine[] = Array.from({ length: 60 }, (_unused, index) => ({
	color: index % 2 === 0 ? 'red' : 'white',
	points: 80 + (index % 20),
	varietal: `varietal-${index % 12}`,
}) as unknown as Wine);

/** Bitmaps alone. */
const BITMAP_ONLY: BenchmarkConfig = { bitmap: true, exclusionGraph: false, memoization: false };

/** Every layer on, the widget's opening configuration. */
const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

/** One timed pass, no warmup: the path is the subject here, not the timing. */
const ONE_PASS = { timedPasses: 1, warmupPasses: 0 } as const;

describe('the benchmark’s bitmap path, before and after init', () => {
	it('runs a bitmap configuration on the predicate path while bitmaps are not initialized', async () => {
		expect(isBitmapAccelerationReady(), 'another case initialized bitmaps first; this one must run before init').toBe(false);
		expect((await measureConfig(corpus, BITMAP_ONLY, ONE_PASS)).path).toBe('predicate');
	});

	it('initializes bitmaps and reports them ready', async () => {
		await expect(prepareBitmapAcceleration()).resolves.toEqual({ status: 'ready' });
		expect(isBitmapAccelerationReady()).toBe(true);
	});

	it.each([
		['bitmaps alone', BITMAP_ONLY],
		['every layer', ALL_ON],
	])('then runs %s on the bitmap path', async (_label, config) => {
		expect((await measureConfig(corpus, config, ONE_PASS)).path).toBe('bitmap');
	});

	it('keeps a configuration with bitmaps off on the predicate path', async () => {
		expect((await measureConfig(corpus, { ...ALL_ON, bitmap: false }, ONE_PASS)).path).toBe('predicate');
	});

	it('returns the same results on either path', async () => {
		const bitmap = await measureConfig(corpus, BITMAP_ONLY, ONE_PASS);
		const predicate = await measureConfig(corpus, { ...BITMAP_ONLY, bitmap: false }, ONE_PASS);

		expect(bitmap.resultCount).toBe(predicate.resultCount);
	});
});

describe('prepareBitmapAcceleration, when init fails', () => {
	it('reports a missing peer, without rejecting', async () => {
		const missing = new FilterEngineModeError('MODE_ACCELERATION_PEER_MISSING', 'install roaring-wasm');

		await expect(prepareBitmapAcceleration(async () => Promise.reject(missing))).resolves.toEqual({ reason: 'peer-missing', status: 'unavailable' });
	});

	it('reports any other failure as a failed load, without rejecting', async () => {
		const failed = new FilterEngineError('ACCELERATION_INIT_FAILED', 'the WebAssembly did not compile');

		await expect(prepareBitmapAcceleration(async () => Promise.reject(failed))).resolves.toEqual({ reason: 'init-failed', status: 'unavailable' });
	});
});

describe('bitmapInitFailureReason', () => {
	it('reads MODE_ACCELERATION_PEER_MISSING as a missing peer, and every other error as a failed load', () => {
		expect(bitmapInitFailureReason(new FilterEngineModeError('MODE_ACCELERATION_PEER_MISSING', 'x'))).toBe('peer-missing');
		expect(bitmapInitFailureReason(new FilterEngineModeError('MODE_ACCELERATION_NOT_READY', 'x'))).toBe('init-failed');
		expect(bitmapInitFailureReason(new FilterEngineError('ACCELERATION_INIT_FAILED', 'x'))).toBe('init-failed');
		expect(bitmapInitFailureReason(new Error('chunk gone'))).toBe('init-failed');
	});
});

describe('bitmapUnavailableStatus', () => {
	it.each(Object.keys(BITMAP_UNAVAILABLE_COPY) as (keyof typeof BITMAP_UNAVAILABLE_COPY)[])('says why (%s) and where the number comes from', (reason) => {
		expect(bitmapUnavailableStatus(reason)).toBe(`${BITMAP_UNAVAILABLE_COPY[reason]} · showing ${REFERENCE_LABEL}`);
	});
});
