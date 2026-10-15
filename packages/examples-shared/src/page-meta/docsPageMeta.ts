/**
 * `page-meta/docsPageMeta` — the title, description and canonical URL of every documentation page.
 *
 * @remarks
 * The documentation is served by its own site, `docs.filterenginez.com`, and under `/docs` by the two
 * React demo apps, from the same routes (`../docs/docsRoutes.tsx`). Every page is canonical on the
 * documentation site whichever host serves it, so the copies in the React apps are folded into the
 * documentation site's rather than competing with them, and only the documentation site's appear in the
 * sitemap ({@link docsPagePaths}).
 *
 * The pages are the documentation home, one page per rule and per algorithm (named by the same
 * catalogs the pages render), the playground and the API reference. The words come from the content
 * modules that hold no React (`../docs/content/rulesContent.ts`, `../docs/content/algorithmsText.ts`),
 * so the landing site's build can read them for the sitemap.
 *
 * Its own subpath, apart from `./pageMeta.ts`: the rule catalog is tens of kilobytes of text that only
 * the documentation needs, and the React apps load this module when a documentation route is visited,
 * never at startup.
 *
 * @packageDocumentation
 */

import { ALGORITHM_TEXTS } from '../docs/content/algorithmsText.js';
import { RULE_DOCS } from '../docs/content/rulesContent.js';
import { BRAND_NAME, DOCS_BASE_PATH, docsCanonicalUrl, notFoundPageMeta, type PageMeta } from './pageMeta.js';

/** The documentation home's title, which the documentation site's HTML shell carries too. */
export const DOCS_HOME_TITLE = `${BRAND_NAME} — Documentation`;

/** The documentation home's description, which the documentation site's HTML shell carries too. */
export const DOCS_HOME_DESCRIPTION
	= 'Filter EngineZ documentation — the 15-rule filter catalog, the acceleration algorithms, a live in-browser playground, and the API reference.';

/** The suffix every documentation page's title ends with, after the page's own name. */
const DOCS_TITLE_SUFFIX = `${BRAND_NAME} docs`;

/** One documentation page: its path, and what it is called and about. */
interface DocsPage {
	/** The path, under `/docs`. */
	readonly path: string;
	/** The page's own name, before {@link DOCS_TITLE_SUFFIX}. */
	readonly name: string;
	/** The meta description. */
	readonly description: string;
}

/**
 * Every documentation page except the home, in sidebar order.
 *
 * @remarks
 * Built once, at module load: the catalogs are constants.
 */
const DOCS_PAGES: readonly DocsPage[] = [
	...RULE_DOCS.map((rule) => ({
		description: `${rule.name}: ${rule.simple}`,
		name: rule.name,
		path: `${DOCS_BASE_PATH}/rules/${rule.id}`,
	})),
	...ALGORITHM_TEXTS.map((algorithm) => ({
		description: `${algorithm.name}: ${algorithm.simple}`,
		name: algorithm.name,
		path: `${DOCS_BASE_PATH}/algorithms/${algorithm.id}`,
	})),
	{
		description:
			'Edit a JSON FilterEngineConfig and run the real Filter EngineZ engine against a dataset, right in your browser — the same engine and config that run server-side.',
		name: 'Playground',
		path: `${DOCS_BASE_PATH}/playground`,
	},
	{
		description:
			'The Filter EngineZ public API at a glance, grouped by area: the engine, the rule factories, composition, JSON config, acceleration and the reactive bindings.',
		name: 'API reference',
		path: `${DOCS_BASE_PATH}/api`,
	},
];

/**
 * Every documentation path that is a page: the home, then {@link DOCS_PAGES}.
 *
 * @returns Paths under `/docs`, each canonical on the documentation site.
 */
export function docsPagePaths(): readonly string[] {
	return [DOCS_BASE_PATH, ...DOCS_PAGES.map((page) => page.path)];
}

/**
 * A documentation path's metadata, canonical on the documentation site whichever host serves it.
 *
 * @remarks
 * A trailing slash is ignored, as the router ignores it. A path under `/docs` that names no page — an
 * unknown rule id, say — is not found, as the page itself reports.
 *
 * @param pathname - A path under `/docs`.
 * @returns The metadata.
 */
export function docsPageMeta(pathname: string): PageMeta {
	const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

	if (path === DOCS_BASE_PATH) {
		return { canonicalUrl: docsCanonicalUrl(path), description: DOCS_HOME_DESCRIPTION, title: DOCS_HOME_TITLE };
	}

	const page = DOCS_PAGES.find((candidate) => candidate.path === path);

	return page === undefined
		? notFoundPageMeta(DOCS_HOME_TITLE)
		: { canonicalUrl: docsCanonicalUrl(path), description: page.description, title: `${page.name} — ${DOCS_TITLE_SUFFIX}` };
}
