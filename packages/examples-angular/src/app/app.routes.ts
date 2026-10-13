/**
 * Route table for the Angular app — and the app's answer to "when does the engine boot?"
 *
 * @remarks
 * ### The resolver pattern
 *
 * Booting the books engine is asynchronous (acceleration init + corpus build), but Angular's DI
 * providers are synchronous. Every other vertical resolves that tension in its own idiom: React with a
 * `useEffect` + boot state, Svelte with an `await` block, Vue with `onMounted`. Angular's idiom is the
 * **route resolver** — it runs before activation, it can return a `Promise`, and the router will not
 * render the component until it settles.
 *
 * So `/books` resolves the booted engine into route data, and the page component republishes it into
 * component-scoped DI (see `books-page.component.ts`). The upshot is that the landing page paints
 * instantly and never waits on a corpus it doesn't use, and by the time any books component runs,
 * `injectFilterEngine()` is guaranteed to hand back a live engine — no null checks, no boot flags.
 *
 * `bootBooksCore()` is itself idempotent and cached, so re-navigating to `/books` costs nothing; the
 * `RxJsEngine` wrapper is memoized here for the same reason (one engine, one set of streams, one
 * subscription graph for the life of the tab).
 *
 * ### Why `/books-boot-core` and not `/books-core`
 *
 * The broader `./books-core` subpath re-exports BOTH boots — the bare one and `bootBooksEngine`, which
 * wraps it in `createSignalsEngine`. Importing it therefore drags `@preact/signals-core` into this
 * bundle, which is precisely what splitting the boot into its own module was meant to prevent. The
 * narrow `./books-boot-core` subpath exposes only the surface-neutral half, so the one vertical that
 * doesn't use signals doesn't ship them.
 *
 * The server-backed route below takes the same care for the same reason: it imports
 * `createHttpFilterEngine` from the narrow `./books-server-engine` subpath, NOT `./books-server-core`
 * — the latter re-exports `bootBooksServerEngine`, which wraps the transport in
 * `createSignalsEngineFromAsync` and would re-admit `@preact/signals-core` through the back door.
 * The transport is surface-neutral; only the boot around it isn't.
 *
 * ### Two resolvers, two failure contracts
 *
 * `booksResolver` may reject only if the corpus itself is broken, which is a bug. `booksServerResolver`
 * has a routine failure — the Node process isn't running — so it never rejects: it catches, reports the
 * failure as route data, and lets the page render an offline screen. A rejected resolver aborts the
 * navigation, which would present a dead server as a page that simply doesn't respond to the click.
 *
 * @packageDocumentation
 */

import type { ResolveFn, Routes } from '@angular/router';
import type { Book } from '@filter-enginez/mock-data/books';
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { type BooksBootMeta, bootBooksCore } from '@filter-enginez/examples-shared/books-boot-core';
import { createHttpFilterEngine } from '@filter-enginez/examples-shared/books-server-engine';
import {
	bootRealEstateCore,
	type RealEstateBootMeta,
} from '@filter-enginez/examples-shared/real-estate-boot-core';
import {
	createRxJsEngine,
	createRxJsEngineFromAsync,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';

import {
	deriveRealEstateFacets,
	type RealEstateFacets,
} from './real-estate/real-estate-facets.js';
import { readConfigFromUrl } from './url/url-state.js';

/** What the `/books` resolver puts on the route's `data`. */
export interface BooksRouteData {
	/** The RxJS reactive surface over the booted core. */
	readonly engine: RxJsEngine<Book>;
	/** Boot metadata (record count, boot duration, tier) for the results header. */
	readonly meta: BooksBootMeta;
}

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

/** The key `/books` route data is stored under — one constant, so the read site can't typo it. */
export const BOOKS_ROUTE_DATA_KEY = 'books';

/** The key `/books-server` route data is stored under. */
export const BOOKS_SERVER_ROUTE_DATA_KEY = 'booksServer';

/**
 * What the `/real-estate` resolver puts on the route's `data`.
 *
 * @remarks
 * Carries more than the books equivalent because this panel needs more than an engine: fourteen
 * sections' worth of vocabularies, slider extents, a location hierarchy and metro centroids, all
 * derived from the booted corpus in one pass here rather than repeatedly in the panel. See
 * `real-estate/real-estate-facets.ts` for why they are derived at the route.
 */
export interface RealEstateRouteData {
	/** The RxJS reactive surface over the booted core. */
	readonly engine: RxJsEngine<Listing>;
	/** Everything the panel needs that is not the engine. */
	readonly facets: RealEstateFacets;
	/** Boot metadata (record count, boot duration, tier) for the footer. */
	readonly meta: RealEstateBootMeta;
}

/** The key `/real-estate` route data is stored under. */
export const REAL_ESTATE_ROUTE_DATA_KEY = 'realEstate';

/**
 * Memoized wrapper so repeat navigations reuse one engine (and therefore one set of `shareReplay`ed
 * streams) rather than building a parallel subscription graph each time.
 */
let cachedRouteData: Promise<BooksRouteData> | null = null;

/**
 * Boot the books engine and wrap it in the RxJS surface.
 *
 * @returns The engine + boot metadata, for the route's `data`.
 */
export const booksResolver: ResolveFn<BooksRouteData> = async () => {
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
};

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
export const booksServerResolver: ResolveFn<BooksServerRouteData> = async () => {
	cachedServerRouteData ??= bootBooksServerRouteData();

	return cachedServerRouteData;
};

/** Memoized for the same reason `/books` is — one engine, one subscription graph, one corpus pass. */
let cachedRealEstateRouteData: Promise<RealEstateRouteData> | null = null;

/**
 * Boot the real-estate engine and wrap it in the RxJS surface.
 *
 * @remarks
 * The narrow `./real-estate-boot-core` subpath, NOT `./real-estate-core` — the latter re-exports
 * `realEstateEngine.js`, which wraps the core in `createSignalsEngine` and would pull
 * `@preact/signals-core` into the one vertical that does not use it. Exactly the relationship
 * `./books-boot-core` has to `./books-core`, and the reason both bare boots exist at all.
 *
 * The facets are derived here, once, from the BOOTED corpus — never from `real-estate-domain`'s
 * module-scope `listingLocationTree` / `listingMetroCenters`, which are computed at import time from
 * the statically-imported bundled copy and would undo the corpus code-split.
 *
 * Importing `real-estate-facets.js` also transitively imports `real-estate-domain`, whose
 * `ContainsAllRule` self-registers with `ruleRegistry` as a module side effect. That registration is
 * what lets the must-have-features facet survive a `?f` round trip, and it happens because this
 * graph is imported at all — worth knowing before anyone "cleans up" an import that looks unused.
 *
 * @returns The engine, the derived facets and boot metadata, for the route's `data`.
 */
export const realEstateResolver: ResolveFn<RealEstateRouteData> = async () => {
	cachedRealEstateRouteData ??= bootRealEstateCore().then(({ core, meta }) => {
		// Hydrate from a shared `?f` link BEFORE the engine is wrapped and anything subscribes — same
		// ordering, and the same reason, as `/books`.
		const urlConfig = readConfigFromUrl();

		if (urlConfig !== null) {
			try {
				core.loadConfig(urlConfig);
			} catch {
				// Malformed or incompatible link — open on the neutral corpus rather than failing the
				// navigation. A bad URL should never cost someone the page.
			}
		}

		return {
			engine: createRxJsEngine<Listing>(core),
			facets: deriveRealEstateFacets(core.getSourceData()),
			meta,
		};
	});

	return cachedRealEstateRouteData;
};

/**
 * The app routes. Every real page is lazy (`loadComponent`), so the landing bundle carries neither the
 * books corpus nor the engine.
 *
 * The catch-all renders the shared "filtered to zero" 404 rather than redirecting home. That is partly
 * parity with the other verticals and partly diagnostics: a redirecting catch-all makes an unmatched
 * route indistinguishable from a route that matched but failed, and both present as "I ended up back on
 * the homepage."
 */
export const routes: Routes = [
	{
		loadComponent: async () =>
			(await import('./pages/landing-page.component.js')).LandingPageComponent,
		path: '',
		pathMatch: 'full',
	},
	{
		loadComponent: async () => (await import('./pages/books-page.component.js')).BooksPageComponent,
		path: 'books',
		resolve: { [BOOKS_ROUTE_DATA_KEY]: booksResolver },
	},
	{
		loadComponent: async () =>
			(await import('./pages/books-server-page.component.js')).BooksServerPageComponent,
		path: 'books-server',
		resolve: { [BOOKS_SERVER_ROUTE_DATA_KEY]: booksServerResolver },
	},
	{
		loadComponent: async () =>
			(await import('./pages/real-estate-page.component.js')).RealEstatePageComponent,
		path: 'real-estate',
		resolve: { [REAL_ESTATE_ROUTE_DATA_KEY]: realEstateResolver },
	},
	{
		// NO RESOLVER, and that is the one route here where the idiom does not fit. A 130k worker boot
		// takes seconds, and a resolver that blocks navigation would leave the landing page frozen for
		// all of it. The page boots and renders its own progress instead — see `WineBootStore`.
		loadComponent: async () => (await import('./pages/wine-page.component.js')).WinePageComponent,
		path: 'wine',
	},
	{
		// No resolver and no corpus: this route renders links, not results.
		loadComponent: async () =>
			(await import('./pages/compare-page.component.js')).ComparePageComponent,
		path: 'compare',
	},
	{
		loadComponent: async () =>
			(await import('./pages/not-found-page.component.js')).NotFoundPageComponent,
		path: '**',
	},
];
