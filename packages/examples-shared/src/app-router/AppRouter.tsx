/**
 * `<AppRouter>` — the router every React app here mounts: the two demo apps and the documentation site.
 *
 * @remarks
 * React Router in declarative mode: a `<BrowserRouter>` over the app's route table (`useRoutes`, the
 * hook `<Routes>` is built on, so the table stays plain route objects that `docsRouteAt` and
 * `notFoundRoute` slot into). The apps use nothing of the data router's (no loaders, actions or
 * fetchers), and declarative mode leaves that machinery out of every app's startup bundle.
 *
 * What the data router did besides routing, this does in the open:
 *
 * - **The head follows the route** ({@link useRoutePageMeta}), outside the error boundary, so a failed
 *   page still gets its title.
 * - **A page that fails shows an error screen** ({@link PageErrorBoundary}), where the data router
 *   showed its own default screen and a declarative router shows nothing.
 * - **Navigations are transitions** (`<BrowserRouter>`'s default), so moving to a page whose code is
 *   still loading keeps the current page on screen until it arrives, instead of flashing a fallback.
 *
 * @packageDocumentation
 */

import { BrowserRouter, type RouteObject, useRoutes } from 'react-router';

import { type PageMetaResolver } from '../page-meta/showPageMeta.js';
import { PageErrorBoundary } from './pageErrorBoundary.js';
import { useRoutePageMeta } from './routePageMeta.js';

/** Props for {@link AppRouter}. */
export interface AppRouterProps {
	/** Each path's head metadata, now or once loaded; a module-level constant (see {@link useRoutePageMeta}). */
	readonly pageMeta: PageMetaResolver;
	/** The route table, in match order; a module-level constant. */
	readonly routes: RouteObject[];
}

/**
 * Writes the head for the current route; renders nothing.
 *
 * @param props - The metadata resolver.
 * @returns Nothing.
 */
const RoutePageMeta = ({ pageMeta }: Pick<AppRouterProps, 'pageMeta'>): null => {
	useRoutePageMeta(pageMeta);

	return null;
};

/**
 * The route table, matched against the current location.
 *
 * @param props - The route table.
 * @returns The matched routes' elements.
 */
const AppRoutes = ({ routes }: Pick<AppRouterProps, 'routes'>): React.ReactElement | null => useRoutes(routes);

/**
 * The app's router.
 *
 * @param props - The route table and the head metadata.
 * @returns The router.
 */
export const AppRouter = ({ pageMeta, routes }: AppRouterProps): React.ReactElement => (
	<BrowserRouter>
		<RoutePageMeta pageMeta={pageMeta} />
		<PageErrorBoundary>
			<AppRoutes routes={routes} />
		</PageErrorBoundary>
	</BrowserRouter>
);
