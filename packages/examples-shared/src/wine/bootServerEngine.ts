/**
 * `bootWineServerEngine` — construct the `SignalsEngine<Wine>` for the server-backed wine route.
 *
 * @remarks
 * The wine twin of `bootBooksServerEngine`: it feeds `createSignalsEngineFromAsync` an HTTP-backed
 * `FilterEngineAsync<Wine>` ({@link createHttpFilterEngine} with `<Wine>` + `dataset: 'wine'`) instead
 * of the Comlink worker engine the in-browser `/wine` route uses — so the whole reactive stack and the
 * exact `<WineView>` component tree work unchanged, with the SvelteKit server tier doing the filtering.
 *
 * Framework-neutral and React-free (the transport pulls in `core` + `reactive-signals/worker` +
 * `worker-bridge`, never React), so the SvelteKit `/wine-server` route imports it through the
 * `@filter-enginez/examples-shared/wine-server-core` subpath without dragging React into its graph —
 * exactly like `./wine-core`. The route passes `{ baseUrl: '/wine-server' }` to target its own
 * in-process `+server.ts` endpoints.
 *
 * The returned `SignalsEngine` resolves once the corpus + initial state have been pulled from the
 * server; `engine.core.getSourceData()` then hands back the resident wine corpus the route derives its
 * slider baselines, chip vocabularies and origin tree from — the same shape the worker tier ships to
 * the main thread once at boot.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';

import { createHttpFilterEngine, type HttpFilterEngineOptions } from '../books/serverEngine.js';

/**
 * Boot the server-backed wine engine.
 *
 * @param options - Transport configuration forwarded to {@link createHttpFilterEngine}. `dataset`
 *   defaults to `wine` here so a caller only has to set `baseUrl`.
 * @returns A `SignalsEngine<Wine>` whose surface is identical to the in-browser wine engine.
 * @throws When the server is unreachable (the corpus fetch / initial state pull rejects) — the route
 *   surfaces this as its offline state.
 */
export async function bootWineServerEngine(options?: HttpFilterEngineOptions): Promise<SignalsEngine<Wine>> {
	const asyncEngine = createHttpFilterEngine<Wine>({ dataset: 'wine', ...options });

	return createSignalsEngineFromAsync<Wine>(asyncEngine);
}

export { createHttpFilterEngine, type HttpFilterEngineOptions } from '../books/serverEngine.js';
