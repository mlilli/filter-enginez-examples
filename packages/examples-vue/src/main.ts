/**
 * Vue app entry — mounts the router-driven `<App>` and loads the shared visual system.
 *
 * @packageDocumentation
 */

import './app.css';

import { createApp } from 'vue';

import App from './App.vue';
import { router } from './router.js';

/**
 * Start MSW in dev before mounting, so the books boot's corpus stream (`/api/books?...`) has an API
 * to hit the moment it fires.
 *
 * @remarks
 * The registration itself is shared across all six verticals
 * (`@filter-enginez/examples-shared/mocks`); only this guard is per-app, because only the guard is
 * framework-specific. Keeping it a static `import.meta.env.DEV` check wrapped around a DYNAMIC
 * import is what lets Vite eliminate MSW from the production bundle entirely.
 *
 * The mount is deliberately sequenced AFTER the await: a route component that boots its engine on
 * setup would otherwise race the service worker's registration, and a corpus fetch that lands before
 * the worker controls the page falls through to the bundled fallback — silently, since that fallback
 * is a supported path rather than an error. The shared starter never throws, so there is nothing to
 * catch.
 */
async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV) {
		return;
	}
	const { startMockServiceWorker } = await import('@filter-enginez/examples-shared/mocks');

	await startMockServiceWorker();
}

void enableMocking().then(() => {
	createApp(App).use(router).mount('#app');
});
