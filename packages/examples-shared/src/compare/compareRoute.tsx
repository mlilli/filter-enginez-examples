/**
 * The `/compare` `RouteObject`, shared by both React apps (the `docsRoute` precedent).
 *
 * @remarks
 * Flat rather than nested — the page has no sub-routes; dataset and preset are query parameters, so
 * that a chosen comparison is itself a shareable URL rather than a piece of component state nobody
 * can link to.
 *
 * This object serves the two React apps only. The four non-React verticals build their own shells
 * over `@filter-enginez/examples-shared/compare-core`, which is why every decision this page makes —
 * origins, routes, presets, link construction — lives there rather than in the component.
 *
 * @packageDocumentation
 */

import { type RouteObject } from 'react-router';

import { ComparePage } from './ComparePage.js';

/** The cross-app comparison route. Spread it into `createBrowserRouter([...])`. */
export const compareRoute: RouteObject = { element: <ComparePage />, path: '/compare' };
