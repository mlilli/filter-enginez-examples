/**
 * `useRoutePageMeta` — keep the document head's title, description and canonical link on the route
 * the router is showing.
 *
 * @remarks
 * One static HTML shell serves every route of a React app, so the head has to follow the route. This
 * reads the router's location and shows each path's metadata (`showPageMeta`) when the path changes,
 * cancelling the previous path's if it has not arrived yet. A change of query or hash alone (a filter
 * state in `?f=`) is not a new page, and writes nothing.
 *
 * `resolve` must keep its identity across renders (a module-level constant): a new function would be
 * a new effect, and the head would be written again on every render.
 *
 * @packageDocumentation
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { type PageMetaResolver, showPageMeta } from '../page-meta/showPageMeta.js';

/**
 * Apply each route's metadata as the router navigates.
 *
 * @param resolve - The metadata for a path, now or once loaded.
 */
export function useRoutePageMeta(resolve: PageMetaResolver): void {
	const { pathname } = useLocation();

	useEffect(() => showPageMeta(pathname, resolve), [pathname, resolve]);
}
