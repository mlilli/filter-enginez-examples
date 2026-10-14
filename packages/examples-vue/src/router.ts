/**
 * Vue Router config for the Vue app. Client-side history routing — the plain-SPA counterpart to the
 * React apps' `createBrowserRouter` and SvelteKit's file routes.
 *
 * @packageDocumentation
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import BooksPage from './pages/BooksPage.vue';
import LandingPage from './pages/LandingPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import RealEstatePage from './pages/RealEstatePage.vue';

/**
 * The app routes. `/books` and `/real-estate` boot their client-side engines; the trailing catch-all renders the shared "filtered to zero" 404
 * for any unmatched path (Vue Router's `/:pathMatch(.*)*` — the SPA counterpart to React's `path: '*'`
 * and SvelteKit's `+error.svelte`).
 *
 * Both dataset routes are STATIC imports. Leaflet, the one dependency heavy and browser-coupled enough
 * to want splitting, is already dynamically imported two levels inside `/real-estate` — so a route-level
 * `() => import(...)` would only defer code the router is about to need anyway.
 */
const routes: RouteRecordRaw[] = [
	{ component: LandingPage, name: 'landing', path: '/' },
	{ component: BooksPage, name: 'books', path: '/books' },
	{ component: RealEstatePage, name: 'real-estate', path: '/real-estate' },
	// The one route that is NOT a static import. `/wine` reaches the Vite `?worker` module and the
	// Comlink bridge, so a static import would pull the worker chunk into the initial bundle for
	// every visitor — including the ones who only wanted `/books`. Lazy is the honest default here;
	// the docblock above explains why the other routes are not.
	{ component: async () => import('./pages/WinePage.vue'), name: 'wine', path: '/wine' },
	{ component: NotFoundPage, name: 'not-found', path: '/:pathMatch(.*)*' },
];

/** The configured router — mounted in `main.ts`. */
export const router = createRouter({
	history: createWebHistory(),
	routes,
});
