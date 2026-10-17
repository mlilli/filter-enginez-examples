/**
 * The `/books` route's data: the booted books engine behind the RxJS surface.
 *
 * @remarks
 * Loaded on demand by the route's resolver in `app.routes.ts` (a dynamic `import()`), never imported
 * statically by anything on the startup graph. This module is what carries the engine — the
 * surface-neutral boot, the core and the WebAssembly bitmap library it initializes — so a static
 * import of it would put all of that in the landing page's startup chunks.
 *
 * ### Why `/books-boot-core` and not `/books-core`
 *
 * The broader `./books-core` subpath re-exports BOTH boots — the bare one and `bootBooksEngine`, which
 * wraps it in `createSignalsEngine`. Importing it therefore drags `@preact/signals-core` into this
 * bundle, which is precisely what splitting the boot into its own module was meant to prevent. The
 * narrow `./books-boot-core` subpath exposes only the surface-neutral half, so the one vertical that
 * doesn't use signals doesn't ship them.
 *
 * `bootBooksCore()` is itself idempotent and cached, so re-navigating to `/books` costs nothing; the
 * `RxJsEngine` wrapper is memoized here for the same reason (one engine, one set of streams, one
 * subscription graph for the life of the tab).
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { type BooksBootMeta, bootBooksCore } from '@filter-enginez/examples-shared/books-boot-core';
import { createRxJsEngine, type RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { readConfigFromUrl } from '../url/url-state.js';

/** What the `/books` resolver puts on the route's `data`. */
export interface BooksRouteData {
	/** The RxJS reactive surface over the booted core. */
	readonly engine: RxJsEngine<Book>;
	/** Boot metadata (record count, boot duration, tier) for the results header. */
	readonly meta: BooksBootMeta;
}

/**
 * Memoized so repeat navigations reuse one engine (and therefore one set of `shareReplay`ed streams)
 * rather than building a parallel subscription graph each time.
 */
let cachedRouteData: Promise<BooksRouteData> | null = null;

/**
 * Boot the books engine and wrap it in the RxJS surface.
 *
 * @remarks
 * May reject only if the corpus itself is broken, which is a bug; a rejection aborts the navigation,
 * and `main.ts`'s navigation-error handler reports it.
 *
 * @returns The engine + boot metadata, for the route's `data`.
 */
export async function loadBooksRouteData(): Promise<BooksRouteData> {
	cachedRouteData ??= bootBooksCore().then(({ core, meta }) => {
		// Hydrate from a shared `?f` link BEFORE the engine is wrapped and anything subscribes.
		// `loadConfig` fires its change synchronously, so restoring first avoids an immediate,
		// redundant write straight back to the URL.
		const urlConfig = readConfigFromUrl();

		if (urlConfig !== null) {
			try {
				core.loadConfig(urlConfig);
			} catch {
				// Malformed or incompatible link — open on the neutral corpus rather than failing the
				// navigation. A bad URL should never cost someone the page.
			}
		}

		return { engine: createRxJsEngine<Book>(core), meta };
	});

	return cachedRouteData;
}
