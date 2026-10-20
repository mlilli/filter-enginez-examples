/**
 * Vue Router config for the Vue app. Client-side history routing — the plain-SPA counterpart to the
 * React apps' `AppRouter` and SvelteKit's file routes.
 *
 * @packageDocumentation
 */

import { applyPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { shallowRef } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import LandingPage from './pages/LandingPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';

/**
 * The app routes. `/books`, `/real-estate` and `/wine` boot their client-side engines; the trailing
 * catch-all renders the shared "filtered to zero" 404 for any unmatched path (Vue Router's
 * `/:pathMatch(.*)*` — the SPA counterpart to React's `path: '*'` and SvelteKit's `+error.svelte`).
 *
 * **Every dataset route is lazy** (`() => import(...)`), and only the landing hub and the 404 are
 * static imports. A dataset page carries the engine — the core plus the WebAssembly bitmap library
 * it initializes, the largest dependency in the app — and its own panel and controls, while the hub
 * is a header and three links. A static import here would put all of that on the first screen of
 * every visitor, including the ones who only came for the hub; lazy, the hub loads the router, the
 * header and the cards, and each dataset arrives with the route that shows it.
 * `startupBudget.test.ts` holds the hub to that through the build's startup budget.
 *
 * `/wine` has a second reason: it reaches the Vite `?worker` module and the Comlink bridge.
 */
const routes: RouteRecordRaw[] = [
	{ component: LandingPage, name: 'landing', path: '/' },
	{ component: async () => import('./pages/BooksPage.vue'), name: 'books', path: '/books' },
	{ component: async () => import('./pages/RealEstatePage.vue'), name: 'real-estate', path: '/real-estate' },
	{ component: async () => import('./pages/WinePage.vue'), name: 'wine', path: '/wine' },
	{ component: NotFoundPage, name: 'not-found', path: '/:pathMatch(.*)*' },
];

/** The configured router — mounted in `main.ts`. */
export const router = createRouter({
	history: createWebHistory(),
	routes,
});

/** A navigation that failed, and what it threw. */
export interface PageFailure {
	/** What the router reported; anything, since a lazy import or a guard can throw anything. */
	readonly error: unknown;
}

/**
 * The failure the page being opened hit, or `null` while every navigation succeeds.
 *
 * @remarks
 * A lazy route whose code does not load (a dropped connection, or a deploy that replaced the chunk an
 * open tab asks for) fails its navigation, and Vue Router reports it to `onError` and renders nothing
 * new: on a first visit, nothing at all. `App.vue` shows the shared page-error screen while this is
 * set, and the next navigation that succeeds clears it.
 */
export const pageFailure = shallowRef<PageFailure | null>(null);

router.onError((error) => {
	pageFailure.value = { error };
});

// Each route's title, description and canonical URL, written after every navigation, the first
// included: one static shell serves every route, so the head has to follow the route
// (`examples-shared/page-meta`). A change of query alone (a filter state in `?f=`) keeps the path, and
// writing the same tags again is harmless.
router.afterEach((to, _from, failure) => {
	if (failure === undefined) {
		pageFailure.value = null;
	}
	applyPageMeta(document, verticalPageMeta('vue', to.path));
});
