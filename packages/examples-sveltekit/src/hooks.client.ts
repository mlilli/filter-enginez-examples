/**
 * SvelteKit client hooks — starts MSW in dev before the app takes over.
 *
 * @remarks
 * **Why `init` and not `onMount` in a layout.** SvelteKit awaits the `init` hook once, before the
 * client-side app starts, which is exactly the guarantee the corpus stream needs: the service worker
 * must be controlling the page before any `/api/<dataset>` fetch fires. A `+layout.svelte`
 * `onMount` runs after the first render has already begun, so the `/books` route's boot would race
 * the registration — and lose silently, because losing means falling through to the bundled corpus,
 * which is a supported path rather than an error.
 *
 * **Client-only by construction.** This file never executes during SSR, so there is no
 * `browser`-guard dance and no risk of dragging `msw/browser` into the server bundle. The `/books-server`
 * and `/wine-server` routes load their data in `+page.server.ts`, entirely server-side, so the
 * service worker never sees that traffic at all.
 *
 * The registration itself is shared across all six verticals
 * (`@filter-enginez/examples-shared/mocks`); only this guard is per-app, because only the guard is
 * framework-specific. `dev` from `$app/environment` is SvelteKit's idiom and is statically replaced
 * at build time, so the DYNAMIC import below is eliminated from the production bundle entirely.
 *
 * **This vertical is the one that needs the vendored service-worker patch most.** Its `/wine` route
  * runs the 150k worker tier, which streams `static/data-real-full.ndjson` when the local real corpus
 * is linked, and MSW's service worker intercepts worker-thread fetches. See the `FILTER ENGINEZ LOCAL PATCH` block in `static/mockServiceWorker.js`.
 *
 * @packageDocumentation
 */

import type { ClientInit } from '@sveltejs/kit';

import { dev } from '$app/environment';

/**
 * Runs once, before the client-side app starts. Awaited by SvelteKit, so everything downstream can
 * assume the mock API is live in dev.
 */
export const init: ClientInit = async () => {
	if (!dev) {
		return;
	}
	const { startMockServiceWorker } = await import('@filter-enginez/examples-shared/mocks');

	await startMockServiceWorker();
};
