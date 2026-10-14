/**
 * The `/docs` route subtree, shared by both React apps and the standalone docs site so the docs section is defined once.
 *
 * @remarks
 * A react-router `RouteObject`: a `<DocsLayout>` parent (sidebar + `<Outlet />`) with the overview,
 * per-rule, per-algorithm, playground, and API-reference children. Each app spreads `docsRoute` into
 * its `createBrowserRouter([...])`, keeping the docs identical across the RTK + plain apps.
 *
 * ### Every page is a lazy route
 *
 * Nothing under `/docs` is in an app's startup bundle. The layout and each page arrive through
 * react-router's `lazy` route property, each as its own chunk, so a visitor who never opens the docs
 * never downloads them, and one who does fetches only the layout and the page they asked for. The
 * playground is the page that most needs it: it runs a real engine, so its chunk carries
 * `@filter-enginez/core`, which no other docs page needs.
 *
 * `lazy` rather than `React.lazy` + `<Suspense>`, because it is the router doing the waiting. A link
 * into the docs, or from one docs page to another, keeps the current page on screen until the next
 * one's code has arrived, so there is no intermediate fallback to flash between two pages. The one
 * moment with nothing to keep on screen is a cold load straight onto a `/docs` URL, and that is what
 * {@link DocsLoadingScreen} is for: the router renders a route's `HydrateFallback` until the matched
 * routes' code has loaded.
 *
 * Each loader imports its page module directly rather than through this slice's barrel. A dynamic
 * `import()` of a module that is also imported statically into the same chunk cannot split anything,
 * so these paths name the page files themselves, which nothing else on an app's startup graph imports.
 *
 * @packageDocumentation
 */

import { type RouteObject } from 'react-router';

import { DocsLoadingScreen } from './DocsLoadingScreen.js';

/** The `/docs` layout route + its children, each loaded on first visit. */
export const docsRoute: RouteObject = {
	children: [
		{
			index: true,
			lazy: { Component: async () => (await import('./DocsHomePage.js')).DocsHomePage },
		},
		{ lazy: { Component: async () => (await import('./RuleDocPage.js')).RuleDocPage }, path: 'rules/:ruleId' },
		{
			lazy: { Component: async () => (await import('./AlgorithmDocPage.js')).AlgorithmDocPage },
			path: 'algorithms/:algoId',
		},
		{
			lazy: { Component: async () => (await import('./DocsPlaygroundPage.js')).DocsPlaygroundPage },
			path: 'playground',
		},
		{ lazy: { Component: async () => (await import('./DocsApiPage.js')).DocsApiPage }, path: 'api' },
	],
	HydrateFallback: DocsLoadingScreen,
	lazy: { Component: async () => (await import('./DocsLayout.js')).DocsLayout },
	path: '/docs',
};
