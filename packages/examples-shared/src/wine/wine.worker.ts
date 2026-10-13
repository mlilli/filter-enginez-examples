/// <reference lib="webworker" />
/**
 * `wine.worker.ts` — the Web Worker that hosts the wine filter engine.
 *
 * @remarks
 * The full 130k Kaggle Wine Reviews corpus is too heavy to keep on the main thread — the fetch + parse
 * blocks the React render loop for 1-3 seconds (loader animation freezes) and every
 * subsequent filter operation blocks the UI for hundreds of milliseconds (slider drag +
 * chip toggle feel unresponsive). This worker fixes both:
 *
 *   1. The worker streams the NDJSON corpus off the main thread, reporting per-bottle
 *      progress to a `Comlink.proxy`-wrapped `onProgress` callback. The main-thread
 *      `<BrainSynapse>` loader keeps animating throughout.
 *   2. The worker hosts the `FilterEngine` for its lifetime. Every consumer call
 *      (addRule, removeRule, getResults, simulate, etc.) round-trips via Comlink. The
 *      main thread stays free to render React + handle user input regardless of how
 *      heavy the filter computation is.
 *
 * **Data source resolution.** Three-tier fallback chain:
 *
 *   - **Streaming NDJSON** — `/data-real-full.ndjson` via `response.body.getReader()`,
 *     parsed line-by-line. ~130k records. Reports progress every chunk.
 *   - **Monolithic JSON** — `/data-real-full.json` via `fetch(...).then(r => r.json())`.
 *     Same dataset, atomic parse. Used if the NDJSON 404s (e.g. only the JSON export is
 *     present).
 *   - **Bundled default tier** — `import { wines } from '@filter-enginez/mock-data/wine'`,
 *     the 10k stratified committed dataset. Works on a fresh clone with no extra fetch.
 *
 * **Why a static `import` from mock-data is OK here.** The worker runs in its own ES module
 * context — top-level await and ES module imports both work. The same `await
 * initializeBitmapAcceleration()` dance the main-thread tier performs happens here; same
 * outcome, different thread.
 *
 * @packageDocumentation
 */

import { createFilterEngine, initializeBitmapAcceleration } from '@filter-enginez/core';
import { wines as defaultWines, type Wine } from '@filter-enginez/mock-data/wine';
import { exposeFilterEngineWorker, type WorkerEngineFactory } from '@filter-enginez/worker-bridge';

import { loadWineCorpus, type WineWorkerCallbacks } from './wineCorpusLoader.js';

/**
 * The worker-side engine factory. Receives plain (structuredClone-safe) `options` and a
 * separately-arriving `callbacks` object whose methods are Comlink-proxied back to the
 * main thread.
 *
 * @internal
 */
const wineEngineFactory: WorkerEngineFactory<Wine> = async (_options, callbacks) => {
	// The callbacks object is a Comlink remote — its methods round-trip via postMessage.
	// Cast to our typed shape so the rest of the factory reads cleanly.
	const cbs = callbacks as unknown as WineWorkerCallbacks | undefined;
	const onProgress = cbs?.onProgress;

	// Phase 1 — WASM init. The worker has its own module-init scope; we re-init Roaring here
	// because the BitmapIndex will be constructed inside this thread.
	await initializeBitmapAcceleration();

	// Phase 2 — corpus fetch. The three-tier chain (NDJSON -> JSON -> bundled default) lives in
	// `wineCorpusLoader` so it can be unit-tested. This file cannot be imported by a test at all:
	// `exposeFilterEngineWorker` below runs at module load and needs a real worker `self`.
	const { wines } = await loadWineCorpus(defaultWines, onProgress);

	// Phase 3 — engine construction inside the worker. The returned engine lives here for
	// the worker's lifetime; the main thread holds a Comlink proxy.
	//
	// **No pre-loaded rules.** Passing `config: wineFilterConfig` would start the engine
	// with the 11 filter rules already registered, so every user interaction would record
	// as `RULE_CHANGED` (because the rule already exists) — the devtools action log could
	// never show `addRule` or `removeRule` entries organically. So, by design, the engine
	// is left empty at boot. Filter
	// controls handle `undefined` rules by falling back to default displayed values
	// (`rule?.config.set ?? []`, etc.). The first user click on any filter dispatches a
	// real `addRule`; subsequent edits become `changeRule`; clicking the X on a chip
	// dispatches `removeRule`. All three categories show up in the log as the user
	// interacts naturally.
	return createFilterEngine<Wine>({
		sourceData: wines,
	});
};

// Register the factory + expose the worker. `wrapInWorker({ factoryName: 'wineEngine' })`
// on the main thread picks this up by name.
exposeFilterEngineWorker({
	wineEngine: wineEngineFactory,
});
