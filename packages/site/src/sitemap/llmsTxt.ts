/**
 * `llmsTxt` — the `/llms.txt` every host under filterenginez.com serves, built from the same page lists
 * as the sitemap.
 *
 * @remarks
 * ### What the file is
 *
 * `llms.txt` (llmstxt.org) is a Markdown index of a site for language-model tools: an H1 naming the
 * site, a `>` one-line summary, a short paragraph, then `##` sections of `[title](url): note` link
 * lists. Each host serves its own at its root, because a tool asks the host it is reading: the apex,
 * the documentation site and each of the six demo apps.
 *
 * ### Generated from the route registries, like the sitemap
 *
 * Every link comes from a list something else already depends on: the apex pages from the Worker's
 * `PAGE_PATHS`, each demo app's pages from the verticals registry through `verticalPages` (the same
 * words its own head carries), and the documentation's pages from the catalogs through `docsPages`. So
 * every link is a page the sitemap lists too (`llmsTxt.test.ts` holds the two to that), apart from the
 * two repositories and the npm scope.
 *
 * - **A demo app's file** leads with that app's own pages, then the documentation's entry points, the
 *   six demos, the landing site and the source.
 * - **The documentation site's file** lists every page: one per rule, one per algorithm, the
 *   playground and the API reference.
 * - **The apex's file** introduces the project and links to the rest.
 *
 * ### Shipped as a static file, as `robots.txt` is
 *
 * The six apps build with three different toolchains, so rather than a build hook in each, the files
 * are committed in each host's `public/` (`static/` under SvelteKit), which every build copies as-is,
 * and Workers static assets serve a `.txt` file as `text/plain; charset=utf-8`. The committed files
 * are file snapshots of {@link renderLlmsTxt}: the suite fails when one differs from what the
 * registries produce, and `vitest run packages/site/src/sitemap/llmsTxt.test.ts --update` rewrites
 * them. `tests/tooling/llmsTxt.test.ts` checks that every deployed host ships one.
 *
 * @packageDocumentation
 */

import { BRAND_NAME, DOCS_HOME_PATH, DOCS_ORIGIN, docsCanonicalUrl, verticalPages } from '@filter-enginez/examples-shared/page-meta';
import { DOCS_HOME_DESCRIPTION, DOCS_HOME_TITLE, type DocsPage, docsPages } from '@filter-enginez/examples-shared/page-meta-docs';
import { SITE, vertical, type VerticalDescriptor, type VerticalId, VERTICALS } from '@filter-enginez/examples-shared/verticals';

import { PAGE_PATHS } from '../siteRequestHandler.js';

/** A host that serves an `llms.txt`: the apex (`site`), the documentation site, or a demo app. */
export type LlmsTxtHost = VerticalId | 'docs' | 'site';

/** One entry of a section's link list. */
export interface LlmsTxtLink {
	/** The link text. */
	readonly title: string;
	/** The absolute URL. */
	readonly url: string;
	/** What is behind it, in a sentence or two; written after the link. */
	readonly note: string;
}

/** One `##` section. */
export interface LlmsTxtSection {
	/** The heading, without the `## `. */
	readonly heading: string;
	/** Its links, in order. */
	readonly links: readonly LlmsTxtLink[];
}

/** One host's file, before rendering. */
export interface LlmsTxtDocument {
	/** The H1: the host's name. */
	readonly title: string;
	/** The `>` one-line summary. */
	readonly summary: string;
	/** The prose between the summary and the first section, one paragraph per entry. */
	readonly details: readonly string[];
	/** The link lists. */
	readonly sections: readonly LlmsTxtSection[];
}

/** The engine's repository. */
export const ENGINE_REPOSITORY_URL = 'https://github.com/mlilli/filter-enginez';

/** This repository: the demo apps, the documentation site and the landing site. */
export const EXAMPLES_REPOSITORY_URL = 'https://github.com/mlilli/filter-enginez-examples';

/** The npm scope every engine package is published under. */
export const NPM_SCOPE_URL = 'https://www.npmjs.com/org/filter-enginez';

/** The project in one sentence, the apex's summary and every other file's opening line. */
const PROJECT_SUMMARY
	= 'Filter EngineZ is a generic, isomorphic, framework-agnostic TypeScript data filter engine: one engine in the browser, in Node or in a Web Worker, with bindings for React, Svelte, Vue and Angular.';

/**
 * Each apex page other than the home, by its path in `PAGE_PATHS`: its link text and note.
 *
 * @remarks
 * A `Map`, so a page added to `PAGE_PATHS` without an entry here fails the render rather than shipping
 * a link with no words (see {@link siteSection}).
 */
const APEX_PAGES: ReadonlyMap<string, Omit<LlmsTxtLink, 'url'>> = new Map([
	[
		'/compare',
		{
			note: 'One filter state, opened in every demo app that serves its dataset, through the same `?f` URL parameter.',
			title: 'One filter state in six stacks',
		},
	],
	[
		'/how-it-works',
		{
			note: 'How the engine filters without checking every record: eight algorithms, animated, with a live benchmark in the browser.',
			title: 'How the engine works',
		},
	],
]);

/** The documentation's home, at the documentation site's root, which every other host links to. */
const DOCS_HOME_URL = docsCanonicalUrl(DOCS_HOME_PATH);

/** The documentation pages a host other than the documentation site links to, besides the home. */
const DOCS_ENTRY_PATHS: ReadonlySet<string> = new Set(['/playground', '/api']);

/**
 * The hosts that serve an `llms.txt`, in the sitemap's order: the apex, the six demo apps, the
 * documentation site.
 *
 * @returns The hosts.
 */
export function llmsTxtHosts(): readonly LlmsTxtHost[] {
	return ['site', ...VERTICALS.map(({ id }) => id), 'docs'];
}

/**
 * The origin a host is served at.
 *
 * @param host - The host.
 * @returns Its production origin, no trailing slash.
 */
export function llmsTxtOrigin(host: LlmsTxtHost): string {
	switch (host) {
		case 'docs':
			return DOCS_ORIGIN;
		case 'site':
			return SITE.productionOrigin;
		default:
			return vertical(host).productionOrigin;
	}
}

/**
 * The landing site's section: its home and every page the Worker serves.
 *
 * @param apexPagePaths - The apex pages other than the home; the Worker's `PAGE_PATHS` by default.
 * @returns The section.
 * @throws When an apex page has no entry in {@link APEX_PAGES}.
 */
function siteSection(apexPagePaths: readonly string[]): LlmsTxtSection {
	const pages = apexPagePaths.map((path): LlmsTxtLink => {
		const page = APEX_PAGES.get(path);

		if (page === undefined) {
			throw new Error(`llms.txt: the apex page ${path} has no link text. Add it to APEX_PAGES in src/sitemap/llmsTxt.ts.`);
		}

		return { ...page, url: `${SITE.productionOrigin}${path}` };
	});

	return {
		heading: 'Landing site',
		links: [{ note: 'What the engine is, how to install it, and links to everything else.', title: BRAND_NAME, url: `${SITE.productionOrigin}/` }, ...pages],
	};
}

/**
 * A documentation page as a link: its name, its URL on the documentation site, its summary.
 *
 * @param page - The page.
 * @returns The link.
 */
function docsLink({ name, path, summary }: DocsPage): LlmsTxtLink {
	return { note: summary, title: name, url: docsCanonicalUrl(path) };
}

/**
 * The documentation's entry points, for every host but the documentation site: its home, the
 * playground and the API reference.
 *
 * @returns The section.
 */
function docsEntrySection(): LlmsTxtSection {
	return {
		heading: 'Documentation',
		links: [
			{ note: DOCS_HOME_DESCRIPTION, title: DOCS_HOME_TITLE, url: DOCS_HOME_URL },
			...docsPages().filter((page) => DOCS_ENTRY_PATHS.has(page.path)).map(docsLink),
		],
	};
}

/**
 * What a demo app is built with: its framework and the binding it proves.
 *
 * @param descriptor - The app.
 * @returns E.g. `React 19 and @filter-enginez/react-signals`, or `plain TypeScript and no framework`.
 */
function stackDescription({ binding, framework }: VerticalDescriptor): string {
	return binding === null ? 'plain TypeScript and no framework' : `${framework} and ${binding}`;
}

/**
 * The demo apps, each linked at its hub: all six, or the five besides the one whose file this is.
 *
 * @param current - The demo app whose file this is, which lists itself in a section of its own.
 * @returns The section.
 */
function demosSection(current?: VerticalId): LlmsTxtSection {
	return {
		heading: current === undefined ? 'Demos' : 'Other demos',
		links: VERTICALS.filter(({ id }) => id !== current).map((descriptor) => ({
			note: `Built with ${stackDescription(descriptor)}. ${descriptor.blurb}`,
			title: descriptor.name,
			url: `${descriptor.productionOrigin}/`,
		})),
	};
}

/**
 * The source: both repositories and the npm scope.
 *
 * @returns The section.
 */
function sourceSection(): LlmsTxtSection {
	return {
		heading: 'Source',
		links: [
			{ note: 'The engine: its packages, its architecture document and its guides.', title: 'filter-enginez on GitHub', url: ENGINE_REPOSITORY_URL },
			{
				note: 'These sites: the six demo apps, the documentation site, the landing site and the UI they share.',
				title: 'filter-enginez-examples on GitHub',
				url: EXAMPLES_REPOSITORY_URL,
			},
			{ note: 'Every engine package, published under the @filter-enginez scope.', title: '@filter-enginez on npm', url: NPM_SCOPE_URL },
		],
	};
}

/**
 * A demo app's file: its own pages first.
 *
 * @param descriptor - The app.
 * @param apexPagePaths - The apex pages other than the home.
 * @returns The document.
 */
function verticalDocument(descriptor: VerticalDescriptor, apexPagePaths: readonly string[]): LlmsTxtDocument {
	const { id, name, pageDescription, pageTitle, productionOrigin } = descriptor;
	const pageLinks = verticalPages(id).map(({ description, label, path }): LlmsTxtLink => ({ note: description, title: label, url: `${productionOrigin}${path}` }));

	return {
		details: [
			`${PROJECT_SUMMARY} This is one of its six demo apps, which run the same engine over the same three synthetic datasets (books, wine reviews and real-estate listings) under different front-end stacks.`,
			`${name} is built with ${stackDescription(descriptor)}. ${descriptor.blurb}`,
		],
		sections: [
			{ heading: 'This app', links: [{ note: 'The hub: one card per dataset this app serves.', title: name, url: `${productionOrigin}/` }, ...pageLinks]},
			docsEntrySection(),
			demosSection(id),
			siteSection(apexPagePaths),
			sourceSection(),
		],
		summary: pageDescription,
		title: pageTitle,
	};
}

/**
 * The documentation site's file: every page.
 *
 * @param apexPagePaths - The apex pages other than the home.
 * @returns The document.
 */
function docsDocument(apexPagePaths: readonly string[]): LlmsTxtDocument {
	const pages = docsPages();
	const under = (directory: string): readonly LlmsTxtLink[] =>
		pages.filter((page) => page.path.startsWith(`/${directory}/`)).map(docsLink);

	return {
		details: [
			`${PROJECT_SUMMARY} This site documents it: one page per filter rule and per acceleration algorithm, each with a simple and an advanced explanation, a playground that runs the real engine on a JSON config in the browser, and the API reference.`,
		],
		sections: [
			{
				heading: 'Documentation',
				links: [
					{ note: 'A quick start, and the way into the rule catalog, the algorithms, the playground and the API reference.', title: DOCS_HOME_TITLE, url: DOCS_HOME_URL },
					...pages.filter((page) => DOCS_ENTRY_PATHS.has(page.path)).map(docsLink),
				],
			},
			{ heading: 'Rules', links: under('rules') },
			{ heading: 'Algorithms', links: under('algorithms') },
			demosSection(),
			siteSection(apexPagePaths),
			sourceSection(),
		],
		summary: DOCS_HOME_DESCRIPTION,
		title: DOCS_HOME_TITLE,
	};
}

/**
 * The apex's file: the project, and links to everything else.
 *
 * @param apexPagePaths - The apex pages other than the home.
 * @returns The document.
 */
function siteDocument(apexPagePaths: readonly string[]): LlmsTxtDocument {
	return {
		details: [
			'You describe filters as rules, in code or as JSON, and the engine evaluates them over your data, returns what passes, and tells subscribers when that changes. The rules cover ranges, set membership, numeric comparison, date ranges, text and fuzzy search, regular expressions, geo proximity, hierarchies and more, composed with and, or and not; a filter panel can disable the options that would lead to zero results before anyone selects them.',
			'Six demo apps run the same engine over the same three synthetic datasets (books, wine reviews and real-estate listings) under six front-end stacks, and the documentation site covers every rule and algorithm.',
		],
		sections: [siteSection(apexPagePaths), docsEntrySection(), demosSection(), sourceSection()],
		summary: PROJECT_SUMMARY,
		title: BRAND_NAME,
	};
}

/**
 * One host's file.
 *
 * @param host - The host.
 * @param apexPagePaths - The apex pages other than the home; the Worker's `PAGE_PATHS` by default.
 * @returns The document.
 * @throws When an apex page has no entry in {@link APEX_PAGES}.
 */
export function llmsTxtDocument(host: LlmsTxtHost, apexPagePaths: readonly string[] = PAGE_PATHS): LlmsTxtDocument {
	switch (host) {
		case 'docs':
			return docsDocument(apexPagePaths);
		case 'site':
			return siteDocument(apexPagePaths);
		default:
			return verticalDocument(vertical(host), apexPagePaths);
	}
}

/**
 * Render a file.
 *
 * @param document - The document, from {@link llmsTxtDocument}.
 * @returns The Markdown, ending in a newline.
 */
export function renderLlmsTxt({ details, sections, summary, title }: LlmsTxtDocument): string {
	const blocks = [
		`# ${title}`,
		`> ${summary}`,
		...details,
		...sections.map(({ heading, links }) => [`## ${heading}`, '', ...links.map((link) => `- [${link.title}](${link.url}): ${link.note}`)].join('\n')),
	];

	return `${blocks.join('\n\n')}\n`;
}
