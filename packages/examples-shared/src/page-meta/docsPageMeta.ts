/**
 * `page-meta/docsPageMeta` — the title, description and canonical URL of every documentation page.
 *
 * @remarks
 * The documentation is served at the root of its own site, `docs.filterenginez.com`, and under `/docs`
 * by the two React demo apps, from the same routes (`../docs/docsRoutes.tsx`). Each page's path in this
 * catalog is its path on the documentation site (`/rules/range`, `/` for the home); {@link docsPagePaths}
 * places the catalog under either base path. Every page is canonical on the documentation site whichever
 * host serves it, so the copies in the React apps are folded into the documentation site's rather than
 * competing with them, and only the documentation site's appear in the sitemap.
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
import {
	BRAND_NAME,
	DOCS_HOME_PATH,
	type DocsBasePath,
	docsCanonicalUrl,
	docsPathUnder,
	docsSitePath,
	notFoundPageMeta,
	type PageMeta,
} from './pageMeta.js';

/** The documentation home's title, which the documentation site's HTML shell carries too. */
export const DOCS_HOME_TITLE = `${BRAND_NAME} — Documentation`;

/**
 * The documentation home's description, which the documentation site's HTML shell carries too.
 *
 * @remarks
 * The rule count is the catalog's own length, so a rule added to the catalog is counted here, in the
 * head of every documentation page that falls back to the home's description, and in every host's
 * `llms.txt`. The shell is static HTML and states the number itself; `tests/tooling/pageMetaShells.test.ts`
 * holds it to this template and to the catalog.
 */
export const DOCS_HOME_DESCRIPTION = `${BRAND_NAME} documentation — the ${String(RULE_DOCS.length)}-rule filter catalog, the acceleration algorithms, a live in-browser playground, and the API reference.`;

/** The suffix every documentation page's title ends with, after the page's own name. */
const DOCS_TITLE_SUFFIX = `${BRAND_NAME} docs`;

/** One documentation page: its path, and what it is called and about. */
export interface DocsPage {
	/** The path on the documentation site, e.g. `/rules/range`. */
	readonly path: string;
	/** The page's own name, before {@link DOCS_TITLE_SUFFIX}. */
	readonly name: string;
	/** The meta description. */
	readonly description: string;
	/**
	 * What the page is about in one sentence, without its name: the catalog's one-line summary for a
	 * rule or an algorithm, the description itself for the other pages. For a list that already shows
	 * the name, such as the `llms.txt` every host serves.
	 */
	readonly summary: string;
}

/**
 * A page whose one description serves as its summary too: one that is not in a catalog, so there is
 * no shorter sentence to tell apart from it.
 *
 * @param name - The page's own name.
 * @param path - Its path on the documentation site.
 * @param description - Its meta description, and its summary.
 * @returns The page.
 */
function pageDescribedOnce(name: string, path: string, description: string): DocsPage {
	return { description, name, path, summary: description };
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
		path: `/rules/${rule.id}`,
		summary: rule.simple,
	})),
	...ALGORITHM_TEXTS.map((algorithm) => ({
		description: `${algorithm.name}: ${algorithm.simple}`,
		name: algorithm.name,
		path: `/algorithms/${algorithm.id}`,
		summary: algorithm.simple,
	})),
	pageDescribedOnce(
		'Playground',
		'/playground',
		'Edit a JSON FilterEngineConfig and run the real Filter EngineZ engine against a dataset, right in your browser — the same engine and config that run server-side.',
	),
	pageDescribedOnce(
		'API reference',
		'/api',
		'The Filter EngineZ public API at a glance, grouped by area: the engine, the rule factories, composition, JSON config, acceleration and the reactive bindings.',
	),
];

/**
 * Every documentation page except the home, in sidebar order: each rule, each algorithm, the
 * playground and the API reference.
 *
 * @returns The pages, the same list {@link docsPagePaths} and {@link docsPageMeta} read.
 */
export function docsPages(): readonly DocsPage[] {
	return DOCS_PAGES;
}

/**
 * Every documentation path that is a page, under a base path: the home, then {@link DOCS_PAGES}.
 *
 * @param basePath - Where the documentation is served: `''` on the documentation site, `/docs` in a demo app.
 * @returns The paths, each canonical on the documentation site at its path there.
 */
export function docsPagePaths(basePath: DocsBasePath): readonly string[] {
	return [DOCS_HOME_PATH, ...DOCS_PAGES.map((page) => page.path)].map((path) => docsPathUnder(basePath, path));
}

/**
 * A documentation path's metadata, canonical on the documentation site whichever host serves it.
 *
 * @remarks
 * A trailing slash is ignored, as the router ignores it. A path that names no page — an unknown rule
 * id, say, or a path outside the base path — is not found.
 *
 * @param pathname - The URL path, without query or hash.
 * @param basePath - Where the documentation is served: `''` on the documentation site, `/docs` in a demo app.
 * @returns The metadata.
 */
export function docsPageMeta(pathname: string, basePath: DocsBasePath): PageMeta {
	const sitePath = docsSitePath(basePath, pathname) ?? '';
	const path = sitePath.length > 1 && sitePath.endsWith('/') ? sitePath.slice(0, -1) : sitePath;

	if (path === DOCS_HOME_PATH) {
		return { canonicalUrl: docsCanonicalUrl(path), description: DOCS_HOME_DESCRIPTION, title: DOCS_HOME_TITLE };
	}

	const page = DOCS_PAGES.find((candidate) => candidate.path === path);

	return page === undefined
		? notFoundPageMeta(DOCS_HOME_TITLE)
		: { canonicalUrl: docsCanonicalUrl(path), description: page.description, title: `${page.name} — ${DOCS_TITLE_SUFFIX}` };
}
