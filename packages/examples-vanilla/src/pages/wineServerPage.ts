/**
 * `/wine-server` — the same wine app with the filtering moved off the browser entirely.
 *
 * @remarks
 * One of two verticals with a server-filtered wine route, and the one that does it over HTTP.
 *
 * ## What this route proves, and it is not what SvelteKit's proves
 *
 * SvelteKit's `/wine-server` runs the isomorphic core **in its own server tier**, in-process, with a
 * zero-JS SSR fallback. **That story is unavailable here, by design:** vanilla is a static Vite SPA
 * with no server rendering. A `configureServer` middleware would fake one that exists only under
 * `vite dev`, which is precisely the kind of claim a demo about honest costs should not make.
 *
 * So this takes React `/books-server`'s shape instead — a same-origin `/api` served by
 * `@filter-enginez/examples-server`: in development the dev server proxies it to that package's Node
 * process, and deployed, the app's own Cloudflare Worker answers it with the same request handler.
 * Between the two verticals the repo shows both server-tier arrangements of one engine, which is more
 * interesting than showing one twice.
 *
 * ## The only thing that differs from `/wine` is how the engine is obtained
 *
 * Everything downstream — the panel, the URL sync, the devtools surface, the six subscriptions — is
 * `winePageShell.ts`, shared verbatim. `SignalsEngine<Wine>` is what `createSignalsEngineFromAsync`
 * returns over a Comlink worker and what `bootWineServerEngine` returns over `fetch`, so the shell
 * never learns which it has. That is the same claim the React apps make when `/books-server` renders
 * the exact same `<BooksApp>`.
 *
 * ## The corpus is the 10,000-wine default tier, not `/wine`'s 150,000
 *
 * `examples-server`'s dataset registry imports `wines` from `@filter-enginez/mock-data/wine` — the
 * default tier — because the deployed server runs on a plan with 10 ms of CPU and 128 MB of memory
 * per request. Two consequences worth carrying: the footer says so (`SERVER_WINE_TIER_LABEL`), because
 * two wine routes reporting different counts with no explanation is worse than either number; and the
 * shared `wineFlow.ts` suite must NOT be pointed here, since it asserts positively that the footer
 * reads `full corpus`. It would fail correctly, for a route behaving exactly as designed.
 *
 * ## A missing API is the COMMON case, not an edge one
 *
 * `pnpm dev` does not start `serve:api`. So the unreachable-server path is what a developer hits
 * first, and `bootWineServerEngine` rejects rather than degrading. Hanging on the boot loader would
 * reproduce, exactly, the failure that loader exists to prevent — a page that looks like it is
 * working for as long as you are willing to wait.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { EXAMPLES_SERVER_START_COMMAND, SERVER_ROUTE_SCREEN_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { el } from '@filter-enginez/examples-shared/dom';
import { bootWineServerEngine, SERVER_WINE_TIER_LABEL } from '@filter-enginez/examples-shared/wine-server-core';

import type { RouteTeardown } from '../router.js';

import { createWineBootScreen } from '../wine/bootScreen.js';
import { mountWineRoute } from './winePageShell.js';

/**
 * The base URL the transport hangs off.
 *
 * @remarks
 * Same-origin by design: `vite.config.ts` proxies `/api` to `http://localhost:24618`, and the deployed
 * Worker answers `/api/*` itself (`wrangler.jsonc`), so the browser never makes a cross-origin request
 * and there is no CORS to configure. The base URL is the same everywhere rather than something baked
 * into a bundle per environment — the identical arrangement React RTK's `/books-server` uses.
 */
const API_BASE_URL = '/api';

/**
 * Boot the server-backed wine engine and mount the shared wine route over it.
 *
 * @param container - The route container.
 * @returns A teardown dropping every subscription and disposing the engine.
 */
export async function renderWineServerPage(container: HTMLElement): Promise<RouteTeardown> {
	const bootScreen = createWineBootScreen(SERVER_ROUTE_SCREEN_COPY.connectingLoaderLabel);

	bootScreen.setCaption(SERVER_ROUTE_SCREEN_COPY.connectingCaption);
	container.append(bootScreen.element);

	let engine;

	try {
		engine = await bootWineServerEngine({ baseUrl: API_BASE_URL });
	} catch (error) {
		console.error('[wine-server] boot failed:', error);
		container.replaceChildren(offlineNotice(error instanceof Error ? error.message : String(error)));

		// A teardown is still owed: the router calls it on navigation regardless of how the render
		// ended, and returning nothing here would make leaving this route throw.
		return () => {
			container.replaceChildren();
		};
	}

	return mountWineRoute(container, {
		// Not `'wine'`: this route's interesting comparison is SvelteKit's in-process server tier, the
		// only other vertical serving `/wine-server`. Offering the six-way browser comparison from here
		// would send a visitor away from the one page that contrasts two server-tier arrangements of
		// one engine — which is the reason this route exists.
		compareDataset: 'wine-server',
		engine,
		footnote: `filter-enginez · wine demo · vanilla + reactive-signals over HTTP to the isomorphic core · ${SERVER_WINE_TIER_LABEL}`,
		subtitle: appHeaderSubtitle('Wine', 'vanilla', 'server'),
	});
}

/**
 * The state this route shows when the filter API is not running.
 *
 * @remarks
 * The words every app's server-backed route shows (`SERVER_ROUTE_SCREEN_COPY`): the headline, the
 * error's own message, and the command that starts the server, because the fix is one process away
 * and the failure is the DEFAULT local state — `pnpm dev` starts the six verticals and not
 * `serve:api`. Inside an element with `role="alert"`, within a `<main>`: with the API down, this is
 * the page's main content.
 *
 * Built over the shared `.fe-server-offline*` classes, the same block the other apps' offline
 * screens render.
 *
 * @param message - The boot error's message.
 * @returns The screen's root.
 * @internal
 */
function offlineNotice(message: string): HTMLElement {
	return el('main', {
		children: [
			el('div', {
				attrs: { role: 'alert' },
				children: [
					el('p', { className: 'fe-server-offline__title', text: SERVER_ROUTE_SCREEN_COPY.offlineTitle }),
					el('p', { className: 'fe-server-offline__detail', text: message }),
					el('p', {
						children: [
							SERVER_ROUTE_SCREEN_COPY.offlineHintLead,
							el('code', { className: 'fe-server-offline__command', text: EXAMPLES_SERVER_START_COMMAND }),
							SERVER_ROUTE_SCREEN_COPY.offlineHintTail,
						],
						className: 'fe-server-offline__hint',
					}),
				],
				className: 'fe-server-offline',
			}),
		],
	});
}
