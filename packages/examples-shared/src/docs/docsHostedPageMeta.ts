/**
 * `docsHostedPageMeta` — the page metadata of an app that serves the documentation under `/docs` as
 * well as pages of its own.
 *
 * @remarks
 * The two React demo apps mount the documentation route (`docsRouteAt`) under `/docs`, beside their
 * datasets. Their own pages take their metadata from `../page-meta/pageMeta.ts`; a documentation path
 * takes its title and description from `../page-meta/docsPageMeta.ts` and is canonical on the
 * documentation site, at the page's path there, so the copy an app serves is folded into the
 * documentation site's own. That module carries the rule catalog's text, so it is
 * imported when a documentation path is first shown, never at startup — the same on-demand split the
 * documentation's pages have.
 *
 * @packageDocumentation
 */

import { DOCS_APP_BASE_PATH, isDocsPath, type PageMeta, verticalPageMeta } from '../page-meta/pageMeta.js';
import { type VerticalId } from '../verticals/verticals.js';

/**
 * The metadata resolver for a demo app that serves the documentation too.
 *
 * @param id - The app's vertical.
 * @returns A function from a path to its metadata: immediate for the app's own pages, loaded on demand
 * for a documentation path.
 */
export function docsHostedPageMeta(id: VerticalId): (pathname: string) => PageMeta | Promise<PageMeta> {
	return (pathname: string): PageMeta | Promise<PageMeta> => (isDocsPath(pathname)
		? import('../page-meta/docsPageMeta.js').then((module) => module.docsPageMeta(pathname, DOCS_APP_BASE_PATH))
		: verticalPageMeta(id, pathname));
}
