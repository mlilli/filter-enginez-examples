/**
 * Wine engine boot — async factory that spawns the engine inside a Web Worker.
 *
 * @remarks
 * Built on the worker-bridge integration. On the worker tier, `wrapInWorker` spawns `wine.worker.ts` and
 * Comlink-wraps it, the worker builds the 150,000-wine corpus + constructs the engine, and
 * main-thread code consumes the result via the async-engine signals adapter.
 *
 * **The boot sequence:**
 *
 *   1. Publish progress through a small pub/sub so the boot screen can show
 *      "Loaded N of 150,000 bottles" as the worker reports it.
 *   2. Call `wrapInWorker<Wine>({ worker: spawnWorker(), factoryName: 'wineEngine',
 *      factoryCallbacks: { onProgress } })`. Comlink proxies the `onProgress` callback so the
 *      worker can invoke it across the postMessage boundary.
 *
 *      ⚠ `factoryCALLBACKS`, not `factoryOptions` — and a pre-spawned `worker`, not a `workerUrl`.
 *      `wrapInWorker` has no `workerUrl` option, and a function nested inside `factoryOptions` is
 *      handed to `structuredClone` and throws. No compiler checks this prose against the call site
 *      below. The engine repository's `tests/tooling/docblockWrapInWorkerOptions.test.ts`
 *      (https://github.com/mlilli/filter-enginez) holds every such example in the engine packages
 *      to the declared option set; this file is outside its walk, so keep this step in step with
 *      the call site below by hand.
 *   3. The worker's factory builds the corpus in chunks, then the engine. During this, the main
 *      thread is fully idle — the BrainSynapse loader animates smoothly + progress copy
 *      updates per chunk.
 *   4. `wrapInWorker` resolves to a `FilterEngineAsync<Wine>`. Wrap it via
 *      `createSignalsEngineFromAsync` to get the `SignalsEngine<Wine>` the shared wine
 *      components consume unchanged.
 *
 * **Why progress is exposed as a preact signal.** The `<BootScreen>` reads it via `.value`
 * during render. A useState would also work but signals match the rest of the app's
 * reactive idiom and don't require a wrapping component to bridge to React state.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { initializeBitmapAcceleration } from '@filter-enginez/core';
import { bootSignalsEngine } from '@filter-enginez/reactive-signals/worker';
import { type FilterEngineAsync, type WorkerLike, wrapInWorker } from '@filter-enginez/worker-bridge';

import { loadCorpusPaged } from '../data/loadCorpusPaged.js';
import { reviveSignalsEngineOverWorker } from '../data/reviveSignalsEngine.js';
import { buildWineEngine } from './buildWineEngine.js';
import { describeWineCorpusTier, type WineCorpusSource } from './wineCorpusTier.js';
import { resolveWineWorkerTier } from './wineMemoryTier.js';

/**
 * Records above this count boot the engine in a Web Worker; this many or fewer boot on the main
 * thread. The default tier (10,000) runs on the main thread; the 150,000-wine full tier goes to the
 * worker.
 */
const WORKER_THRESHOLD = 10_000;

/**
 * Size of the full tier the worker builds (`FULL_WINE_TIER_SIZE` in `@filter-enginez/mock-data`).
 * Used ONLY for the size-aware boot decision, and well above {@link WORKER_THRESHOLD}, so it routes to
 * the worker.
 *
 * @remarks
 * A local constant rather than an import, for the same reason as {@link DEFAULT_TIER_SIZE} below:
 * the constant's home module re-exports the generator, and this module is on the main thread, which
 * must not bundle the generator's tables just to read one number. `wineEngine.test.ts` pins the two
 * values equal.
 */
export const FULL_TIER_SIZE = 150_000;

/**
 * Size of the default tier (mirrors `DEFAULT_TIER_SIZE` in `@filter-enginez/mock-
 * data`). Used ONLY for the size-aware boot decision — a local constant rather than a
 * `defaultTierWines.length` read, so this module does not statically import the ~9 MB default
 * corpus (the default records stream in over `loadCorpusPaged`). It equals `WORKER_THRESHOLD`,
 * so `size === threshold` routes to the main thread (the `bootSignalsEngine` boundary rule).
 */
const DEFAULT_TIER_SIZE = 10_000;

/**
 * Resolve the dataset size from the `VITE_WINE_TIER` env var (default `'full'`).
 *
 * @remarks
 * Set it at dev/build time to exercise the main-thread boot path against the 10,000-wine default tier:
 *
 *   VITE_WINE_TIER=default pnpm dev:rtk:fresh
 *
 * `'full'` (or unset) keeps the deployed worker path with the 150,000-wine corpus. The returned size
 * is what we hand to `bootSignalsEngine`, so it — not a separate flag — is what flips worker vs main
 * thread.
 *
 * ## The cast is load-bearing, and `ng build` is what proved it
 *
 * `import.meta.env` is Vite's, and it is typed by `vite/client` — which is in scope for every Vite
 * vertical's program and for this package's own `tsc`. It is NOT in scope for Angular, which compiles
 * this file from SOURCE (its `tsconfig.json` deliberately drops `references`), and there
 * `import.meta.env` is a **type error**: `TS2339: Property 'env' does not exist on type 'ImportMeta'`.
 *
 * Making the boot's `datasetSize` default lazy was necessary but not sufficient — a lazily-evaluated
 * expression still has to type-check. So the read is narrowed structurally instead. It also becomes
 * genuinely runtime-safe in the bargain: outside Vite `import.meta.env` is `undefined`, and the
 * optional chain returns `undefined` rather than throwing, which is the honest answer to "what tier
 * did the build ask for" when the build has no way to say.
 *
 * Angular passes `datasetSize` explicitly and never reaches this at runtime, but its compiler still
 * type-checks the expression.
 *
 * **`as unknown as` rather than a direct cast, and that is not belt-and-braces either.** A direct
 * `as { env?: … }` type-checks in Angular and FAILS in this package's own `tsc`, where `vite/client`
 * has already typed `import.meta.env` as `ImportMetaEnv` — TypeScript rejects the conversion as
 * insufficiently overlapping. Two programs, two different reasons to complain, and only the double
 * cast satisfies both. The house TypeScript rules permit exactly this shape where a cast is
 * unavoidable; the optional chain below is the narrowing that makes it safe.
 */
function resolveDatasetSize(): number {
	const meta = import.meta as unknown as { env?: { VITE_WINE_TIER?: string }};

	return meta.env?.VITE_WINE_TIER === 'default' ? DEFAULT_TIER_SIZE : FULL_TIER_SIZE;
}

/**
 * Live progress data emitted while the wine corpus loads. Read this from the boot screen to render
 * "Loaded N of 150,000 bottles" copy.
 */
export interface WineBootProgress {
	/** Records loaded or generated so far. */
	readonly loaded: number;
	/** The total. Exact, except while the local real corpus streams — see {@link isTotalEstimated}. */
	readonly total: number;
	/** Which source is producing the corpus. */
	readonly source: WineCorpusSource;
	/**
	 * `true` while `total` is an estimate: only during the local real corpus's stream, which cannot
	 * know its length until it ends. The boot caption prints `~` before an estimated total.
	 */
	readonly isTotalEstimated: boolean;
}

/**
 * Boot result — the signals-wrapped engine plus a snapshot of the final progress state.
 * After boot, consumers reading via `subscribeWineBootProgress` see the final values frozen.
 */
export interface WineEngineBundle {
	readonly engine: SignalsEngine<Wine>;
	readonly meta: {
		readonly bootMs: number;
		readonly source: WineBootProgress['source'];
		readonly wineCount: number;
		/** Which boot path the size-aware helper took. */
		readonly mode: 'main-thread' | 'worker';
	};
}

// ─── Module-level pub/sub for boot progress ──────────────────────────────
// Plain callback registry rather than a preact signal — keeps the app free of a direct
// `@preact/signals-core` dep. The BootScreen reads via `useSyncExternalStore`, which is
// the React-native bridge for "subscribe to an external mutable source."

type ProgressListener = (progress: WineBootProgress | null) => void;
let currentProgress: WineBootProgress | null = null;
const progressListeners = new Set<ProgressListener>();
let cachedBoot: Promise<WineEngineBundle> | null = null;

/**
 * Subscribe to wine boot progress updates. The listener is invoked with the current
 * value immediately on subscribe, and then on every change. Returns an unsubscribe fn.
 *
 * Designed for `useSyncExternalStore`'s subscribe parameter:
 *
 *   const progress = useSyncExternalStore(
 *     subscribeWineBootProgress,
 *     getWineBootProgressSnapshot,
 *     () => null,
 *   );
 */
export function subscribeWineBootProgress(listener: ProgressListener): () => void {
	progressListeners.add(listener);

	return () => {
		progressListeners.delete(listener);
	};
}

/**
 * Read the current wine boot progress synchronously. Pairs with
 * `subscribeWineBootProgress` for `useSyncExternalStore`.
 */
export function getWineBootProgressSnapshot(): WineBootProgress | null {
	return currentProgress;
}

/**
 * The booted corpus tier as a footer label, read from the frozen progress snapshot.
 *
 * @remarks
 * **For consumers that do not hold `bundle.meta`.** Four verticals render
 * `describeWineCorpusTier(bundle.meta.source)` directly, because their boot call and their footer
 * live in the same component. The two React apps do not: `datasets.tsx` returns
 * `{ detach, engine, store }` from `bootAndWire` and drops `meta` on the floor, so their `<Footer />`
 * has no path to it. Threading `meta` through the dataset registry would touch every dataset's boot
 * for one string; the progress snapshot is frozen at its final value after boot and already exported,
 * so it is the seam that exists.
 *
 * **This is a helper rather than a line at each call site** so the two React footers cannot disagree
 * with each other or with the tier that actually booted. One function is one place to be wrong.
 *
 * Returns an empty string when no wine boot has completed, so a caller renders nothing rather than
 * `undefined`. That is deliberately indistinguishable from "not booted yet" and NOT a tier claim:
 * `tests/e2e` asserts the tier POSITIVELY (`full corpus` must appear) precisely so an app that
 * silently stopped reporting fails instead of passing over a blank.
 *
 * @returns The {@link describeWineCorpusTier} label, or `''` when no boot has completed.
 */
export function describeBootedWineCorpusTier(): string {
	return currentProgress === null ? '' : describeWineCorpusTier(currentProgress.source);
}

/**
 * How a vertical supplies the two things about this boot that are bundler-specific.
 *
 * @remarks
 * Both fields exist for the same reason and only that reason: **Angular is not Vite.** Its esbuild
 * builder resolves `?worker` nowhere, and it defines none of Vite's `import.meta.env` constants. A
 * Vite vertical passes `spawnWineWorker` from `@filter-enginez/examples-shared/wine-worker-spawn`
 * and omits `datasetSize`; Angular passes its own spawn and resolves its own tier.
 */
export interface WineBootOptions {
	/**
	 * How many records to boot with — the value that decides worker versus main thread, since
	 * `bootSignalsEngine` branches on size against `WORKER_THRESHOLD` rather than on a flag.
	 *
	 * @remarks
	 * Defaults to the `VITE_WINE_TIER` reading, which is why this is a lazily-evaluated default and
	 * not a parameter default: `import.meta.env` is undefined at runtime outside Vite, so merely
	 * REACHING `resolveDatasetSize` would throw in Angular. A caller that supplies this never
	 * evaluates it.
	 */
	readonly datasetSize?: number;

	/**
	 * Spawn the corpus worker. Required on the worker tier; unused on the main-thread tier.
	 *
	 * @remarks
	 * A function rather than an instance, so the main-thread path never constructs a worker it will
	 * not message. See `wineWorkerSpawn.ts` for why this is not simply imported here.
	 */
	readonly spawnWorker?: () => WorkerLike;
}

/**
 * Record a progress tick and fan it out to every subscriber.
 *
 * @remarks
 * Module-level rather than a closure inside the boot, because BOTH boots report through it and the
 * `currentProgress` snapshot they later read is the same one. A per-boot closure would leave the
 * async boot silently unable to reach the pub/sub every vertical's boot screen subscribes to.
 *
 * @param loaded - Records loaded or generated so far.
 * @param total - The total.
 * @param source - Which source is producing the corpus.
 * @param isTotalEstimated - Whether `total` is an estimate. Defaults to `false`.
 */
function reportProgress(loaded: number, total: number, source: WineCorpusSource, isTotalEstimated = false): void {
	currentProgress = { isTotalEstimated, loaded, source, total };
	for (const listener of progressListeners) {
		listener(currentProgress);
	}
}

/**
 * Spawn the corpus worker and Comlink-wrap it.
 *
 * @remarks
 * The single place the worker tier is constructed, so the missing-`spawnWorker` error and the
 * `factoryCallbacks` placement are stated once. `onProgress` rides in `factoryCallbacks` rather than
 * `factoryOptions` so Comlink proxies the function across the postMessage boundary instead of choking
 * on it in `structuredClone`.
 *
 * The tier the worker builds is decided HERE, on the main thread, by `resolveWineWorkerTier` — and
 * because all six apps reach the worker through this one function, every wine route on a device boots
 * the same tier. It travels in `factoryOptions` as a plain string.
 *
 * @param options - The caller's boot inputs.
 * @returns The worker-hosted async engine.
 * @throws When `spawnWorker` is absent — see the message.
 */
async function spawnWineAsyncEngine(options: WineBootOptions): Promise<FilterEngineAsync<Wine>> {
	const { spawnWorker } = options;

	if (spawnWorker === undefined) {
		// Thrown rather than silently degraded to the main thread. A 150k main-thread boot "works" — it
		// just freezes the tab for seconds and quietly retires the entire point of the wine vertical,
		// which is the worker tier. Better to name the missing argument.
		throw new Error(
			'bootWineEngine: the worker tier needs a `spawnWorker`. Vite verticals pass '
				+ '`spawnWineWorker` from `@filter-enginez/examples-shared/wine-worker-spawn`; '
				+ 'other bundlers supply their own. Pass `datasetSize` at or below '
				+ `${String(WORKER_THRESHOLD)} to boot on the main thread instead.`,
		);
	}

	return wrapInWorker<Wine>({
		factoryCallbacks: { onProgress: reportProgress },
		factoryName: 'wineEngine',
		factoryOptions: { tier: resolveWineWorkerTier() },
		worker: spawnWorker(),
	});
}

/**
 * Read the final progress snapshot as boot metadata.
 *
 * @param countFallback - Yields a record count when no progress was ever reported.
 * @returns The source + record count for {@link WineEngineBundle.meta}.
 */
function readProgressMeta(
	countFallback: () => number,
): Pick<WineEngineBundle['meta'], 'source' | 'wineCount'> {
	/* v8 ignore start -- the no-progress arm is unreachable on either real path: the main-thread
	   branch pings `onProgress` before returning, and the worker streams progress as it loads, so
	   `currentProgress` is always populated by the time boot resolves. It stands as the answer for a
	   boot that completed without ever reporting — a count read straight off the engine still beats
	   rendering `undefined` in the boot screen's copy. */
	return currentProgress === null
		? { source: 'default-tier' as const, wineCount: countFallback() }
		: { source: currentProgress.source, wineCount: currentProgress.loaded };
	/* v8 ignore stop */
}

/**
 * Boot the wine engine, in a Web Worker above `WORKER_THRESHOLD` records and on the main thread at
 * or below it. Idempotent — repeated calls cache and return the same bundle, with a fresh facade
 * over the same engine when a route that left disposed the cached one.
 *
 * @remarks
 * **The cache is keyed on nothing: first call wins.** A second call with different options returns
 * the first call's bundle, silently. That is correct for the one thing this is for — a route booting
 * its engine once — and would be wrong for a caller trying to switch tiers at runtime, which no
 * vertical does. Stated because a cache that ignores its arguments is worth knowing about before you
 * discover it.
 *
 * @param options - Bundler-specific boot inputs. See {@link WineBootOptions}.
 * @returns A promise resolving to the signals-wrapped engine + boot metadata.
 */
export async function bootWineEngine(options: WineBootOptions = {}): Promise<WineEngineBundle> {
	if (cachedBoot === null) {
		cachedBoot = bootInternal(options);
	}

	const bundle = await cachedBoot;
	const engine = await reviveSignalsEngineOverWorker(bundle.engine);

	if (engine === bundle.engine) {
		return bundle;
	}
	// A route that left disposed the cached facade; hand the next visit a live one over the same engine
	// (the worker's, when it runs in one).
	const revived = { ...bundle, engine };

	cachedBoot = Promise.resolve(revived);

	return revived;
}

async function bootInternal(options: WineBootOptions): Promise<WineEngineBundle> {
	const t0 = performance.now();

	// Size-aware boot. The wine demo targets the 150,000-wine tier, so this resolves to the worker
	// path; at or below WORKER_THRESHOLD (the 10,000-wine default tier) the helper builds the engine
	// on the main thread instead. Both branches are real — see `createMainEngine`.
	const { engine, mode } = await bootSignalsEngine<Wine>({
		// Main-thread path — build the identical engine from the bundled default tier via the
		// shared `buildWineEngine`. Bitmap acceleration is initialized here (the worker does it in
		// its own boot phase); the final progress ping makes the boot screen read "ready" the same
		// way the worker path does.
		createMainEngine: async () => {
			await initializeBitmapAcceleration();
			// Stream the default tier over the paginated MSW-backed endpoint (`/api/wine`) — realistic
			// incremental loading, and the ~9 MB default corpus stays out of the main-thread bundle.
			// `loadCorpusPaged` reports per-page progress; the final page's ping (loaded === total) leaves
			// the boot screen reading "ready". The app starts MSW before this runs in dev; outside dev the
			// endpoint has to be served by a real backend.
			const corpus = await loadCorpusPaged<Wine>('wine', {
				onProgress: ({ loaded, total }) => {
					reportProgress(loaded, total, 'default-tier');
				},
				tier: 'default',
			});

			return buildWineEngine(corpus);
		},
		size: options.datasetSize ?? resolveDatasetSize(),
		// Worker path — the spawn + Comlink wrap live in `spawnWineAsyncEngine`, shared with
		// `bootWineAsyncEngine`. `bootSignalsEngine` then wraps the returned async engine in the
		// signals facade via `createSignalsEngineFromAsync`.
		spawnAsyncEngine: async () => spawnWineAsyncEngine(options),
		threshold: WORKER_THRESHOLD,
	});

	const bootMs = performance.now() - t0;
	/* v8 ignore next -- the FALLBACK ARROW, not the call. It runs only when no progress was ever
	   reported, which `readProgressMeta` already documents as unreachable on either real path — the
	   main-thread branch pings before returning and the worker streams as it loads. It needs its own
	   ignore because it is a callback defined out here, not an expression inside that function's
	   ignored ternary: pulling an expression into a callback moves it out from under any ignore that
	   covered it. */
	const progressMeta = readProgressMeta(() => engine.sourceData.value.length);

	return {
		engine,
		meta: { bootMs, mode, ...progressMeta },
	};
}

/**
 * Boot result for the surface-NEUTRAL worker boot.
 *
 * @remarks
 * Carries the same `meta` shape as {@link WineEngineBundle} minus `mode`, which is always `'worker'`
 * here and would be a field with one possible value.
 */
export interface WineAsyncEngineBundle {
	/** The worker-hosted engine, ready to be wrapped in whichever reactive surface the caller uses. */
	readonly asyncEngine: FilterEngineAsync<Wine>;
	readonly meta: {
		readonly bootMs: number;
		readonly source: WineBootProgress['source'];
		readonly wineCount: number;
	};
}

/** Memoized like {@link bootWineEngine}, and for the same reason — see its remarks. */
let cachedAsyncBoot: Promise<WineAsyncEngineBundle> | null = null;

/**
 * Boot the wine engine in a Web Worker and hand back the RAW async engine.
 *
 * @remarks
 * The surface-neutral half of {@link bootWineEngine}, and the reason it exists is Angular.
 *
 * `bootWineEngine` returns a `SignalsEngine`, because `bootSignalsEngine` is what performs its
 * size-aware branch. That is right for the five Vite verticals, which all consume the signals surface.
 * Angular consumes `Observable`s natively and deliberately ships no `@preact/signals-core`, so it
 * needs the async engine before a surface is chosen — `createRxJsEngineFromAsync` is its wrapper.
 *
 * **Reaching for `bootWineEngine(...).engine.core` instead would be wrong twice over.** On the worker
 * tier that `.core` is ALREADY a synchronous shim over this async engine, so wrapping it again would
 * stack a second shim on the first; and merely importing the signals boot pulls the reactive surface
 * this vertical exists to do without into its bundle.
 *
 * **Worker only, by construction.** There is no size branch here because the one caller pins the full
 * corpus. A main-thread Angular tier would call `buildWineEngine` directly and needs nothing from
 * this module.
 *
 * Progress flows through the SAME `subscribeWineBootProgress` pub/sub the other five verticals read,
 * because both boots report through one module-level `reportProgress`. A boot screen wired to that
 * subscription works here unchanged.
 *
 * **The two boots cache independently.** No vertical calls both, and a shared cache would have to
 * decide which surface won. Worth knowing before someone adds a route that does.
 *
 * @param options - Bundler-specific boot inputs. `spawnWorker` is REQUIRED here — there is no
 *   main-thread fallback to degrade to.
 * @returns The worker-hosted async engine + boot metadata.
 */
export async function bootWineAsyncEngine(
	options: WineBootOptions,
): Promise<WineAsyncEngineBundle> {
	cachedAsyncBoot ??= (async (): Promise<WineAsyncEngineBundle> => {
		const startedAt = performance.now();
		const asyncEngine = await spawnWineAsyncEngine(options);
		const bootMs = performance.now() - startedAt;

		return {
			asyncEngine,
			meta: { bootMs, ...readProgressMeta(() => 0) },
		};
	})();

	return cachedAsyncBoot;
}
