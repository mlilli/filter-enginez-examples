/**
 * `bootBooksServerEngine` — construct the `SignalsEngine<Book>` for a server-backed books route.
 *
 * @remarks
 * Mirrors `bootBooksEngine` (the in-browser books boot) but feeds `createSignalsEngineFromAsync` an
 * HTTP-backed `FilterEngineAsync` ({@link createHttpFilterEngine}) instead of a main-thread engine —
 * so the whole reactive stack + the exact app component tree work unchanged, with the server doing the
 * filtering. Framework-neutral: the React `/books-server` route and the SvelteKit `/books-server` route
 * both boot through here (the SvelteKit vertical passes `{ baseUrl: '/books-server' }` to target its
 * own in-process `+server.ts` endpoints; React uses the default `/api` proxy). The returned
 * `SignalsEngine` resolves once the corpus + initial state have been pulled from the server.
 *
 * Lives beside the transport in the React-free `./books` slice and is reachable via the
 * `@filter-enginez/examples-shared/books-server-core` subpath, so a non-React consumer (SvelteKit) can
 * import it without dragging React into its graph — exactly like `./books-core`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';

import { createHttpFilterEngine, type HttpFilterEngineOptions } from './serverEngine.js';

/**
 * Boot the server-backed books engine.
 *
 * @param options - Transport configuration forwarded to {@link createHttpFilterEngine}.
 * @returns A `SignalsEngine<Book>` whose surface is identical to the in-browser books engine.
 * @throws When the server is unreachable (the corpus fetch / initial state pull rejects) — the route
 *   surfaces this as its offline state.
 */
export async function bootBooksServerEngine(options?: HttpFilterEngineOptions): Promise<SignalsEngine<Book>> {
	const asyncEngine = createHttpFilterEngine(options);

	return createSignalsEngineFromAsync<Book>(asyncEngine);
}

export { createHttpFilterEngine, type HttpFilterEngineOptions } from './serverEngine.js';
