/**
 * `<App />` — the standalone documentation site's router.
 *
 * @remarks
 * The whole site IS the docs: it mounts the shared documentation route (defined once in
 * `@filter-enginez/examples-shared/docs`, which both React apps mount under `/docs`) at the site's
 * root, so the rule / algorithm reference, the live playground, and the API index render identically
 * to how they appear inside the React apps, and every link between them stays on this site's paths
 * (`/rules/range`, `/playground`). Any other path is the shared not-found page, as in the React apps;
 * deployed, the host answers it with status 404 (`scripts/write-route-shells.mjs`). The host also
 * answers every `/docs` address with a permanent redirect to the same path without the prefix, query
 * string kept (`public/_redirects`).
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
import { docsRouteAt } from '@filter-enginez/examples-shared/docs';
import { DOCS_SITE_BASE_PATH, type PageMeta } from '@filter-enginez/examples-shared/page-meta';
import { lazy, Suspense } from 'react';
import { type RouteObject } from 'react-router';

/**
 * The shared not-found page, loaded when an unknown path is first shown.
 *
 * @remarks
 * On demand rather than static, unlike in the React apps: every visit here starts on a documentation
 * page, whose first screen has no use for the page's loader animation and header, and the build holds
 * that first screen to a startup budget.
 */
const NotFoundPage = lazy(async () => ({ default: (await import('@filter-enginez/examples-shared/notfound')).NotFoundPage }));

/** The documentation at the site's root, then the shared not-found page for every other path. */
const ROUTES: RouteObject[] = [
	docsRouteAt(DOCS_SITE_BASE_PATH),
	{
		element: (
			// The page's own `<main>` is the landmark; an empty one stands in while its code arrives.
			<Suspense fallback={<main className="fe-notfound" />}>
				<NotFoundPage />
			</Suspense>
		),
		path: '*',
	},
];

/**
 * A page's head tags, from the documentation's page catalog, loaded on first use.
 *
 * @param pathname - The page's path.
 * @returns Its title, description and canonical URL.
 */
async function docsPageMetaFor(pathname: string): Promise<PageMeta> {
	return (await import('@filter-enginez/examples-shared/page-meta-docs')).docsPageMeta(pathname, DOCS_SITE_BASE_PATH);
}

/**
 * The documentation site root.
 *
 * @returns The router.
 */
export const App = (): React.ReactElement => <AppRouter pageMeta={docsPageMetaFor} routes={ROUTES} />;
