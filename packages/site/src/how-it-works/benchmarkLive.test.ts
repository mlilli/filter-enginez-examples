/**
 * Tests for `benchmarkLive.ts` — when the live benchmark fetches its engine, fetching it once, and
 * where its bar ends.
 *
 * @remarks
 * jsdom has no `IntersectionObserver`, which exercises {@link whenNearViewport}'s no-observer path; the
 * observer path is driven with a fake that records its options and delivers entries on demand. The
 * loader is given a fake engine module, so nothing here loads the engine or the corpus.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as BenchmarkEngine from './benchmarkEngine.js';

import { createLiveBenchmarkLoader, LIVE_LOAD_MARGIN, liveBarStyle, whenNearViewport } from './benchmarkLive.js';

/** A controllable `IntersectionObserver` stand-in. */
interface FakeObserver {
	/** The options it was constructed with. */
	readonly options: IntersectionObserverInit | undefined;
	/** The elements observed so far. */
	readonly observed: Element[];
	/** Deliver entries, each intersecting or not, to the callback. */
	readonly emit: (...isIntersecting: boolean[]) => void;
	/** How many times `disconnect` was called. */
	disconnectCount: number;
}

/**
 * Install a fake `IntersectionObserver` global.
 *
 * @returns Every observer constructed while installed, in order.
 */
function installObserver(): FakeObserver[] {
	const observers: FakeObserver[] = [];

	vi.stubGlobal(
		'IntersectionObserver',
		class {
			/** This instance's record. */
			private readonly _record: FakeObserver;

			/**
			 * @param callback - The observer callback.
			 * @param options - The observer options.
			 */
			public constructor(callback: (entries: IntersectionObserverEntry[]) => void, options?: IntersectionObserverInit) {
				const record: FakeObserver = {
					disconnectCount: 0,
					emit: (...isIntersecting) => {
						callback(isIntersecting.map((value) => ({ isIntersecting: value }) as IntersectionObserverEntry));
					},
					observed: [],
					options,
				};

				this._record = record;
				observers.push(record);
			}

			/**
			 * Record a target.
			 *
			 * @param element - The target.
			 */
			public observe(element: Element): void {
				this._record.observed.push(element);
			}

			/** Count a disconnect. */
			public disconnect(): void {
				this._record.disconnectCount += 1;
			}
		},
	);

	return observers;
}

/**
 * A stand-in for the engine module, with a recognizable corpus.
 *
 * @param corpusLength - How many (empty) records its corpus holds.
 * @returns The module.
 */
function fakeEngine(corpusLength = 3): typeof BenchmarkEngine {
	return {
		loadWineCorpus: vi.fn<typeof BenchmarkEngine.loadWineCorpus>(async () => {
			await Promise.resolve();

			return Array.from({ length: corpusLength }, () => ({}) as Wine);
		}),
		measureConfig: vi.fn(),
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('whenNearViewport', () => {
	it('runs at once where there is no IntersectionObserver, and its teardown is harmless', () => {
		const onNear = vi.fn();
		const stop = whenNearViewport(document.createElement('div'), onNear);

		expect(onNear).toHaveBeenCalledTimes(1);
		expect(() => {
			stop();
			stop();
		}).not.toThrow();
	});

	it('watches the element with a viewport-high margin below, and waits for it', () => {
		const observers = installObserver();
		const element = document.createElement('div');
		const onNear = vi.fn();

		whenNearViewport(element, onNear);

		expect(observers).toHaveLength(1);
		expect(observers[0]?.observed).toEqual([element]);
		expect(observers[0]?.options).toEqual({ rootMargin: LIVE_LOAD_MARGIN });
		expect(LIVE_LOAD_MARGIN).toBe('0px 0px 100% 0px');
		expect(onNear).not.toHaveBeenCalled();
	});

	it('ignores entries that do not intersect, then runs once and stops watching', () => {
		const observers = installObserver();
		const onNear = vi.fn();

		whenNearViewport(document.createElement('div'), onNear);
		observers[0]?.emit(false);
		expect(onNear).not.toHaveBeenCalled();

		observers[0]?.emit(false, true);
		expect(onNear).toHaveBeenCalledTimes(1);
		expect(observers[0]?.disconnectCount).toBe(1);
	});

	it('disconnects on teardown, before anything intersected', () => {
		const observers = installObserver();
		const onNear = vi.fn();
		const stop = whenNearViewport(document.createElement('div'), onNear);

		stop();

		expect(observers[0]?.disconnectCount).toBe(1);
		expect(onNear).not.toHaveBeenCalled();
	});
});

describe('createLiveBenchmarkLoader', () => {
	it('imports the engine, then loads the corpus, and hands back both', async () => {
		const engine = fakeEngine(3);
		const load = createLiveBenchmarkLoader(async () => {
			await Promise.resolve();

			return engine;
		});

		const live = await load();

		expect(live.corpus).toHaveLength(3);
		expect(live.measureConfig).toBe(engine.measureConfig);
	});

	it('fetches once, however many callers ask, during the fetch and after it', async () => {
		const engine = fakeEngine();
		const importEngine = vi.fn(async () => {
			await Promise.resolve();

			return engine;
		});
		const load = createLiveBenchmarkLoader(importEngine);

		const [first, second] = await Promise.all([load(), load()]);
		const third = await load();

		expect(importEngine).toHaveBeenCalledTimes(1);
		expect(engine.loadWineCorpus).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	it('forgets a failed fetch, so the next call tries again', async () => {
		const engine = fakeEngine();
		const importEngine = vi
			.fn<() => Promise<typeof BenchmarkEngine>>()
			.mockRejectedValueOnce(new Error('chunk gone'))
			.mockResolvedValue(engine);
		const load = createLiveBenchmarkLoader(importEngine);

		await expect(load()).rejects.toThrow('chunk gone');
		await expect(load()).resolves.toMatchObject({ measureConfig: engine.measureConfig });
		expect(importEngine).toHaveBeenCalledTimes(2);
	});

	it('forgets a failed corpus load too', async () => {
		const engine = fakeEngine();

		vi.mocked(engine.loadWineCorpus).mockRejectedValueOnce(new Error('corpus gone'));

		const load = createLiveBenchmarkLoader(async () => {
			await Promise.resolve();

			return engine;
		});

		await expect(load()).rejects.toThrow('corpus gone');
		await expect(load()).resolves.toMatchObject({ corpus: expect.any(Array) as unknown });
	});
});

describe('liveBarStyle', () => {
	it.each([
		[0, 'translateX(-100%)'],
		[9.25, 'translateX(-90.75%)'],
		[100, 'translateX(0%)'],
	])('ends the bar at %s%% of its track: %s', (widthPercent, transform) => {
		expect(liveBarStyle(widthPercent).transform).toBe(transform);
	});

	it.each([0, 9.25, 37.5, 100])('puts the bar’s right end where a bar %s%% wide would end, on any track', (widthPercent) => {
		// The bar is as wide as its track, so a translateX percentage is a percentage of the track: its
		// right end lands at 100% + the offset, which must be the width a width-based bar would have had.
		for (const trackPx of [120, 333, 640]) {
			const offsetPercent = Number(/^translateX\((-?[\d.]+)%\)$/u.exec(liveBarStyle(widthPercent).transform)?.[1]);
			const rightEndPx = trackPx + (trackPx * offsetPercent) / 100;

			expect(rightEndPx).toBeCloseTo((trackPx * widthPercent) / 100, 9);
		}
	});

	it('hides an empty bar, whose glow would otherwise show at the track’s edge, and shows any other', () => {
		expect(liveBarStyle(0).opacity).toBe('0');
		expect(liveBarStyle(0.01).opacity).toBe('1');
		expect(liveBarStyle(100).opacity).toBe('1');
	});
});
