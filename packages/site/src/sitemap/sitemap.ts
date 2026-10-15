/**
 * `sitemap` — the one sitemap for every site under filterenginez.com, built from the sites' own page
 * lists.
 *
 * @remarks
 * ### One file, every host
 *
 * The landing site serves `https://filterenginez.com/sitemap.xml`, and it lists the pages of all eight
 * sites: the apex, the documentation site and the six demo apps. Each of those hosts serves a
 * `robots.txt` naming this file, which is what the sitemaps protocol asks before a sitemap on one host
 * may list another host's URLs, and the Search Console Domain property for `filterenginez.com` covers
 * every subdomain. One generated file is simpler than an index and eight per-host sitemaps, which would
 * need generating into eight builds and kept in step, for the same coverage.
 *
 * ### Generated from the route registries, so it cannot drift
 *
 * - the apex: its home and the pages the Worker serves (`PAGE_PATHS`, which
 *   `tests/tooling/cloudflareDeploy.test.ts` holds to the HTML entries the build renders);
 * - each demo app: its hub, its dataset routes and the lab where it is served, from the verticals
 *   registry through `verticalIndexablePaths`, the same list that gives each of those pages its
 *   canonical URL (`examples-shared/page-meta`);
 * - the documentation: its home and every page in its catalogs (`docsPagePaths`), on the
 *   documentation site only. The React apps' copies under `/docs` declare the documentation site's
 *   URL as their canonical and are not listed.
 *
 * Only canonical URLs appear: no `?f=` filter states, no redirects (each app's `/about` and `/compare`,
 * the documentation site's `/`), no not-found pages.
 *
 * ### The three optional fields
 *
 * `lastmod` is the time of the commit the sites were built from ({@link sitemapLastmod}): every page is
 * rebuilt and redeployed from that commit. `changefreq` and `priority` rank the pages: the home first,
 * then the two explainer pages, the demo hubs, and the dataset and documentation pages. Google ignores
 * both of those (it reads `lastmod` when it is accurate); Bing and other crawlers may use them.
 *
 * @packageDocumentation
 */

import { DOCS_BASE_PATH, DOCS_ORIGIN, verticalIndexablePaths } from '@filter-enginez/examples-shared/page-meta';
import { docsPagePaths } from '@filter-enginez/examples-shared/page-meta-docs';
import { SITE, VERTICALS } from '@filter-enginez/examples-shared/verticals';

import { PAGE_PATHS } from '../siteRequestHandler.js';

/** How often a page is expected to change, in the sitemaps protocol's words. */
export type ChangeFrequency = 'monthly' | 'weekly';

/** One `<url>` of the sitemap, before the shared `lastmod`. */
export interface SitemapEntry {
	/** The absolute, canonical URL. */
	readonly loc: string;
	/** How often the page is expected to change. */
	readonly changefreq: ChangeFrequency;
	/** Its rank among the listed pages, from 0.0 to 1.0. */
	readonly priority: number;
}

/**
 * The priority of each apex page other than the home.
 *
 * @remarks
 * A `Map`, so a page added to `PAGE_PATHS` without a priority here is a build error rather than a
 * guess (see {@link sitemapEntries}).
 */
const APEX_PAGE_PRIORITIES: ReadonlyMap<string, number> = new Map([
	['/compare', 0.8],
	['/how-it-works', 0.9],
]);

/** Each demo app's hub. */
const HUB_PRIORITY = 0.7;

/** A dataset page or the lab. */
const DATASET_PRIORITY = 0.6;

/** The documentation's home. */
const DOCS_HOME_PRIORITY = 0.6;

/** Every other documentation page. */
const DOCS_PAGE_PRIORITY = 0.5;

/**
 * Every URL the sitemap lists, in order: the apex, each demo app in registry order, the documentation.
 *
 * @param apexPagePaths - The apex's pages other than its home; the Worker's `PAGE_PATHS` by default.
 * @returns The entries.
 * @throws When an apex page has no priority in {@link APEX_PAGE_PRIORITIES}.
 */
export function sitemapEntries(apexPagePaths: readonly string[] = PAGE_PATHS): readonly SitemapEntry[] {
	const apexPages = apexPagePaths.map((path): SitemapEntry => {
		const priority = APEX_PAGE_PRIORITIES.get(path);

		if (priority === undefined) {
			throw new Error(`sitemap: the apex page ${path} has no priority. Add it to APEX_PAGE_PRIORITIES in src/sitemap/sitemap.ts.`);
		}

		return { changefreq: 'monthly', loc: `${SITE.productionOrigin}${path}`, priority };
	});
	const demoPages = VERTICALS.flatMap(({ id, productionOrigin }) =>
		verticalIndexablePaths(id).map((path): SitemapEntry => (path === '/'
			? { changefreq: 'weekly', loc: `${productionOrigin}/`, priority: HUB_PRIORITY }
			: { changefreq: 'monthly', loc: `${productionOrigin}${path}`, priority: DATASET_PRIORITY })),
	);
	const docsPages = docsPagePaths().map((path): SitemapEntry => ({
		changefreq: 'monthly',
		loc: `${DOCS_ORIGIN}${path}`,
		priority: path === DOCS_BASE_PATH ? DOCS_HOME_PRIORITY : DOCS_PAGE_PRIORITY,
	}));

	return [{ changefreq: 'weekly', loc: `${SITE.productionOrigin}/`, priority: 1 }, ...apexPages, ...demoPages, ...docsPages];
}

/**
 * The sitemap's `lastmod`: when the sites were last changed, in UTC, to the second.
 *
 * @remarks
 * `SOURCE_DATE_EPOCH`, the reproducible-builds convention, when the build sets it; otherwise the commit
 * time of `HEAD`. Both are properties of the source, never of the moment of the build, so the same
 * commit always yields the same sitemap. CI checks out one commit deep, which still holds `HEAD`, and
 * builds with no Turborepo cache, so a deploy is dated by the commit it ships. (`SOURCE_DATE_EPOCH` is in
 * the build task's `env` in `turbo.json`, so Turborepo passes it through and keys its cache on it; a
 * local build replayed from the cache keeps the date of the commit that built it.)
 *
 * @param sourceDateEpoch - `SOURCE_DATE_EPOCH`: whole seconds since the Unix epoch, or `undefined`.
 * @param headCommitTime - The `HEAD` commit time as git prints it (`%cI`), or `null` outside a repository.
 * @returns A W3C datetime, e.g. `2026-10-14T08:03:28Z`.
 * @throws When neither is available or valid: a sitemap with no date would be wrong, not partial.
 */
export function sitemapLastmod(sourceDateEpoch: string | undefined, headCommitTime: string | null): string {
	let time: number;

	if (sourceDateEpoch !== undefined && sourceDateEpoch !== '') {
		if (!/^\d+$/u.test(sourceDateEpoch)) {
			throw new Error(`sitemap: SOURCE_DATE_EPOCH must be whole seconds since the epoch, not "${sourceDateEpoch}".`);
		}
		time = Number(sourceDateEpoch) * 1000;
	} else if (headCommitTime === null) {
		throw new Error('sitemap: no date for lastmod. Build inside the git checkout, or set SOURCE_DATE_EPOCH.');
	} else {
		time = Date.parse(headCommitTime);
		if (Number.isNaN(time)) {
			throw new Error(`sitemap: cannot read the HEAD commit time "${headCommitTime}".`);
		}
	}

	return new Date(time).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/**
 * Escape text for an XML element.
 *
 * @param text - The text.
 * @returns The text with `&`, `<`, `>`, `"` and `'` escaped.
 */
function escapeXml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/**
 * Render the sitemap.
 *
 * @param entries - The URLs, from {@link sitemapEntries}.
 * @param lastmod - The shared `lastmod`, from {@link sitemapLastmod}.
 * @returns The XML document.
 */
export function renderSitemap(entries: readonly SitemapEntry[], lastmod: string): string {
	const urls = entries.map(({ changefreq, loc, priority }) => [
		'\t<url>',
		`\t\t<loc>${escapeXml(loc)}</loc>`,
		`\t\t<lastmod>${lastmod}</lastmod>`,
		`\t\t<changefreq>${changefreq}</changefreq>`,
		`\t\t<priority>${priority.toFixed(1)}</priority>`,
		'\t</url>',
	].join('\n'));

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		'</urlset>',
		'',
	].join('\n');
}
