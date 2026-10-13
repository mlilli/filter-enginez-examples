/**
 * `<App />` — the standalone documentation site's router.
 *
 * @remarks
 * The whole site IS the docs: it mounts the shared `docsRoute` (defined once in
 * `@filter-enginez/examples-shared/docs` and also spread into both React apps) verbatim, so the rule /
 * algorithm reference, the live playground, and the API index render identically to how they appear
 * inside the React apps. `docsRoute` is anchored at `/docs` and every internal link is an absolute
 * `/docs/...` path, so the app keeps that mount point and simply redirects `/` (and anything unknown)
 * to the docs home rather than rewriting the shared route — one source of truth for the docs subtree.
 *
 * @packageDocumentation
 */

import { docsRoute } from '@filter-enginez/examples-shared/docs';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';

/** `/` and any unmatched path land on the docs home; everything else is served by `docsRoute`. */
const router = createBrowserRouter([
	{ element: <Navigate to="/docs" replace />, path: '/' },
	docsRoute,
	{ element: <Navigate to="/docs" replace />, path: '*' },
]);

/**
 * The documentation site root.
 */
export const App = (): React.ReactElement => <RouterProvider router={router} />;
