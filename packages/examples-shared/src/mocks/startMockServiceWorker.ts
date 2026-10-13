/**
 * `startMockServiceWorker` — the one MSW browser-worker registration shared by every demo app.
 *
 * @remarks
 * **Why this lives in `examples-shared` rather than in each app.** Six verticals (two React, plus
 * SvelteKit, Vue, Angular, and the framework-less one) need byte-identical MSW wiring: the same
 * handler set, the same full-corpus passthrough, the same start options. Six copies of that is
 * exactly the duplication the DRY contract forbids, and it would put `msw` in six `package.json`s
 * while leaving six places to forget when a handler changes. Here it is one module, one dependency,
 * one place.
 *
 * What deliberately does NOT live here is the dev guard. Each vertical asks "am I in development?"
 * in its own idiom — `import.meta.env.DEV` under Vite, `dev` from `$app/environment` under SvelteKit,
 * `isDevMode()` under Angular — and keeping that check in the app, wrapped around a DYNAMIC import of
 * this module, is what lets each bundler eliminate MSW from its production build entirely. Move the
 * guard in here and every app ships a chunk it never loads. So the app-side call is:
 *
 * ```ts
 * if (import.meta.env.DEV) {
 *   await (await import('@filter-enginez/examples-shared/mocks')).startMockServiceWorker();
 * }
 * ```
 *
 * **Always-on, all three datasets.** Every route's default tier streams its corpus over
 * `GET /api/<dataset>?tier=&limit=&offset=` (see `../data/loadDefaultTierCorpus.ts`) instead of
 * statically importing it, so wine, books, AND real estate all need handlers registered — hence
 * `allHandlers`. Registration is cheap: each per-dataset handler module in `mock-data` loads its
 * corpus through a dynamic import, so `setupWorker` costs nothing until a request arrives.
 *
 * **Why the server-backed routes still reach their real backends.** The React apps proxy `/api/*` to
 * `@filter-enginez/examples-server` on :8787 (prefix stripped) for `/books-server`, and SvelteKit's
 * `/books-server` + `/wine-server` hit their own in-process endpoints under those route paths. None
 * of those URLs collide with the `/api/<dataset>` namespaces below, and every handler here is a
 * `GET`, so that traffic falls through `onUnhandledRequest: 'bypass'` untouched.
 *
 * @packageDocumentation
 */

import { allHandlers } from '@filter-enginez/mock-data/handlers';
import { http, passthrough } from 'msw';
import { setupWorker } from 'msw/browser';

/**
 * Explicit passthrough for the wine worker tier's full-corpus files — `/data-real-full.ndjson` and
 * its `.json` sibling. A RegExp path rather than a wildcard string so the match is exact and
 * independent of MSW's string-path syntax. Registered FIRST: MSW resolves handlers in order.
 *
 * @remarks
 * **This is layer one of two, and it is the weaker one.** Be clear about what it does not buy: inside
 * `mockServiceWorker.js`, an explicit `passthrough()` and an unhandled-plus-bypassed request resolve
 * to the same `{ type: 'PASSTHROUGH' }` client message and the same subsequent `fetch`. The expensive
 * part — MSW cloning every response and transferring the clone's body to the window client for the
 * `response:*` life-cycle events, teeing a ~116 MB stream that nobody drains — happens either way.
 *
 * Layer two is the `FILTER ENGINEZ LOCAL PATCH` block each app carries in its vendored
 * `mockServiceWorker.js`, which returns from the `fetch` listener without calling `respondWith` at
 * all. That is the actual guarantee; no handler can express it. Keep both: this one pins matching and
 * documents intent, that one keeps the service worker out of the path. The patch block's own comment
 * in each `mockServiceWorker.js` explains why it must be re-applied after an MSW upgrade.
 */
const FULL_CORPUS_PATH_PATTERN = /\/data-real-full\.(ndjson|json)$/;

/** Lazily-created singleton so repeated calls within a page load reuse one worker. */
let worker: ReturnType<typeof setupWorker> | null = null;

/**
 * Register + activate the MSW service worker for the calling app. Idempotent within a page load.
 *
 * @remarks
 * Call this from the app's entry point BEFORE the first render, and `await` it — the corpus stream
 * must not fire before the service worker is controlling the page, or the first pages of the boot
 * race the registration.
 *
 * **Never throws.** Every streamed boot falls back to its bundled corpus when `/api/<dataset>` is
 * unavailable, and the wine worker tier streams its NDJSON directly, so a service worker that cannot
 * register is a degraded dev experience rather than a broken app. Failing loudly here would block
 * render for no benefit, so failures are logged and swallowed.
 *
 * @returns `true` if the worker is now controlling the page, `false` if registration failed.
 */
export async function startMockServiceWorker(): Promise<boolean> {
	try {
		worker ??= setupWorker(
			http.get(FULL_CORPUS_PATH_PATTERN, () => passthrough()),
			...allHandlers,
		);
		await worker.start({ onUnhandledRequest: 'bypass', quiet: true });

		return true;
	} catch (error) {
		console.error('[msw] service worker failed to start; continuing without mocks', error);

		return false;
	}
}
