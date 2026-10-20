/**
 * `@filter-enginez/examples-shared/app-router` — the router the React apps mount, with its error
 * screen and the head that follows the route.
 *
 * @remarks
 * Shared by the two React demo apps and the documentation site, which differ only in their route
 * tables and their page metadata. The non-React apps render the same error screen from
 * `./page-error-core`.
 *
 * @packageDocumentation
 */

export { AppRouter, type AppRouterProps } from './AppRouter.js';
export { PageErrorBoundary, type PageErrorBoundaryProps } from './pageErrorBoundary.js';
export { PageErrorScreen, type PageErrorScreenProps } from './PageErrorScreen.js';
export { useRoutePageMeta } from './routePageMeta.js';
