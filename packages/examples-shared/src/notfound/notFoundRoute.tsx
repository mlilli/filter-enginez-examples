/**
 * The catch-all 404 `RouteObject`, shared by both React apps (the `docsRoute` precedent).
 *
 * @remarks
 * Each app puts `notFoundRoute` in its route table (`AppRouter`'s `routes`) as the **final** entry, so an
 * unmatched path renders `<NotFoundPage>`. It must come last — react-router matches most-specific
 * first, and `path: '*'` is the fallback.
 *
 * @packageDocumentation
 */

import { type RouteObject } from 'react-router';

import { NotFoundPage } from './NotFoundPage.js';

/** The router catch-all: renders `<NotFoundPage>` for any unmatched path. Spread it in LAST. */
export const notFoundRoute: RouteObject = { element: <NotFoundPage />, path: '*' };
