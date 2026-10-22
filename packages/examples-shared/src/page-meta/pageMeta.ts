/**
 * `page-meta` — what each page of a demo app is called, how it is described, and the one URL a search
 * engine should index it under.
 *
 * @remarks
 * Every demo app is a single-page app (SvelteKit renders on the server as well). Each one's build writes
 * an HTML shell per route it serves, with that route's title, description and canonical URL in its
 * head, and a `404.html` the host answers every other path with, status 404
 * (`scripts/write-route-shells.mjs`, from `./hostPages.ts`). Each app also writes the route's head as it
 * navigates — the SPAs with {@link applyPageMeta}, SvelteKit in its root layout's `<svelte:head>`,
 * server-side — so the head follows a client-side navigation too. This module decides what they are,
 * once, for all six.
 *
 * - **The hub** keeps the title and description its source shell carries: the registry's `pageTitle`
 *   and `pageDescription` (`../verticals/verticals.ts`).
 * - **A dataset route** is named by its landing card (`../landing/landingCards.ts`) and described by
 *   its blurb, the same words the hub shows for it.
 * - **The documentation** is served at the root of its own site, `docs.filterenginez.com`, and under
 *   `/docs` by the two React apps ({@link DOCS_SITE_BASE_PATH}, {@link DOCS_APP_BASE_PATH}). Every copy
 *   is canonical on the documentation site; the React apps read its titles from `./docsPageMeta.ts`, on
 *   demand, and point the canonical there (see {@link docsCanonicalUrl}).
 * - **Anything else** is the app's not-found page: no canonical, and `noindex`.
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

/**
 * Where the documentation site serves the documentation: at its root, so each page's path there is
 * its path in the catalog (`/rules/range`), and its home is `/`.
 */
export const DOCS_SITE_BASE_PATH = '';

/** Where a demo app that serves the documentation beside its own pages mounts it: under `/docs`. */
export const DOCS_APP_BASE_PATH = '/docs';

/** A base path the documentation is served under: the documentation site's root, or a demo app's `/docs`. */
export type DocsBasePath = typeof DOCS_APP_BASE_PATH | typeof DOCS_SITE_BASE_PATH;

/** The documentation home's path on the documentation site. */
export const DOCS_HOME_PATH = '/';

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
 * A documentation page's path where the documentation is served under a base path.
 *
 * @param basePath - Where the documentation is served.
 * @param sitePath - The page's path on the documentation site, e.g. `/rules/range`, or `/` for the home.
 * @returns The path under the base path: `/docs/rules/range` and `/docs` in a demo app,
 *   `/rules/range` and `/` on the documentation site.
 */
export function docsPathUnder(basePath: DocsBasePath, sitePath: string): string {
	if (sitePath !== DOCS_HOME_PATH) {
		return `${basePath}${sitePath}`;
	}

	return basePath === DOCS_SITE_BASE_PATH ? DOCS_HOME_PATH : basePath;
}

/**
 * The documentation-site path a path under a base path names: the inverse of {@link docsPathUnder}.
 *
 * @param basePath - Where the documentation is served.
 * @param pathname - A URL path.
 * @returns The path on the documentation site (`/` for the home), or `null` when `pathname` is not
 *   under `basePath`. Every path is under the documentation site's root.
 */
export function docsSitePath(basePath: DocsBasePath, pathname: string): string | null {
	if (basePath === DOCS_SITE_BASE_PATH) {
		return pathname;
	}
	if (pathname === basePath) {
		return DOCS_HOME_PATH;
	}

	return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : null;
}

/**
 * Whether a demo app's path is one of its documentation pages' paths, under {@link DOCS_APP_BASE_PATH}.
 *
 * @param pathname - A URL path.
 * @returns `true` for `/docs` and every path beneath it.
 */
export function isDocsPath(pathname: string): boolean {
	return docsSitePath(DOCS_APP_BASE_PATH, pathname) !== null;
}

/**
 * The documentation site's URL for a documentation page, wherever it is served.
 *
 * @param sitePath - The page's path on the documentation site, e.g. `/rules/range`, or `/` for the home.
 * @returns The absolute URL on the documentation site.
 */
export function docsCanonicalUrl(sitePath: string): string {
	return `${DOCS_ORIGIN}${sitePath}`;
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

/** One page of a vertical other than its hub: a dataset route, or the lab. */
export interface VerticalPage {
	/** The path, e.g. `/books`. */
	readonly path: string;
	/** What the page is called: its landing card's label, or the lab's. */
	readonly label: string;
	/** What it is about: its landing card's blurb, or the lab's description. */
	readonly description: string;
}

/**
 * The pages of a vertical other than its hub, each named and described as its own head names and
 * describes it: every dataset route by its landing card, and the lab where it is served.
 *
 * @param id - The vertical.
 * @returns The pages, in {@link verticalIndexablePaths} order, without the hub.
 */
export function verticalPages(id: VerticalId): readonly VerticalPage[] {
	return verticalIndexablePaths(id)
		.filter((path) => path !== '/')
		.map((path) => {
			const card = DATASET_ROUTES.find((candidate) => candidate.href === path);

			return card === undefined ? { ...LAB_META, path } : { description: card.blurb, label: card.label, path };
		});
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

	if (path === '/') {
		return { canonicalUrl, description: descriptor.pageDescription, title: descriptor.pageTitle };
	}

	const page = verticalPages(id).find((candidate) => candidate.path === path);

	if (page === undefined) {
		return notFoundPageMeta(descriptor.pageTitle);
	}

	const { description, label } = page;

	return { canonicalUrl, description, title: `${label} — ${descriptor.pageTitle}` };
}
