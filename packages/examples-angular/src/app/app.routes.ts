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
 * component-scoped DI (see `books-page.component.ts`). By the time any books component runs,
 * `injectFilterEngine()` is guaranteed to hand back a live engine — no null checks, no boot flags.
 *
 * ### Everything behind a route loads with the route
 *
 * The landing hub is the one eager page (`component:`), so the first screen needs no request beyond
 * the startup chunks. Every other page is a `loadComponent`, and every resolver `import()`s the module
 * that does its work — `books/books-route-data.ts`, `books/books-server-route-data.ts`,
 * `real-estate/real-estate-route-data.ts`. Those modules carry the engine (the core plus the
 * WebAssembly bitmap library it initializes) and the RxJS surface, so this file imports nothing from
 * them but types: a static import of one would put the engine on the landing page's startup graph.
 * `tests/tooling/startupBudget.test.ts` holds the build to that through its startup budget.
 *
 * The router loads a route's component only after its resolvers settle, so each resolver also starts
 * the page's own chunk downloading ({@link resolveWithPage}); by the time the boot finishes, the
 * component is already in the module cache rather than one more round trip away.
 *
 * ### A first frame while the resolver works
 *
 * A resolver holds activation, so a direct visit to `/books` would otherwise show an empty page until
 * the engine had booted. Each booting route names its cold-start caption in its static `data`
 * ({@link ROUTE_BOOT_CAPTION_KEY}), and the root component draws it while the outlet is still empty —
 * see `app.component.ts`.
 *
 * ### Two failure contracts
 *
 * The `/books` and `/real-estate` loads may reject only if the corpus itself is broken, which is a
 * bug. `/books-server` has a routine failure — the Node process isn't running — so its load never
 * rejects: it catches, reports the failure as route data, and lets the page render an offline screen.
 * A rejected resolver aborts the navigation, which would present a dead server as a page that simply
 * doesn't respond to the click.
 *
 * @packageDocumentation
 */

import type { Type } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';

import {
	BOOKS_BOOT_IDLE_CAPTION,
	BOOKS_RECORD_NOUN,
	bootCaptionParts,
	bootCaptionText,
	REAL_ESTATE_BOOT_IDLE_CAPTION,
	REAL_ESTATE_RECORD_NOUN,
} from '@filter-enginez/examples-shared/boot-caption';

import type { BooksRouteData } from './books/books-route-data.js';
import type { BooksServerRouteData } from './books/books-server-route-data.js';
import type { RealEstateRouteData } from './real-estate/real-estate-route-data.js';

import { LandingPageComponent } from './pages/landing-page.component.js';

export type { BooksRouteData, BooksServerRouteData, RealEstateRouteData };

/** The key `/books` route data is stored under — one constant, so the read site can't typo it. */
export const BOOKS_ROUTE_DATA_KEY = 'books';

/** The key `/books-server` route data is stored under. */
export const BOOKS_SERVER_ROUTE_DATA_KEY = 'booksServer';

/** The key `/real-estate` route data is stored under. */
export const REAL_ESTATE_ROUTE_DATA_KEY = 'realEstate';

/**
 * The static-`data` key under which a booting route names the caption the root component shows
 * while that route's resolver works.
 *
 * @remarks
 * Static data rather than anything the resolver produces, because the caption has to be readable the
 * moment the route is recognized, before a byte of the route's own code has arrived.
 */
export const ROUTE_BOOT_CAPTION_KEY = 'bootCaption';

/**
 * The idle caption for a dataset route, worded by the one module every vertical renders.
 *
 * @param idleCaption - The dataset's cold-start sentence.
 * @param recordNoun - The dataset's plural record noun.
 * @returns The caption as plain text: before any progress it has no value to highlight.
 */
function idleBootCaption(idleCaption: string, recordNoun: string): string {
	return bootCaptionText(bootCaptionParts(null, { idleCaption, recordNoun }));
}

/**
 * Run a route's data load and fetch its page chunk at the same time.
 *
 * @remarks
 * The router asks for `loadComponent` only once every resolver on the route has settled, so on its
 * own a booting route pays its download sequence end to end: resolver module, boot, page module.
 * Starting the page's `import()` here as well overlaps the last of those with the boot; the router's
 * own `loadComponent` call then finds the module already loaded. A failed page download rejects the
 * resolver, which ends the navigation exactly as a failed `loadComponent` would.
 *
 * @typeParam T - The route data.
 * @param loadPage - The route's `loadComponent`.
 * @param loadData - Imports the route's data module and runs its load.
 * @returns The route data.
 */
async function resolveWithPage<T>(loadPage: () => Promise<unknown>, loadData: () => Promise<T>): Promise<T> {
	const [data] = await Promise.all([loadData(), loadPage()]);

	return data;
}

/** `/books`' page component, loaded on demand. */
const loadBooksPage = async (): Promise<Type<unknown>> =>
	(await import('./pages/books-page.component.js')).BooksPageComponent;

/** `/books-server`'s page component, loaded on demand. */
const loadBooksServerPage = async (): Promise<Type<unknown>> =>
	(await import('./pages/books-server-page.component.js')).BooksServerPageComponent;

/** `/real-estate`'s page component, loaded on demand. */
const loadRealEstatePage = async (): Promise<Type<unknown>> =>
	(await import('./pages/real-estate-page.component.js')).RealEstatePageComponent;

/**
 * Resolve `/books`: boot the books engine behind the RxJS surface (`books/books-route-data.ts`).
 *
 * @returns The engine + boot metadata, for the route's `data`.
 */
export const booksResolver: ResolveFn<BooksRouteData> = async () =>
	resolveWithPage(loadBooksPage, async () => (await import('./books/books-route-data.js')).loadBooksRouteData());

/**
 * Resolve `/books-server`: the HTTP-backed engine, or the error that stopped it
 * (`books/books-server-route-data.ts`). Never rejects on an unreachable server.
 *
 * @returns The engine + boot metadata, or the failure, for the route's `data`.
 */
export const booksServerResolver: ResolveFn<BooksServerRouteData> = async () =>
	resolveWithPage(
		loadBooksServerPage,
		async () => (await import('./books/books-server-route-data.js')).loadBooksServerRouteData(),
	);

/**
 * Resolve `/real-estate`: boot the real-estate engine and derive its panel's facets
 * (`real-estate/real-estate-route-data.ts`).
 *
 * @returns The engine, the derived facets and boot metadata, for the route's `data`.
 */
export const realEstateResolver: ResolveFn<RealEstateRouteData> = async () =>
	resolveWithPage(
		loadRealEstatePage,
		async () => (await import('./real-estate/real-estate-route-data.js')).loadRealEstateRouteData(),
	);

/**
 * The app routes. The landing hub is eager; every other page, and everything a resolver boots, loads
 * with its route, so the landing page's startup chunks carry neither a corpus nor the engine.
 *
 * The catch-all renders the shared "filtered to zero" 404 rather than redirecting home. That is partly
 * parity with the other verticals and partly diagnostics: a redirecting catch-all makes an unmatched
 * route indistinguishable from a route that matched but failed, and both present as "I ended up back on
 * the homepage."
 */
export const routes: Routes = [
	{
		component: LandingPageComponent,
		path: '',
		pathMatch: 'full',
	},
	{
		data: { [ROUTE_BOOT_CAPTION_KEY]: idleBootCaption(BOOKS_BOOT_IDLE_CAPTION, BOOKS_RECORD_NOUN) },
		loadComponent: loadBooksPage,
		path: 'books',
		resolve: { [BOOKS_ROUTE_DATA_KEY]: booksResolver },
	},
	{
		loadComponent: loadBooksServerPage,
		path: 'books-server',
		resolve: { [BOOKS_SERVER_ROUTE_DATA_KEY]: booksServerResolver },
	},
	{
		data: { [ROUTE_BOOT_CAPTION_KEY]: idleBootCaption(REAL_ESTATE_BOOT_IDLE_CAPTION, REAL_ESTATE_RECORD_NOUN) },
		loadComponent: loadRealEstatePage,
		path: 'real-estate',
		resolve: { [REAL_ESTATE_ROUTE_DATA_KEY]: realEstateResolver },
	},
	{
		// NO RESOLVER, and that is the one route here where the idiom does not fit. A 150k worker boot
		// takes seconds, and a resolver that blocks navigation would leave the landing page frozen for
		// all of it. The page boots and renders its own progress instead — see `WineBootStore`.
		loadComponent: async () => (await import('./pages/wine-page.component.js')).WinePageComponent,
		path: 'wine',
	},
	{
		loadComponent: async () =>
			(await import('./pages/not-found-page.component.js')).NotFoundPageComponent,
		path: '**',
	},
];
