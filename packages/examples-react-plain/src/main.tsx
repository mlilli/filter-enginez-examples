/**
 * React entry point. Mounts `<App />` into the `#root` element from `index.html`.
 *
 * @remarks
 * Vite + React 19 + StrictMode. `<App />` is a react-router browser router (landing page, `/lab`,
 * `/compare`, the dataset routes and the 404); each dataset route syncs its filter state to the URL
 * through url-state-router's `<FilterEngineUrlSync>`.
 */

import './globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const rootElement = document.getElementById('root');

if (rootElement === null) {
	throw new Error('main.tsx: #root element not found in index.html');
}

/**
 * Start MSW in dev before rendering, so every route's corpus stream (`/api/wine`, `/api/books`,
 * `/api/real-estate`) has an API to hit the moment it fires. Dynamic import + `import.meta.env.DEV`
 * guard keep MSW and its handlers out of the production bundle entirely.
 *
 * **Always-on, deliberately.** Not gated on `VITE_WINE_TIER`: books and real estate stream their
 * default tiers too (via `loadDefaultTierCorpus`), on every route and in every dev run, so gating on
 * a wine-specific env var would silently drop them onto their bundled fallbacks. One service worker
 * serves the whole app, whatever the tier.
 *
 * **Keeping the full corpus out of the service worker.** The `/wine` route's worker tier fetches the
 * ~116 MB `/data-real-full.ndjson` from inside a Web Worker, and MSW's service worker DOES intercept
 * worker-thread fetches — with the SW in that path, the worker silently falls back to the 10k tier.
 * Two layers keep it out: an explicit passthrough handler in `@filter-enginez/examples-shared/mocks`,
 * and a local patch in `public/mockServiceWorker.js` that returns from the `fetch` listener without
 * calling `respondWith` at all, so the browser services those files natively.
 *
 * **The registration itself is shared.** All six verticals call the same
 * `startMockServiceWorker()`; only this guard is per-app, because only the guard is
 * framework-specific — and keeping it a static `import.meta.env.DEV` check around a DYNAMIC import
 * is what lets Vite drop MSW from the production bundle entirely. The shared function never throws,
 * so there is nothing to catch here.
 */
async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV) {
		return;
	}
	const { startMockServiceWorker } = await import('@filter-enginez/examples-shared/mocks');

	await startMockServiceWorker();
}

void enableMocking().then(() => {
	createRoot(rootElement).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
});
