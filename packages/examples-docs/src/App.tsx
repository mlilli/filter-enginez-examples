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
 * The Worker answers `/` itself with a 301 to `/docs` (`public/_redirects`), so a crawler meets one
 * address for the home; the client-side redirect covers the dev server and any other unknown path.
 *
 * The head follows the route: each page's title, description and canonical URL are written on every
 * navigation by `followRouterPageMeta`, from the documentation's page catalog (`page-meta-docs`). The
 * catalog is imported on demand, as the React apps import it through `docsHostedPageMeta`: one static
 * import anywhere would pin it, and the rule and algorithm text it reads, into the entry chunk of every
 * app that serves the docs. Here it arrives with the layout and the home page, which
 * `vite.config.ts` preloads from the HTML, so the first screen waits on no extra round trip for it.
 *
 * @packageDocumentation
 */

import { docsRoute } from '@filter-enginez/examples-shared/docs';
import { followRouterPageMeta, type PageMeta } from '@filter-enginez/examples-shared/page-meta';
import { useEffect } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';

/** `/` and any unmatched path land on the docs home; everything else is served by `docsRoute`. */
const router = createBrowserRouter([
	{ element: <Navigate to="/docs" replace />, path: '/' },
	docsRoute,
	{ element: <Navigate to="/docs" replace />, path: '*' },
]);

/**
 * A page's head tags, from the documentation's page catalog, loaded on first use.
 *
 * @param pathname - The page's path.
 * @returns Its title, description and canonical URL.
 */
async function docsPageMetaFor(pathname: string): Promise<PageMeta> {
	return (await import('@filter-enginez/examples-shared/page-meta-docs')).docsPageMeta(pathname);
}

/**
 * The documentation site root.
 */
export const App = (): React.ReactElement => {
	useEffect(() => followRouterPageMeta(router, docsPageMetaFor), []);

	return <RouterProvider router={router} />;
};
