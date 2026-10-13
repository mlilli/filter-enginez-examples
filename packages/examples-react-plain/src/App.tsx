/**
 * `<App />` — the root component: the router.
 *
 * @remarks
 * Routes:
 *   - `/`             → `<LandingPage>` (the dataset hub).
 *   - `/books-server` → `<BooksServerRoute>` (the SAME `<BooksApp>` as `/books`, but filtering runs
 *                       on the Node server via the HTTP-backed engine).
 *   - `/lab`          → `<LabRoute>` (the engine-capability demonstrations, over the books engine).
 *   - `/:datasetId`   → `<DatasetRoute>` for a registered dataset (unknown ids → the 404).
 *   - `*`             → `<NotFoundPage>` (the shared "filtered to zero" 404) for any other dead route.
 *
 * The per-dataset boot + provider wiring lives in `<DatasetRoute>`; each dataset lazily boots its
 * engine on first visit (cached thereafter). No dataset loads up front — only the landing page. This
 * is the signals-only sibling of the RTK app's router.
 *
 * @packageDocumentation
 */

import { AboutPage } from '@filter-enginez/examples-shared/about';
import { compareRoute } from '@filter-enginez/examples-shared/compare';
import { docsRoute } from '@filter-enginez/examples-shared/docs';
import { NotFoundPage, notFoundRoute } from '@filter-enginez/examples-shared/notfound';
import { createBrowserRouter, useParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { BooksServerRoute } from './books/BooksServerRoute.js';
import { findDataset } from './datasets.js';
import { LAB_ABOUT_LINKS, LAB_ROUTE_PATH } from './lab/labAboutLinks.js';
import { LabRoute } from './lab/LabRoute.js';
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
	// This app has a `/lab`, so it opts its `/about` into linking there. The other five verticals
	// render the same shared page with no `demoLinks` and are unchanged — see `labAboutLinks.ts`.
	{ element: <AboutPage demoLinks={LAB_ABOUT_LINKS} />, path: '/about' },
	{ element: <BooksServerRoute />, path: '/books-server' },
	docsRoute,
	// Before `/:datasetId`, for the same reason `docsRoute` is: a bare `/compare` would otherwise be
	// a candidate for the dataset resolver, which would answer it with the 404 for an unknown id.
	compareRoute,
	// Same reason again, and the failure mode is why it is worth restating rather than trusting the
	// router's ranking: `/lab` losing to `/:datasetId` does not error, it renders a plausible 404.
	{ element: <LabRoute />, path: LAB_ROUTE_PATH },
	{ element: <DatasetRouteResolver />, path: '/:datasetId' },
	notFoundRoute,
]);

/**
 * Root component — mounts the router.
 */
export const App = (): React.ReactElement => {
	return <RouterProvider router={router} />;
};
