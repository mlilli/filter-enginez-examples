/**
 * Vue Router config for the Vue app. Client-side history routing — the plain-SPA counterpart to the
 * React apps' `createBrowserRouter` and SvelteKit's file routes.
 *
 * @packageDocumentation
 */

import { applyPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
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

// Each route's title, description and canonical URL, written after every navigation, the first
// included: one static shell serves every route, so the head has to follow the route
// (`examples-shared/page-meta`). A change of query alone (a filter state in `?f=`) keeps the path, and
// writing the same tags again is harmless.
router.afterEach((to) => {
	applyPageMeta(document, verticalPageMeta('vue', to.path));
});
