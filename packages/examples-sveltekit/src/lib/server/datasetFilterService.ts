/**
 * `datasetFilterService` — the SvelteKit vertical's **in-process** server-filtering brain, shared by
 * every server-backed route (`/books-server`, `/wine-server`).
 *
 * @remarks
 * This is what makes the server-backed routes a genuinely SvelteKit-native server-filtering story
 * rather than a proxy: the SvelteKit server — Node locally, a Cloudflare Worker when deployed — runs
 * the isomorphic Filter EngineZ core *itself*, reusing the exact pure functions the standalone
 * `@filter-enginez/examples-server` exposes (`applyConfigQuery` + `getDataset`). No separate
 * `serve:api` process, no HTTP proxy, no CORS
 * — the `+server.ts` endpoints and the `+page.server.ts` `load`s all call straight through here.
 *
 * Dataset-agnostic by construction: every function takes a `dataset` id and `getDataset` resolves it,
 * so books and wine (and any other dataset registered in `examples-server`) share one implementation.
 * Lives under `$lib/server/` so SvelteKit guarantees it (and therefore the Node-only
 * `@filter-enginez/examples-server` import) never leaks into the client bundle.
 *
 * Roaring-bitmap acceleration is initialized **once** here — `initializeBitmapAcceleration()` is
 * idempotent (concurrent callers share one promise; later callers resolve immediately), so gating
 * every query on `ensureAcceleration()` costs nothing after the first call and mirrors what the
 * standalone server does before it binds its port.
 *
 * **Acceleration is an optimization, never a precondition.** The deployed build runs on Cloudflare
 * Workers, which refuse to compile WebAssembly from bytes at runtime — exactly what `roaring-wasm`
 * does — so there the init rejects. The engine's predicate path returns identical results, so a
 * failed init is logged once and every query proceeds without bitmaps, rather than turning each
 * request into a 500.
 *
 * @packageDocumentation
 */

import { type FilterBundleQuery, type FilterEngineConfig, initializeBitmapAcceleration } from '@filter-enginez/core';
import { applyConfigQuery, getDataset, type QueryResult } from '@filter-enginez/examples-server';

/** Memoized roaring-init attempt — the first query awaits it; subsequent queries resolve instantly. */
let accelerationAttempt: Promise<void> | null = null;

/**
 * Try to initialize roaring-bitmap acceleration before the first `createFilterEngine`.
 *
 * @returns A promise that always resolves: on a runtime that cannot load the WASM module, the engine
 *   filters on its predicate path instead.
 */
async function ensureAcceleration(): Promise<void> {
	accelerationAttempt ??= initializeBitmapAcceleration().catch((error: unknown) => {
		console.warn('[datasetFilterService] bitmap acceleration is unavailable on this runtime; filtering without it.', error);
	});

	return accelerationAttempt;
}

/** Input to {@link runDatasetQuery} — the transport / SSR payload. */
export interface RunQueryInput {
	/** The JSON filter config to apply. */
	readonly config: FilterEngineConfig;
	/** Dataset id (e.g. `books`, `wine`). */
	readonly dataset: string;
	/** Max materialized result records (`0` = indices only, the mirror-sync fast path). */
	readonly limit?: number;
	/** The predictive-disable facet query; omitted → server derives a default, `{}` → skip facets. */
	readonly query?: FilterBundleQuery;
}

/**
 * Filter a dataset by a JSON config (+ optional facet query) using the in-process isomorphic core.
 *
 * @param input - Config, dataset, limit, and optional facet query.
 * @returns The JSON-safe {@link QueryResult} (results + predictive-disable metadata).
 * @throws `UnknownDatasetError` when `input.dataset` is not registered (the endpoint maps it to 404).
 */
export async function runDatasetQuery(input: RunQueryInput): Promise<QueryResult> {
	await ensureAcceleration();

	return applyConfigQuery(input.dataset, input.config, { limit: input.limit ?? 0, query: input.query });
}

/**
 * Return a dataset's full corpus (the resident copy the browser transport fetches once at boot, and
 * the source the no-JS SSR grid materializes from).
 *
 * @param dataset - Dataset id.
 * @returns The corpus records.
 * @throws `UnknownDatasetError` when `dataset` is not registered.
 */
export function loadDatasetCorpus(dataset: string): readonly unknown[] {
	return getDataset(dataset).sourceData;
}
