/**
 * App entry for the framework-less vertical — loads the shared visual system and starts the
 * hand-written router.
 *
 * @remarks
 * The whole bootstrap is: import the stylesheet, find the root element, register routes, go. There is
 * no `createApp` / `createRoot` / `mount` because there is no framework — which is precisely the claim
 * this vertical exists to demonstrate.
 *
 * @packageDocumentation
 */

import './app.css';

import { renderAboutPage } from './pages/aboutPage.js';
import { renderBooksPage } from './pages/booksPage.js';
import { renderBooksRawPage } from './pages/booksRawPage.js';
import { renderComparePage } from './pages/comparePage.js';
import { renderLandingPage } from './pages/landingPage.js';
import { renderNotFoundPage } from './pages/notFoundPage.js';
import { renderRealEstatePage } from './pages/realEstatePage.js';
import { renderWinePage } from './pages/winePage.js';
import { renderWineServerPage } from './pages/wineServerPage.js';
import { type Route, startRouter } from './router.js';

/**
 * The route table. `/books` and `/books-raw` render the SAME view over the two reactive surfaces —
 * fine-grained signals vs one coarse subscribe. `/real-estate` is the second dataset and the widest
 * panel here — fourteen sections, including a lazily-loaded Leaflet map. `/about` is the shared
 * narrative, and the trailing `'*'` catch-all renders the shared "filtered to zero" 404.
 */
const routes: readonly Route[] = [
	{ path: '/', render: renderLandingPage },
	{ path: '/books', render: renderBooksPage },
	{ path: '/books-raw', render: renderBooksRawPage },
	{ path: '/real-estate', render: renderRealEstatePage },
	{ path: '/wine', render: renderWinePage },
	// The same wine app with the filtering moved off the browser entirely — over HTTP to
	// `examples-server`, where SvelteKit's equivalent runs the core in its own Node tier. Between the
	// two, the repo shows both server-tier arrangements of one engine rather than one twice.
	{ path: '/wine-server', render: renderWineServerPage },
	{ path: '/about', render: renderAboutPage },
	// Before the catch-all. No engine and no corpus — it renders links, not results.
	{ path: '/compare', render: renderComparePage },
	{ path: '*', render: renderNotFoundPage },
];

const root = document.querySelector<HTMLElement>('#app');

if (root === null) {
	throw new Error('#app root element is missing from index.html');
}

/**
 * Start MSW in dev before the router runs, so each dataset's corpus stream (`/api/books?...`,
 * `/api/real-estate`) has an API to hit the moment it fires.
 *
 * @remarks
 * The registration itself is shared across all six verticals
 * (`@filter-enginez/examples-shared/mocks`); only this guard is per-app, because only the guard is
 * framework-specific. Keeping it a static `import.meta.env.DEV` check wrapped around a DYNAMIC
 * import is what lets Vite eliminate MSW from the production bundle entirely.
 *
 * `startRouter` is sequenced AFTER the await for the same reason every other vertical awaits before
 * its first render: `/books` and `/real-estate` boot their engines on render, and a corpus fetch that
 * lands before the service worker controls the page falls through to the bundled fallback — silently,
 * since that fallback is a supported path rather than an error. The shared starter never throws.
 *
 * This is the one vertical where "before the first render" is literally one function call away,
 * which is rather the point of the exercise.
 */
async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV) {
		return;
	}
	const { startMockServiceWorker } = await import('@filter-enginez/examples-shared/mocks');

	await startMockServiceWorker();
}

void enableMocking().then(() => {
	startRouter(root, routes);
});
