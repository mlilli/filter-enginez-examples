/**
 * `<App />` — the root component: the router.
 *
 * @remarks
 * Routes:
 *   - `/`             → `<LandingPage>` (the dataset hub).
 *   - `/books-server` → `<BooksServerRoute>` (the SAME `<BooksApp>` as `/books`, but filtering runs
 *                       on the Node `examples-server` via an HTTP-backed engine; no in-browser filter).
 *   - `/docs/*`       → the shared documentation subtree (`docsRouteAt`, under `/docs`).
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
 * opens, the 404 and the page-error screen. Every page behind those shells is its own chunk, fetched on
 * the route's first visit — the datasets (with their Redux stores) through their registry entries
 * (`datasets.tsx`), the docs through the documentation route's lazy pages, and `/books-server` through
 * `React.lazy` below. The router is React Router's declarative mode (`AppRouter`), which leaves the
 * data router's loaders, actions and fetchers out of the bundle. The build checks the result against a
 * budget (`scripts/check-startup-budget.mjs`).
 *
 * @packageDocumentation
 */

import { AppVerticalContext } from '@filter-enginez/examples-shared/app-header';
import { AppRouter } from '@filter-enginez/examples-shared/app-router';
import { docsHostedPageMeta, docsRouteAt } from '@filter-enginez/examples-shared/docs';
import { NotFoundPage, notFoundRoute } from '@filter-enginez/examples-shared/notfound';
import { DOCS_APP_BASE_PATH } from '@filter-enginez/examples-shared/page-meta';
import { lazy, Suspense } from 'react';
import { type RouteObject, useParams } from 'react-router';

import { ServerConnecting } from './books-server/ServerConnecting.js';
import { findDataset } from './datasets.js';
import { DatasetRoute } from './routes/DatasetRoute.js';
import { LandingPage } from './routes/LandingPage.js';

/**
 * `/books-server`'s route element, loaded on the route's first visit.
 *
 * @remarks
 * `React.lazy` with the route's own connecting screen as the fallback. The fallback is the same screen
 * the route shows while it connects, so a visit reads as one wait, from the first frame to the
 * connected app.
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

/** The route table, in match order. */
const ROUTES: RouteObject[] = [
	{ element: <LandingPage />, path: '/' },
	{
		element: (
			<Suspense fallback={<ServerConnecting />}>
				<BooksServerRoute />
			</Suspense>
		),
		path: '/books-server',
	},
	docsRouteAt(DOCS_APP_BASE_PATH),
	{ element: <DatasetRouteResolver />, path: '/:datasetId' },
	notFoundRoute,
];

/** Each route's title, description and canonical URL: the documentation's on demand, the app's own at once. */
const PAGE_META = docsHostedPageMeta('react-rtk');

/**
 * Root component — mounts the router.
 *
 * @remarks
 * The head follows the route: each page's title, description and canonical URL (the documentation's
 * canonical on the documentation site) are written on every navigation, one static shell serving every
 * route (`examples-shared/page-meta`). A page that fails to load or render shows the shared page-error
 * screen (`AppRouter`'s error boundary).
 *
 * The router sits inside {@link AppVerticalContext}, so the pages this app shares with the other React
 * app as route objects — the documentation and the 404 — name this app in their header and link back
 * to its hub without being told which app they are in.
 */
export const App = (): React.ReactElement => (
	<AppVerticalContext value="react-rtk">
		<AppRouter pageMeta={PAGE_META} routes={ROUTES} />
	</AppVerticalContext>
);
