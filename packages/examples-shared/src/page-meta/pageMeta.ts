/**
 * `page-meta` — what each page of a demo app is called, how it is described, and the one URL a search
 * engine should index it under.
 *
 * @remarks
 * Every demo app is a single-page app (SvelteKit renders on the server as well), so one static HTML
 * shell answers every route. A `<link rel="canonical">` written into that shell would name the hub for
 * every route, and a search engine would fold the dataset pages into the hub and drop them. So the
 * shell carries only the hub's title and description, and each app writes the route's own title,
 * description and canonical URL as it navigates — the SPAs with {@link applyPageMeta}, SvelteKit in its
 * root layout's `<svelte:head>`, server-side. This module decides what they are, once, for all six.
 *
 * - **The hub** keeps the title and description its shell carries: the registry's `pageTitle` and
 *   `pageDescription` (`../verticals/verticals.ts`).
 * - **A dataset route** is named by its landing card (`../landing/landingCards.ts`) and described by
 *   its blurb, the same words the hub shows for it.
 * - **The documentation** that the two React apps also serve under `/docs` is canonical on the
 *   documentation site, `docs.filterenginez.com`; those apps read its titles from
 *   `./docsPageMeta.ts`, on demand, and point the canonical there (see {@link docsCanonicalUrl}).
 * - **Anything else** is the app's not-found page: no canonical, and `noindex`, because a single-page
 *   app answers an unknown path with status 200.
 *
 * The same lists feed the sitemap the landing site generates (`packages/site/src/sitemap/sitemap.ts`),
 * via {@link verticalIndexablePaths}, so a page is in the sitemap exactly when it has a canonical URL.
 *
 * React-free and DOM-free, so the four non-React apps and the landing site's build can import it.
 *
 * @packageDocumentation
 */

import { DATASET_ROUTES } from '../landing/landingCards.js';
import { LAB_ROUTE_PATH, LAB_VERTICAL_ID, vertical, type VerticalId } from '../verticals/verticals.js';

/** The brand, as every title spells it. */
export const BRAND_NAME = 'Filter EngineZ';

/** The documentation site's origin, where every documentation page is canonical. */
export const DOCS_ORIGIN = 'https://docs.filterenginez.com';

/** The path the documentation lives under, on the documentation site and in the React apps. */
export const DOCS_BASE_PATH = '/docs';

/** A page's head metadata. */
export interface PageMeta {
	/** The `<title>`. */
	readonly title: string;
	/** The `<meta name="description">` content; empty for a page that is not indexed. */
	readonly description: string;
	/**
	 * The absolute URL the page is indexed under, or `null` for a page that must not be indexed: it
	 * then carries `<meta name="robots" content="noindex">` and no canonical link.
	 */
	readonly canonicalUrl: string | null;
}

/** The lab's title and description: react-plain's `/lab` route. */
const LAB_META = {
	description:
		'Engine capabilities beyond filtering, running against a live books corpus: projection, similarity search and co-occurrence suggestions.',
	label: 'The lab',
} as const;

/**
 * Whether a path is under the documentation's base path.
 *
 * @param pathname - A URL path.
 * @returns `true` for `/docs` and every path beneath it.
 */
export function isDocsPath(pathname: string): boolean {
	return pathname === DOCS_BASE_PATH || pathname.startsWith(`${DOCS_BASE_PATH}/`);
}

/**
 * The documentation site's URL for a documentation path, wherever it is served.
 *
 * @param pathname - A path under `/docs`.
 * @returns The absolute URL on the documentation site.
 */
export function docsCanonicalUrl(pathname: string): string {
	return `${DOCS_ORIGIN}${pathname}`;
}

/**
 * The not-found page's metadata.
 *
 * @param siteTitle - The title of the site the page belongs to, e.g. the hub's.
 * @returns A title, no description, no canonical.
 */
export function notFoundPageMeta(siteTitle: string): PageMeta {
	return { canonicalUrl: null, description: '', title: `Page not found — ${siteTitle}` };
}

/**
 * The paths of a vertical that are pages of its own, each with a canonical URL on its host: the hub,
 * every dataset route, and the lab where it is served. The documentation is not among them; it is
 * canonical on the documentation site.
 *
 * @param id - The vertical.
 * @returns Paths, the hub first, then the registry's order.
 */
export function verticalIndexablePaths(id: VerticalId): readonly string[] {
	const { routes } = vertical(id);

	return ['/', ...routes.filter((route) => !isDocsPath(route)), ...(id === LAB_VERTICAL_ID ? [LAB_ROUTE_PATH] : [])];
}

/**
 * A vertical's metadata for a path that is not under `/docs`.
 *
 * @remarks
 * A trailing slash is ignored, as every app's router ignores it, and the canonical URL never carries
 * one (except the hub's `/`). A dataset path the vertical does not serve is not found here, as it is
 * in the app.
 *
 * @param id - The vertical.
 * @param pathname - The URL path, without query or hash.
 * @returns The metadata.
 */
export function verticalPageMeta(id: VerticalId, pathname: string): PageMeta {
	const descriptor = vertical(id);
	const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	const canonicalUrl = `${descriptor.productionOrigin}${path}`;

	if (!verticalIndexablePaths(id).includes(path)) {
		return notFoundPageMeta(descriptor.pageTitle);
	}
	if (path === '/') {
		return { canonicalUrl, description: descriptor.pageDescription, title: descriptor.pageTitle };
	}

	const card = DATASET_ROUTES.find((candidate) => candidate.href === path);
	const { description, label } = card === undefined ? LAB_META : { description: card.blurb, label: card.label };

	return { canonicalUrl, description, title: `${label} — ${descriptor.pageTitle}` };
}
