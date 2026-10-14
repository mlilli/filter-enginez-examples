/// <reference lib="webworker" />
/**
 * `wine.worker.ts` — the Web Worker that builds the wine corpus and hosts the wine filter engine.
 *
 * @remarks
 * 150,000 wines are too heavy for the main thread: generating them takes a second or two, and every
 * filter over them would block input for tens of milliseconds. This worker takes both off the page:
 *
 *   1. It builds the corpus — the local real review corpus where one is linked, otherwise the 150,000
 *      synthetic wines from the seeded generator — reporting progress after every chunk to a
 *      `Comlink.proxy`-wrapped `onProgress` callback. The main-thread loader keeps animating
 *      throughout. The chain lives in `wineCorpusLoader.ts`, where it can be tested.
 *   2. It hosts the `FilterEngine` for its lifetime. Every consumer call (addRule, removeRule,
 *      getResults, simulate, …) round-trips via Comlink, so the main thread stays free to render and
 *      handle input however heavy the filter computation is.
 *
 * **It imports the generator sub-export only.** `@filter-enginez/mock-data/wine/generator` has no
 * corpus loaders, no MSW and no top-level `await`, so nothing is generated before the main thread has
 * said which tier it wants.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine/generator';

import { createFilterEngine, initializeBitmapAcceleration } from '@filter-enginez/core';
import { exposeFilterEngineWorker, type WorkerEngineFactory } from '@filter-enginez/worker-bridge';

import { loadWineCorpus, type WineWorkerCallbacks } from './wineCorpusLoader.js';
import { type WineWorkerTier } from './wineCorpusTier.js';

/**
 * Read the requested tier out of the structured-cloned `factoryOptions`.
 *
 * @remarks
 * The options arrive as plain data from another thread, so they are checked rather than cast: anything
 * other than `'low-memory'` builds the full tier, which is what the page is for.
 *
 * @param options - The factory options as received.
 * @returns The tier to build.
 * @internal
 */
function readRequestedTier(options: unknown): WineWorkerTier {
	const tier = (options as { readonly tier?: unknown } | undefined)?.tier;

	return tier === 'low-memory' ? 'low-memory' : 'full';
}

/**
 * The worker-side engine factory. Receives plain (structuredClone-safe) `options` and a
 * separately-arriving `callbacks` object whose methods are Comlink-proxied back to the main thread.
 *
 * @internal
 */
const wineEngineFactory: WorkerEngineFactory<Wine> = async (options, callbacks) => {
	// The callbacks object is a Comlink remote — its methods round-trip via postMessage.
	const cbs = callbacks as unknown as WineWorkerCallbacks | undefined;
	const onProgress = cbs?.onProgress;

	// Phase 1 — WASM init. The worker has its own module scope, so Roaring is initialized here, where
	// the bitmap index will be built.
	await initializeBitmapAcceleration();

	// Phase 2 — the corpus.
	const { wines } = await loadWineCorpus(readRequestedTier(options), onProgress);

	// Phase 3 — the engine, which lives here for the worker's lifetime; the main thread holds a Comlink
	// proxy.
	//
	// **No pre-loaded rules.** Passing a config would start the engine with every filter rule already
	// registered, so every user interaction would record as `RULE_CHANGED` and the devtools action log
	// could never show `addRule` or `removeRule` entries organically. Filter controls handle an absent
	// rule by falling back to their default displayed values; the first click dispatches a real
	// `addRule`, later edits `changeRule`, and a chip's X `removeRule`.
	return createFilterEngine<Wine>({
		sourceData: wines,
	});
};

// Register the factory + expose the worker. `wrapInWorker({ factoryName: 'wineEngine' })` on the main
// thread picks this up by name.
exposeFilterEngineWorker({
	wineEngine: wineEngineFactory,
});
