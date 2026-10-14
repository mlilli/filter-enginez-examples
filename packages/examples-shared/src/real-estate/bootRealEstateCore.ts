/**
 * Real-estate engine boot — the **reactive-surface-neutral** half.
 *
 * @remarks
 * This module boots the real-estate engine down to a bare `FilterEngine<Listing>`: it initializes
 * bitmap acceleration, builds the engine over the streamed default tier, and reports boot progress.
 * It has NO reactive-surface dependency — deliberately kept in its own module (rather than living
 * beside `bootRealEstateEngine`) so a consumer of the RxJS surface never pulls
 * `@preact/signals-core` into its graph just to boot.
 *
 * Direct mirror of `./books/bootBooksCore.ts`, and it exists for the same one reason: the Angular
 * vertical consumes `reactive-rxjs`, so it needs the core *before* `createSignalsEngine` wraps it.
 *
 * `bootRealEstateEngine` (in `./realEstateEngine.ts`) builds on this and wraps the result in
 * `createSignalsEngine`; an Angular / RxJS consumer instead does:
 *
 * ```ts
 * const { core } = await bootRealEstateCore();
 * const engine = createRxJsEngine(core);
 * ```
 *
 * Both paths share ONE cached core — the cache lives HERE, over the expensive work
 * (`initializeBitmapAcceleration` + `loadDefaultTierCorpus`), and the signals wrapper adds only a
 * second, cheap memo over its own wrapping. That split is the whole point: two `let cached…`
 * variables are correct, two corpus builds are not.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { type FilterEngine, initializeBitmapAcceleration } from '@filter-enginez/core';

import { loadDefaultTierCorpus } from '../data/loadDefaultTierCorpus.js';
import { buildRealEstateEngine } from './buildRealEstateEngine.js';

/** Live boot progress — listings load in one shot, so this reports the final count. */
export interface RealEstateBootProgress {
	/** Records loaded so far. */
	readonly loaded: number;
	/** The tier the load landed on. */
	readonly source: 'default-tier';
	/** Expected total. */
	readonly total: number;
}

/** Boot metadata, shared by every surface's bundle. */
export interface RealEstateBootMeta {
	/** Wall-clock ms from the first acceleration call to a usable engine. */
	readonly bootMs: number;
	/** Corpus size, for the results header's "filtered from N total". */
	readonly listingCount: number;
	/** Real estate has no worker tier; the default tier always builds in-page. */
	readonly mode: 'main-thread';
	/** Which tier the corpus came from. */
	readonly source: RealEstateBootProgress['source'];
}

/** The surface-neutral boot result: the bare engine plus boot metadata. */
export interface RealEstateCoreBundle {
	/** The bare engine — wrap it in whichever reactive surface you want, or use it directly. */
	readonly core: FilterEngine<Listing>;
	/** Boot metadata (record count, boot duration, tier) for the results header. */
	readonly meta: RealEstateBootMeta;
}

// ─── Module-level pub/sub for boot progress (mirrors bootBooksCore) ───────
type ProgressListener = (progress: RealEstateBootProgress | null) => void;
let currentProgress: RealEstateBootProgress | null = null;
const progressListeners = new Set<ProgressListener>();
let cachedCoreBoot: Promise<RealEstateCoreBundle> | null = null;

/**
 * Subscribe to real-estate boot progress. `useSyncExternalStore`-shaped (subscribe + snapshot).
 *
 * @param listener - Called with the latest progress (or `null` before boot starts).
 * @returns An unsubscribe callback.
 */
export function subscribeRealEstateBootProgress(listener: ProgressListener): () => void {
	progressListeners.add(listener);

	return () => {
		progressListeners.delete(listener);
	};
}

/**
 * Read the current real-estate boot progress synchronously. Pairs with
 * {@link subscribeRealEstateBootProgress}.
 *
 * @returns The latest progress snapshot, or `null` before boot starts.
 */
export function getRealEstateBootProgressSnapshot(): RealEstateBootProgress | null {
	return currentProgress;
}

/**
 * Boot the real-estate engine to a bare `FilterEngine`. Idempotent — repeated calls return the
 * cached bundle, so acceleration initializes once and the corpus builds once.
 *
 * @returns The bare engine + boot metadata.
 */
export async function bootRealEstateCore(): Promise<RealEstateCoreBundle> {
	cachedCoreBoot ??= bootCoreInternal();

	return cachedCoreBoot;
}

/**
 * The boot: initialize acceleration, STREAM the default tier over `/api/real-estate` (MSW in dev, or a
 * real backend where one is deployed) with a bundled fallback, build the engine, publish progress.
 *
 * @remarks
 * The corpus is streamed via {@link loadDefaultTierCorpus} rather than statically imported, so the
 * ~10k default tier stays out of the main-thread bundle. Where the endpoint is unavailable (a
 * production build with no API, or an environment where MSW is not running), the bundled corpus is
 * DYNAMICALLY imported as a fallback, so it still code-splits out of the streamed path. On that
 * fallback path a single final progress ping fires. The `Listing` type comes in through `import type`,
 * which is erased: under `verbatimModuleSyntax` an inline `import { type Listing }` survives as a
 * side-effect import of the dataset and undoes the split.
 *
 * @internal
 */
async function bootCoreInternal(): Promise<RealEstateCoreBundle> {
	const t0 = performance.now();

	await initializeBitmapAcceleration();

	const { records } = await loadDefaultTierCorpus<Listing>(
		'real-estate',
		async () => (await import('@filter-enginez/mock-data/real-estate')).listings,
		{
			onProgress: ({ loaded, total }) => {
				currentProgress = { loaded, source: 'default-tier', total };
				for (const listener of progressListeners) {
					listener(currentProgress);
				}
			},
		},
	);

	const core = buildRealEstateEngine(records);

	return {
		core,
		meta: {
			bootMs: performance.now() - t0,
			listingCount: records.length,
			mode: 'main-thread',
			source: 'default-tier',
		},
	};
}
