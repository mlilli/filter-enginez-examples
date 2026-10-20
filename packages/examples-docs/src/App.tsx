/**
 * `<App />` — the standalone documentation site's router.
 *
 * @remarks
 * The whole site IS the docs: it mounts the shared `docsRoute` (defined once in
 * `@filter-enginez/examples-shared/docs` and also in both React apps' route tables) verbatim, so the
 * rule / algorithm reference, the live playground, and the API index render identically to how they
 * appear inside the React apps. `docsRoute` is anchored at `/docs` and every internal link is an
 * absolute `/docs/...` path, so the app keeps that mount point and simply redirects `/` (and anything
 * unknown) to the docs home rather than rewriting the shared route — one source of truth for the docs
 * subtree. The Worker answers `/` itself with a 301 to `/docs` (`public/_redirects`), so a crawler
 * meets one address for the home; the client-side redirect covers the dev server and any other
 * unknown path.
 *
 * The router is the one the React apps mount (`AppRouter`, React Router's declarative mode): the head
 * follows the route, and a page that fails to load or render shows the shared page-error screen. Each
 * page's title, description and canonical URL come from the documentation's page catalog
 * (`page-meta-docs`). The catalog is imported on demand, as the React apps import it through
 * `docsHostedPageMeta`: one static import anywhere would pin it, and the rule and algorithm text it
 * reads, into the entry chunk of every app that serves the docs. Here it arrives with the layout and
 * the home page, which `vite.config.ts` preloads from the HTML, so the first screen waits on no extra
 * round trip for it.
 *
 * @packageDocumentation
 */

import { AppRouter } from '@filter-enginez/examples-shared/app-router';
import { docsRoute } from '@filter-enginez/examples-shared/docs';
import { type PageMeta } from '@filter-enginez/examples-shared/page-meta';
import { Navigate, type RouteObject } from 'react-router';

/** `/` and any unmatched path land on the docs home; everything else is served by `docsRoute`. */
const ROUTES: RouteObject[] = [
	{ element: <Navigate to="/docs" replace />, path: '/' },
	docsRoute,
	{ element: <Navigate to="/docs" replace />, path: '*' },
];

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
 *
 * @returns The router.
 */
export const App = (): React.ReactElement => <AppRouter pageMeta={docsPageMetaFor} routes={ROUTES} />;
