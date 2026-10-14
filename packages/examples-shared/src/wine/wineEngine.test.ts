/**
 * Tests for the wine engine boot + its progress pub/sub.
 *
 * @remarks
 * Two module-level singletons make this file's shape unusual: `cachedBoot` memoizes the boot, and
 * `currentProgress` / `progressListeners` back a `useSyncExternalStore` bridge. Anything touching
 * either has to re-import through `vi.resetModules()`, or one test's boot leaks into the next.
 *
 * **The real worker is not exercised here.** `spawnAsyncEngine` constructs a real `Worker` over a
 * Comlink channel, and jsdom has no worker implementation. The tests below pin the size-aware
 * DECISION and, with `wrapInWorker` stubbed, everything in the async boot around that one call. The
 * six e2e verticals drive the real worker against the real corpus.
 */

import { wines as defaultTierWines } from '@filter-enginez/mock-data/wine';
import { FULL_WINE_TIER_SIZE } from '@filter-enginez/mock-data/wine/generator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as WineEngine from './wineEngine.js';

import { describeWineCorpusTier } from './wineCorpusTier.js';

/** The module's public surface, as returned by a fresh import. */
type WineEngineModule = typeof WineEngine;

/** The worker's progress callback, as `bootWineAsyncEngine` hands it over in `factoryCallbacks`. */
type ProgressReporter = (
	loaded: number,
	total: number,
	source: WineEngine.WineBootProgress['source'],
	isTotalEstimated: boolean,
) => void;

/**
 * Import a FRESH copy of the module so `cachedBoot` and the progress singleton reset.
 *
 * @returns The freshly-imported module.
 */
async function loadModule(): Promise<WineEngineModule> {
	vi.resetModules();

	return import('./wineEngine.js');
}

beforeEach(() => {
	// The main-thread tier. See the boundary test below for why this resolves to the main thread.
	vi.stubEnv('VITE_WINE_TIER', 'default');
	// The main-thread boot streams the default tier over `loadCorpusPaged('wine', ...)`, i.e. a
	// `fetch('/api/wine?...')` the app serves via MSW. jsdom has no such endpoint, so stub `fetch`
	// to page the real default corpus — the boot then builds over exactly the bundled default-tier
	// records, which is what every count assertion below expects.
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		const url = new URL(input as string, 'http://localhost');
		const limit = Number(url.searchParams.get('limit'));
		const offset = Number(url.searchParams.get('offset'));
		const items = defaultTierWines.slice(offset, offset + limit);

		return Promise.resolve({ json: async () => Promise.resolve({ items, total: defaultTierWines.length }), ok: true });
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('boot progress pub/sub', () => {
	it('starts with no progress', async () => {
		const wineEngine = await loadModule();

		expect(wineEngine.getWineBootProgressSnapshot()).toBeNull();
	});

	it('delivers progress to every subscriber and updates the snapshot', async () => {
		// The BootScreen reads through useSyncExternalStore, so the snapshot and the notification must
		// agree — a listener that fires while the snapshot still holds the old value makes React bail
		// out of the re-render and the loader freezes mid-count.
		const wineEngine = await loadModule();
		const first: unknown[] = [];
		const second: unknown[] = [];

		wineEngine.subscribeWineBootProgress((progress) => first.push(progress));
		wineEngine.subscribeWineBootProgress((progress) => second.push(progress));

		await wineEngine.bootWineEngine();

		expect(first.length).toBeGreaterThan(0);
		expect(second.length).toBe(first.length);
		expect(wineEngine.getWineBootProgressSnapshot()).toEqual(first.at(-1));
	});

	it('stops delivering after unsubscribe', async () => {
		const wineEngine = await loadModule();
		const seen: unknown[] = [];
		const unsubscribe = wineEngine.subscribeWineBootProgress((progress) => seen.push(progress));

		unsubscribe();
		await wineEngine.bootWineEngine();

		expect(seen).toEqual([]);
	});

	it('unsubscribing one subscriber leaves the others attached', async () => {
		const wineEngine = await loadModule();
		const kept: unknown[] = [];
		const dropped: unknown[] = [];

		wineEngine.subscribeWineBootProgress((progress) => kept.push(progress));
		wineEngine.subscribeWineBootProgress((progress) => dropped.push(progress))();

		await wineEngine.bootWineEngine();

		expect(kept.length).toBeGreaterThan(0);
		expect(dropped).toEqual([]);
	});
});

describe('describeBootedWineCorpusTier', () => {
	// Exists for the two React apps, whose `bootAndWire` drops `bundle.meta` before their `<Footer />`
	// ever runs. The footer has to name the tier that actually booted, because the silent bundled-tier
	// fallback is a failure a footer is one of the only places to see.

	it('reports nothing before a boot has completed', async () => {
		// Empty rather than a tier claim: the caller renders nothing. `''` is deliberately
		// indistinguishable from "not booted", which is why the e2e case asserts the tier POSITIVELY
		// — an app that silently stopped reporting must fail rather than pass over a blank.
		const wineEngine = await loadModule();

		expect(wineEngine.describeBootedWineCorpusTier()).toBe('');
	});

	it('reports the tier the boot actually landed on', async () => {
		const wineEngine = await loadModule();

		await wineEngine.bootWineEngine();

		// `beforeEach` pins `VITE_WINE_TIER=default`, so this run genuinely IS the default tier —
		// the string is read back from a real boot rather than from a stubbed source.
		expect(wineEngine.describeBootedWineCorpusTier()).toBe('10k tier · synthetic');
	});

	it('tracks a FULL-corpus source, not just the default tier', async () => {
		// **The case that makes the other two mean something.** Every boot reachable in jsdom lands on
		// `default-tier`, so a version that ignored the snapshot and hardcoded the default-tier label
		// passed both cases above — verified by mutation, which is the only reason this exists.
		//
		// The worker path is where a different source comes from. `bootWineAsyncEngine` hands the
		// worker an `onProgress` through `factoryCallbacks`; stubbing `wrapInWorker` lets the test
		// capture that callback and report a full-corpus tier exactly as the real worker would.
		// Captured on an OBJECT rather than into a `let`. TypeScript does not track assignments made
		// inside a callback it cannot prove ran, so a plain local narrows to `null` — and then to
		// `never` at the call below — however many `expect(...).not.toBeNull()` guards precede it. A
		// property read defeats the narrowing, which is the same dodge `createAsyncMirrorRefreshers`
		// uses for its `isDisposed` accessor.
		const captured: { onProgress: ProgressReporter | null } = { onProgress: null };

		const asyncEngine = { getSourceData: vi.fn(async () => Promise.resolve([])) };

		vi.doMock('@filter-enginez/worker-bridge', () => ({
			wrapInWorker: vi.fn(async (options: { factoryCallbacks?: { onProgress?: ProgressReporter }}) => {
				captured.onProgress = options.factoryCallbacks?.onProgress ?? null;

				return Promise.resolve(asyncEngine);
			}),
		}));

		const wineEngine = await loadModule();

		await wineEngine.bootWineAsyncEngine({ spawnWorker: vi.fn(() => ({ terminate: vi.fn() })) as never });

		expect(captured.onProgress, 'the boot must hand the worker an onProgress callback').not.toBeNull();

		captured.onProgress?.(FULL_WINE_TIER_SIZE, FULL_WINE_TIER_SIZE, 'synthetic-full-tier', false);

		expect(wineEngine.describeBootedWineCorpusTier()).toBe('full corpus · synthetic');
		// And it is the SHARED mapping, not a second copy of the same literals.
		expect(wineEngine.describeBootedWineCorpusTier()).toBe(describeWineCorpusTier('synthetic-full-tier'));
		// The estimate flag travels with the snapshot, so the caption can print `~` for it alone.
		captured.onProgress?.(8_000, 129_907, 'full-corpus-ndjson', true);
		expect(wineEngine.getWineBootProgressSnapshot()).toEqual({
			isTotalEstimated: true,
			loaded: 8_000,
			source: 'full-corpus-ndjson',
			total: 129_907,
		});

		vi.doUnmock('@filter-enginez/worker-bridge');
	});
});

describe('bootWineEngine', () => {
	it('boots on the main thread for the bundled default tier', async () => {
		// This doubles as a BOUNDARY guard. The default tier is exactly 10,000 records and
		// WORKER_THRESHOLD is exactly 10,000, and the helper routes `size > threshold` to the worker —
		// so this lands on the main thread by a single record.
		//
		// That makes the documented `VITE_WINE_TIER=default` escape hatch fragile in a silent way: one
		// extra wine from a mock-data regen flips it to the worker path, the env var appears to do
		// nothing, and whoever is trying to debug the main-thread path is quietly debugging the worker.
		// If this assertion ever fails, raise WORKER_THRESHOLD rather than editing the test.
		const wineEngine = await loadModule();
		const bundle = await wineEngine.bootWineEngine();

		expect(bundle.meta.mode).toBe('main-thread');
	});

	it('routes the FULL tier to the worker path', async () => {
		// The other half of the escape hatch. jsdom has no Worker, so spawning throws — and that throw is
		// exactly the evidence: reaching it proves the full tier took the worker branch rather than
		// quietly building on the main thread. Asserting the mode instead would need a real worker.
		//
		// This is as far as a unit test can follow the worker path. Everything past the spawn is covered
		// by the wine Playwright specs, which run in a real browser.
		vi.stubEnv('VITE_WINE_TIER', 'full');

		const wineEngine = await loadModule();

		await expect(wineEngine.bootWineEngine()).rejects.toThrow();
	});

	it('reports the default tier as the source with the full record count', async () => {
		const wineEngine = await loadModule();
		const bundle = await wineEngine.bootWineEngine();

		expect(bundle.meta.source).toBe('default-tier');
		expect(bundle.meta.wineCount).toBe(defaultTierWines.length);
	});

	it('builds an engine holding the corpus', async () => {
		const wineEngine = await loadModule();
		const bundle = await wineEngine.bootWineEngine();

		expect(bundle.engine.sourceData.value).toHaveLength(defaultTierWines.length);
		expect(bundle.engine.resultCount.value).toBe(defaultTierWines.length);
	});

	it('records a non-negative boot duration', async () => {
		const wineEngine = await loadModule();
		const bundle = await wineEngine.bootWineEngine();

		expect(bundle.meta.bootMs).toBeGreaterThanOrEqual(0);
	});

	it('is idempotent — repeated calls return the SAME bundle', async () => {
		// Every route mount calls this. Booting twice would build a second engine over the whole
		// corpus and hand different routes different engines, so a filter set on one would be
		// invisible to the other.
		const wineEngine = await loadModule();
		const [first, second] = await Promise.all([wineEngine.bootWineEngine(), wineEngine.bootWineEngine()]);

		expect(first).toBe(second);
		expect((await wineEngine.bootWineEngine()).engine).toBe(first.engine);
	});
});

describe('FULL_TIER_SIZE', () => {
	it('matches the full tier the worker generates', async () => {
		// A local copy, so the main thread does not bundle the generator to read one number. This is
		// what keeps the copy honest.
		const wineEngine = await loadModule();

		expect(wineEngine.FULL_TIER_SIZE).toBe(FULL_WINE_TIER_SIZE);
	});
});

describe('the worker tier request', () => {
	it.each([
		[8, 'full'],
		[1, 'low-memory'],
	] as const)('asks the worker for the %s-GB device\'s tier (%s)', async (deviceMemory, expected) => {
		// The tier is decided on the main thread and sent as plain data. Every app reaches the worker
		// through this one call, which is what makes all six boot the same tier on one device.
		const wrapInWorker = vi.fn(async () => Promise.resolve({ getSourceData: vi.fn(async () => Promise.resolve([])) }));

		vi.doMock('@filter-enginez/worker-bridge', () => ({ wrapInWorker }));
		vi.stubGlobal('navigator', { deviceMemory });

		const wineEngine = await loadModule();

		await wineEngine.bootWineAsyncEngine({ spawnWorker: vi.fn(() => ({ terminate: vi.fn() })) as never });

		expect(wrapInWorker).toHaveBeenCalledWith(expect.objectContaining({ factoryOptions: { tier: expected }}));

		vi.doUnmock('@filter-enginez/worker-bridge');
	});
});

describe('bootWineAsyncEngine', () => {
	it('refuses to boot without a worker spawner, naming the missing option', async () => {
		// The whole guard. There is no main-thread fallback on this boot, so a missing `spawnWorker` has
		// nowhere to degrade to — and degrading silently is exactly what must not happen: a 150k
		// main-thread boot "works" while freezing the tab and retiring the point of the vertical.
		const wineEngine = await loadModule();

		await expect(wineEngine.bootWineAsyncEngine({})).rejects.toThrow(/spawnWorker/);
	});

	it('boots over a stubbed worker bridge, reporting the corpus count and a duration', async () => {
		// The success path, covered for REAL rather than exempted. Everything about this boot is
		// testable except one call — `wrapInWorker`, which needs a Worker and a Comlink handshake that
		// jsdom does not have. Stubbing THAT and letting the rest run is the difference between a
		// covered function and an annotated one.
		//
		// The stub resolves the shape `FilterEngineAsync` promises rather than an empty object, so the
		// test fails if the boot starts depending on more of that surface.
		const asyncEngine = { getSourceData: vi.fn(async () => Promise.resolve([])) };
		const wrapInWorker = vi.fn(async () => Promise.resolve(asyncEngine));

		vi.doMock('@filter-enginez/worker-bridge', () => ({ wrapInWorker }));

		const wineEngine = await loadModule();
		const spawnWorker = vi.fn(() => ({ terminate: vi.fn() }));

		const bundle = await wineEngine.bootWineAsyncEngine({ spawnWorker: spawnWorker as never });

		expect(spawnWorker).toHaveBeenCalled();
		expect(wrapInWorker).toHaveBeenCalled();
		expect(bundle.asyncEngine).toBe(asyncEngine);
		expect(bundle.meta.bootMs).toBeGreaterThanOrEqual(0);
		// No progress was ever reported on this path, so the metadata falls back rather than reading
		// `undefined` into the boot screen's copy.
		expect(bundle.meta.wineCount).toBe(0);

		vi.doUnmock('@filter-enginez/worker-bridge');
	});

	it('memoizes — a second call returns the SAME bundle', async () => {
		// The cache is keyed on nothing: first call wins. Worth pinning because a caller trying to
		// switch tiers at runtime would get the first call's bundle back, silently.
		const asyncEngine = { getSourceData: vi.fn(async () => Promise.resolve([])) };

		vi.doMock('@filter-enginez/worker-bridge', () => ({
			wrapInWorker: vi.fn(async () => Promise.resolve(asyncEngine)),
		}));

		const wineEngine = await loadModule();
		const spawnWorker = vi.fn(() => ({ terminate: vi.fn() }));

		const first = await wineEngine.bootWineAsyncEngine({ spawnWorker: spawnWorker as never });
		const second = await wineEngine.bootWineAsyncEngine({ spawnWorker: spawnWorker as never });

		expect(second).toBe(first);
		expect(spawnWorker).toHaveBeenCalledTimes(1);

		vi.doUnmock('@filter-enginez/worker-bridge');
	});

	it('throws the SAME error the signals boot does — one guard, not two', async () => {
		// The DRY assertion, and the one a refactor is most likely to break. Both boots reach the worker
		// through `spawnWineAsyncEngine`, so the message is stated once. Two copies would drift, and the
		// drift would only ever be seen by whoever hit the rarer of the two paths.
		vi.stubEnv('VITE_WINE_TIER', 'full');

		const wineEngine = await loadModule();

		const fromSignalsBoot = await wineEngine
			.bootWineEngine()
			.then(() => null)
			.catch((error: unknown) => (error as Error).message);
		const fromAsyncBoot = await wineEngine
			.bootWineAsyncEngine({})
			.then(() => null)
			.catch((error: unknown) => (error as Error).message);

		expect(fromSignalsBoot).not.toBeNull();
		expect(fromAsyncBoot).toBe(fromSignalsBoot);
	});
});
