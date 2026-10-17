/**
 * The `/books-server` route's data: an HTTP-backed engine behind the RxJS surface, or the reason
 * there isn't one.
 *
 * @remarks
 * Loaded on demand by the route's resolver in `app.routes.ts`, for the same reason as
 * `books-route-data.ts`: the transport and the RxJS surface belong to this route, not to the landing
 * page's startup chunks.
 *
 * It imports `createHttpFilterEngine` from the narrow `./books-server-engine` subpath, NOT
 * `./books-server-core` — the latter re-exports `bootBooksServerEngine`, which wraps the transport in
 * `createSignalsEngineFromAsync` and would re-admit `@preact/signals-core` through the back door. The
 * transport is surface-neutral; only the boot around it isn't.
 *
 * ### A routine failure, so it never rejects
 *
 * Unlike `/books`, this route has an ordinary failure — the Node process isn't running — so the load
 * catches it, reports it as route data, and lets the page render an offline screen. A rejected
 * resolver aborts the navigation, which would present a dead server as a page that simply doesn't
 * respond to the click.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createHttpFilterEngine } from '@filter-enginez/examples-shared/books-server-engine';
import { createRxJsEngineFromAsync, type RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { readConfigFromUrl } from '../url/url-state.js';

/**
 * What the `/books-server` resolver puts on the route's `data`.
 *
 * @remarks
 * Deliberately NOT `BooksRouteData`: the engine is nullable, because "the filtering server isn't
 * running" is an ordinary outcome on this route rather than a bug. Boot metadata is carried as flat
 * scalars instead of a `BooksBootMeta` because none of that shape applies — there is no `mode:
 * 'main-thread'` here, and the boot measures a corpus fetch rather than an index build.
 */
export interface BooksServerRouteData {
	/** Corpus size, for the results header's "filtered from N total". Zero on a failed boot. */
	readonly bookCount: number;
	/** Wall-clock ms from first fetch to a usable engine. Zero on a failed boot. */
	readonly bootMs: number;
	/** The RxJS surface over the HTTP-backed async engine, or `null` when the server is unreachable. */
	readonly engine: RxJsEngine<Book> | null;
	/** Why the boot failed, or `null` on success. Exactly one of this and `engine` is non-null. */
	readonly error: Error | null;
}

/** Memoized for the same reason as `/books` — one engine, one subscription graph, one corpus fetch. */
let cachedServerRouteData: Promise<BooksServerRouteData> | null = null;

/**
 * Build the HTTP-backed engine and wrap it in the RxJS surface.
 *
 * @remarks
 * The URL config is loaded onto the transport BEFORE the adapter is constructed, so the adapter's
 * one-shot initial state pull already reflects the shared link — the same ordering `/books` uses, for
 * the same reason. On the transport that also means the shared state costs no extra round-trip.
 *
 * @returns Resolved route data — either a live engine or the error that stopped it.
 */
async function bootBooksServerRouteData(): Promise<BooksServerRouteData> {
	const startedAt = performance.now();

	try {
		const asyncEngine = createHttpFilterEngine();
		const urlConfig = readConfigFromUrl();

		if (urlConfig !== null) {
			try {
				await asyncEngine.loadConfig(urlConfig);
			} catch {
				// Malformed or incompatible link — open on the neutral corpus, as `/books` does.
			}
		}

		// This is where an unreachable server surfaces: the adapter awaits `getSourceData()`, which is
		// the corpus fetch. It also means the corpus is fully resident before anything renders, which is
		// what lets the filter panel read `core.getSourceData()` synchronously for its vocabularies.
		const engine = await createRxJsEngineFromAsync<Book>(asyncEngine);

		return {
			bookCount: engine.core.getSourceData().length,
			bootMs: performance.now() - startedAt,
			engine,
			error: null,
		};
	} catch (caught: unknown) {
		// Drop the memo so a later navigation retries rather than replaying a stale failure — someone
		// who starts the server and clicks back through should get a working page.
		cachedServerRouteData = null;

		return {
			bookCount: 0,
			bootMs: 0,
			engine: null,
			error: caught instanceof Error ? caught : new Error(String(caught)),
		};
	}
}

/**
 * Resolve the server-backed books engine.
 *
 * @returns The engine + boot metadata, or the failure, for the route's `data`. Never rejects.
 */
export async function loadBooksServerRouteData(): Promise<BooksServerRouteData> {
	cachedServerRouteData ??= bootBooksServerRouteData();

	return cachedServerRouteData;
}
