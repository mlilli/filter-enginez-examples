/**
 * `<App />` — the root component: the router.
 *
 * @remarks
 * Routes:
 *   - `/`             → `<LandingPage>` (the dataset hub).
 *   - `/about`        → `<AboutPage>` (how the engine works).
 *   - `/books-server` → `<BooksServerRoute>` (the SAME `<BooksApp>` as `/books`, but filtering runs
 *                       on the Node `examples-server` via an HTTP-backed engine; no in-browser filter).
 *   - `/:datasetId`   → `<DatasetRoute>` for a registered dataset (unknown ids → the 404).
 *   - `*`             → `<NotFoundPage>` (the shared "filtered to zero" 404) for any other dead route.
 *
 * The per-dataset boot + provider wiring lives in `<DatasetRoute>`; each dataset lazily boots its
 * engine on first visit (cached thereafter). No dataset loads up front — only the landing page.
 *
 * @packageDocumentation
 */

import { AboutPage } from '@filter-enginez/examples-shared/about';
import { compareRoute } from '@filter-enginez/examples-shared/compare';
import { docsRoute } from '@filter-enginez/examples-shared/docs';
import { NotFoundPage, notFoundRoute } from '@filter-enginez/examples-shared/notfound';
import { createBrowserRouter, useParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { BooksServerRoute } from './books-server/BooksServerRoute.js';
import { findDataset } from './datasets.js';
import { DatasetRoute } from './routes/DatasetRoute.js';
import { LandingPage } from './routes/LandingPage.js';

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

	return <DatasetRoute entry={entry} />;
};

const router = createBrowserRouter([
	{ element: <LandingPage />, path: '/' },
	{ element: <AboutPage />, path: '/about' },
	{ element: <BooksServerRoute />, path: '/books-server' },
	docsRoute,
	// Before `/:datasetId`, for the same reason `docsRoute` is: a bare `/compare` would otherwise be
	// a candidate for the dataset resolver, which would answer it with the 404 for an unknown id.
	compareRoute,
	{ element: <DatasetRouteResolver />, path: '/:datasetId' },
	notFoundRoute,
]);

/**
 * Root component — mounts the router.
 */
export const App = (): React.ReactElement => {
	return <RouterProvider router={router} />;
};
