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
import { el } from '@filter-enginez/examples-shared/dom';
import { bootWineServerEngine, SERVER_WINE_TIER_LABEL } from '@filter-enginez/examples-shared/wine-server-core';

import type { RouteTeardown } from '../router.js';

import { createWineBootScreen } from '../wine/bootScreen.js';
import { mountWineRoute } from './winePageShell.js';

/**
 * The base URL the transport hangs off.
 *
 * @remarks
 * Same-origin by design: `vite.config.ts` proxies `/api` to `http://localhost:8787`, and the deployed
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
	const bootScreen = createWineBootScreen('Loading wine reviews from the server');

	bootScreen.setCaption('Fetching corpus from the filter API');
	container.append(bootScreen.element);

	let engine;

	try {
		engine = await bootWineServerEngine({ baseUrl: API_BASE_URL });
	} catch (error) {
		console.error('[wine-server] boot failed:', error);
		container.replaceChildren(offlineNotice());

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
 * **Names the command**, because the fix is one process away and the failure is the DEFAULT local
 * state — `pnpm dev` starts the six verticals and not `serve:api`. An error screen that says only
 * "something went wrong" would send a reader to the network tab to rediscover a fact this page
 * already knows.
 *
 * Inline layout rather than a class, matching the boot screen: `ui-styles` has no error-state
 * component, and this app authors no component CSS at all.
 *
 * @internal
 */
function offlineNotice(): HTMLElement {
	return el('div', {
		children: [
			el('h1', {
				style: { fontSize: 'var(--text-lg)', margin: '0' },
				text: 'The filter API is not running',
			}),
			el('p', {
				style: { color: 'var(--gray-8)', margin: '0', maxWidth: '46ch', textAlign: 'center' },
				text: 'This route does no filtering in the browser — it round-trips every change to a Node process running the isomorphic engine. Start it, then reload:',
			}),
			el('code', {
				style: {
					background: 'var(--gray-1)',
					border: '1px solid var(--gray-3)',
					borderRadius: 'var(--radius-sm)',
					color: 'var(--accent)',
					fontFamily: 'var(--font-mono)',
					fontSize: '0.8rem',
					padding: '10px 14px',
				},
				text: 'pnpm --filter @filter-enginez/examples-server serve:api',
			}),
			el('a', {
				attrs: { href: '/wine' },
				style: { color: 'var(--accent)', fontSize: '0.85rem' },
				text: 'Or try the worker-backed /wine route, which needs no server →',
			}),
		],
		style: {
			alignItems: 'center',
			display: 'flex',
			flexDirection: 'column',
			gap: '1rem',
			justifyContent: 'center',
			minHeight: '60vh',
			padding: '24px',
			textAlign: 'center',
		},
	});
}
