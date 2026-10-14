/**
 * Every header in every app carries the way home to `filterenginez.com`.
 *
 * @remarks
 * Six apps on six subdomains, plus the documentation site, each render the same header brand in their
 * own framework: the logomark linking home to the landing site, the wordmark repeating that link for
 * the pointer, the app's name in the subtitle linking back to its hub, and "All demos". Nothing but this
 * guard notices a page that renders a header without it — the app works, every unit test of the brand
 * passes, and a visitor on that one page has no way back but the browser's.
 *
 * ### What is asserted
 *
 * 1. **Each framework's brand implementation renders the whole contract.** The implementations are
 *    found, not listed: every source file that renders the `fe-books-app__brand` element. Each must
 *    carry the home link, the hub link and "All demos", by their classes and the shared labels. The two
 *    React apps own no implementation: they render the shared React one from `examples-shared`.
 * 2. **Every page header renders a brand implementation.** A page header is a `<header>` whose class
 *    is the shared app header (`fe-books-app__header`), the documentation's topbar, or a React app's
 *    Tailwind header; headers inside components (a devtools panel, the hub's hero) are not page
 *    headers. Each file rendering one must render the brand, and each app must have at least its
 *    hub, its 404 and a dataset route among them.
 * 3. **The landing site's own pages** link the logomark home the same way.
 *
 * Read as text, with comments stripped, like `headerControlOrder.test.ts`, whose derived-roster shape
 * this follows.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Extensions that can render markup. */
const MARKUP_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/** The six demo apps, each of which must render the header on several pages. */
const VERTICAL_PACKAGES = [
	'examples-angular',
	'examples-react-plain',
	'examples-react-rtk',
	'examples-sveltekit',
	'examples-vanilla',
	'examples-vue',
] as const;

/** The packages that render the brand through the shared React implementation rather than their own. */
const REACT_PACKAGES: ReadonlySet<string> = new Set(['examples-react-plain', 'examples-react-rtk']);

/** How a file renders a brand implementation, per framework. */
const BRAND_RENDER_MARKERS = ['<AppHeaderBrand', 'fe-app-header-brand', 'createAppHeaderBrand(', 'createPageHeader('] as const;

/** What every brand implementation must contain: the three links, by class and shared label. */
const BRAND_CONTRACT = [
	'fe-books-app__home',
	'SITE_HOME_LABEL',
	'fe-books-app__name',
	'fe-books-app__hub',
	'fe-books-app__all-demos',
	'ALL_DEMOS_LABEL',
	'appHeaderLinks',
	'BRAND_NAV_LABEL',
] as const;

/**
 * A `<header>` that is a PAGE header: the shared app header, the documentation's topbar, or a React
 * app's Tailwind header (whose classes are utilities, starting with `flex`).
 */
const PAGE_HEADER_CLASS = /^(?:fe-books-app__header|fe-docs__topbar|flex\b)/u;

/**
 * Strip comments, so prose about a header is never mistaken for one.
 *
 * @param source - Raw file contents.
 * @returns The source with block, line, JSX and HTML comments removed.
 */
function stripComments(source: string): string {
	return source
		.replaceAll(/\{\/\*[\s\S]*?\*\/\}/gu, '')
		.replaceAll(/<!--[\s\S]*?-->/gu, '')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/^\s*\/\/.*$/gmu, '');
}

/**
 * Every rendering source file under a directory: no tests, no specs.
 *
 * @param dir - Absolute directory.
 * @returns Absolute paths.
 */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		if (statSync(path).isDirectory()) {
			return entry === 'node_modules' || entry === 'dist' ? [] : sourceFiles(path);
		}

		const isMarkup = MARKUP_EXTENSIONS.some((extension) => entry.endsWith(extension));

		return isMarkup && !/\.(?:test|spec)\./u.test(entry) && !entry.endsWith('.d.ts') ? [path] : [];
	});
}

/** One source file, comment-stripped, with the package it belongs to. */
interface SourceFile {
	readonly packageName: string;
	readonly path: string;
	readonly source: string;
}

/** Every rendering source file of every `examples-*` package. */
const SOURCES: readonly SourceFile[] = readdirSync(resolve(REPO_ROOT, 'packages'))
	.filter((name) => name.startsWith('examples-'))
	.flatMap((packageName) => {
		const src = resolve(REPO_ROOT, 'packages', packageName, 'src');

		try {
			statSync(src);
		} catch {
			return [];
		}

		return sourceFiles(src).map((path) => ({
			packageName,
			path: relative(REPO_ROOT, path),
			source: stripComments(readFileSync(path, 'utf8')),
		}));
	});

/**
 * The page headers a file renders, by their class attribute.
 *
 * @remarks
 * Markup headers are matched by their `class`/`className` attribute. The framework-free app builds its
 * page headers in code: the dataset shell with `el('header', …)` and the shared class, matched as the
 * class string, and the hub and the 404 through `createPageHeader(…)`, matched by that call.
 *
 * @param source - Comment-stripped file contents.
 * @returns The class of each page header found.
 */
function pageHeaders(source: string): string[] {
	const markup = [...source.matchAll(/<header\s+class(?:Name)?="([^"]*)"/gu)].map(([, className]) => className ?? '');
	const built = source.includes("className: 'fe-books-app__header'") || source.includes('createPageHeader(')
		? ['fe-books-app__header']
		: [];

	return [...markup, ...built].filter((className) => PAGE_HEADER_CLASS.test(className));
}

/**
 * Whether a file renders a brand implementation.
 *
 * @param source - Comment-stripped file contents.
 * @returns `true` when one of {@link BRAND_RENDER_MARKERS} is present.
 */
function rendersBrand(source: string): boolean {
	return BRAND_RENDER_MARKERS.some((marker) => source.includes(marker));
}

/** The brand implementations: every file that renders the `fe-books-app__brand` element. */
const IMPLEMENTATIONS = SOURCES.filter(({ source }) =>
	/class(?:Name)?[=:]\s*['"]fe-books-app__brand['"]|className: 'fe-books-app__brand'/u.test(source),
);

/** Every file that renders a page header. */
const HEADER_SITES = SOURCES.filter(({ source }) => pageHeaders(source).length > 0);

describe('header brand implementations', () => {
	it('finds one per framework: the shared React one, SvelteKit, Vue, Angular and the framework-free app', () => {
		expect([...new Set(IMPLEMENTATIONS.map(({ packageName }) => packageName))].sort()).toEqual([
			'examples-angular',
			'examples-shared',
			'examples-sveltekit',
			'examples-vanilla',
			'examples-vue',
		]);
	});

	it('leaves the React apps without a brand of their own', () => {
		expect(IMPLEMENTATIONS.filter(({ packageName }) => REACT_PACKAGES.has(packageName)).map(({ path }) => path)).toEqual([]);
	});

	it.each(IMPLEMENTATIONS.map(({ path, source }) => [path, source]))('%s renders the home link, the hub link and "All demos"', (_path, source) => {
		expect(BRAND_CONTRACT.filter((token) => !source.includes(token))).toEqual([]);
	});
});

describe('page headers', () => {
	it('finds the hub, the 404 and a dataset route in every app', () => {
		for (const packageName of VERTICAL_PACKAGES) {
			const own = HEADER_SITES.filter((site) => site.packageName === packageName).length;
			// The two React apps share their 404 (and the documentation's topbar) from examples-shared.
			const minimum = REACT_PACKAGES.has(packageName) ? 2 : 3;

			expect(own, `${packageName} renders ${String(own)} page header(s)`).toBeGreaterThanOrEqual(minimum);
		}
	});

	it.each(HEADER_SITES.map(({ path, source }) => [path, source]))('%s renders the header brand', (_path, source) => {
		expect(rendersBrand(source), 'a page header without the brand: no logomark link home, no "All demos"').toBe(true);
	});

	it('keeps no brand link that only goes back to the app’s own hub', () => {
		expect(
			SOURCES.filter(({ source }) => source.includes('back to the dataset hub')).map(({ path }) => path),
		).toEqual([]);
	});
});

describe('the landing site’s pages', () => {
	const pages = readdirSync(resolve(REPO_ROOT, 'packages/site')).filter((entry) => entry.endsWith('.html'));

	it('finds the home, how-it-works, compare and 404 pages', () => {
		expect(pages.slice().sort()).toEqual(['404.html', 'compare.html', 'how-it-works.html', 'index.html']);
	});

	it.each(pages)('%s links the logomark home, the way every app’s header does', (page) => {
		const html = readFileSync(resolve(REPO_ROOT, 'packages/site', page), 'utf8');

		expect(html).toMatch(/<a class="fe-books-app__home" href="\/" aria-label="Filter EngineZ home"(?: aria-current="page")?>/u);
		expect(html).toContain('<header class="fe-books-app__header">');
		expect(html).toContain('class="fe-books-app__mark" src="/mark.svg"');
	});
});
