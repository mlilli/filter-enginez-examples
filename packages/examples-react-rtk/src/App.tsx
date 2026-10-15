/**
 * `<App />` — the root component: the router.
 *
 * @remarks
 * Routes:
 *   - `/`             → `<LandingPage>` (the dataset hub).
 *   - `/books-server` → `<BooksServerRoute>` (the SAME `<BooksApp>` as `/books`, but filtering runs
 *                       on the Node `examples-server` via an HTTP-backed engine; no in-browser filter).
 *   - `/docs/*`       → the shared documentation subtree (`docsRoute`).
 *   - `/:datasetId`   → `<DatasetRoute>` for a registered dataset (unknown ids → the 404).
 *   - `*`             → `<NotFoundPage>` (the shared "filtered to zero" 404) for any other dead route.
 *
 * The per-dataset load + boot + provider wiring lives in `<DatasetRoute>`; each dataset loads its code
 * and boots its engine on first visit (cached thereafter).
 *
 * ### The startup bundle is the hub
 *
 * What this module imports statically is what every visit downloads before it can render anything, so
 * it is held to the first screen: the hub, the route shells that show a loader the moment a route
 * opens, and the 404. Every page behind those shells is its own chunk, fetched on the route's first
 * visit — the datasets (with their Redux stores) through their registry entries (`datasets.tsx`), the
 * docs through `docsRoute`'s lazy routes, and `/books-server` through `React.lazy` below. The build
 * checks the result against a budget (`scripts/check-startup-budget.mjs`).
 *
 * @packageDocumentation
 */

import { AppVerticalContext } from '@filter-enginez/examples-shared/app-header';
import { docsHostedPageMeta, docsRoute } from '@filter-enginez/examples-shared/docs';
import { NotFoundPage, notFoundRoute } from '@filter-enginez/examples-shared/notfound';
import { followRouterPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, useParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ServerConnecting } from './books-server/ServerConnecting.js';
import { findDataset } from './datasets.js';
import { DatasetRoute } from './routes/DatasetRoute.js';
import { LandingPage } from './routes/LandingPage.js';

/**
 * `/books-server`'s route element, loaded on the route's first visit.
 *
 * @remarks
 * `React.lazy` with the route's own connecting screen as the fallback, rather than react-router's
 * `lazy`, because the route has a loading screen of its own to show. The fallback is that same screen,
 * so a visit reads as one wait, from the first frame to the connected app.
 */
const BooksServerRoute = lazy(async () => ({
	default: (await import('./books-server/BooksServerRoute.js')).BooksServerRoute,
}));

/**
 * Resolve `/:datasetId` to a dataset's route, or render the shared 404 for an unknown id.
 *
 * @internal
 */
const DatasetRouteResolver = (): React.ReactElement => {
	const { datasetId } = useParams();
	const entry = findDataset(datasetId);

	if (entry === undefined) {
		// An unknown dataset id is a dead route → the shared 404 (not a silent redirect).
		return <NotFoundPage />;
	}

	// Keyed by dataset, so moving between two datasets mounts a fresh route rather than handing the
	// previous dataset's loaded code and booted engine to the next one (`DatasetRoute`'s docblock).
	return <DatasetRoute key={entry.id} entry={entry} />;
};

const router = createBrowserRouter([
	{ element: <LandingPage />, path: '/' },
	{
		element: (
			<Suspense fallback={<ServerConnecting />}>
				<BooksServerRoute />
			</Suspense>
		),
		path: '/books-server',
	},
	docsRoute,
	{ element: <DatasetRouteResolver />, path: '/:datasetId' },
	notFoundRoute,
]);

/**
 * Root component — mounts the router.
 *
 * @remarks
 * The head follows the route: each page's title, description and canonical URL (the documentation's
 * canonical on the documentation site) are written on every navigation by `followRouterPageMeta`.
 *
 * The router sits inside {@link AppVerticalContext}, so the pages this app shares with the other React
 * app as route objects — the documentation and the 404 — name this app in their header and link back
 * to its hub without being told which app they are in.
 */
export const App = (): React.ReactElement => {
	// Each route's title, description and canonical URL, written as the router navigates: one static
	// shell serves every route, so the head has to follow the route (`examples-shared/page-meta`).
	useEffect(() => followRouterPageMeta(router, docsHostedPageMeta('react-rtk')), []);

	return (
		<AppVerticalContext value="react-rtk">
			<RouterProvider router={router} />
		</AppVerticalContext>
	);
};
