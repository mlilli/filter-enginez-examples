/**
 * `route-shells` — each host's routes, as its router declares them and as the page catalog lists them,
 * and the HTML shell the build writes for each.
 *
 * @remarks
 * Every client-routed host's build ends by writing one HTML shell per page it serves and a `404.html`
 * (`../write-route-shells.mjs`), so its Workers static assets answer a known page with a 200 and any
 * other path with the app's not-found page and a 404. The pages come from the catalog in
 * `packages/examples-shared/src/page-meta/hostPages.ts`; the app's router decides what actually
 * renders. When the two disagree, a page renders with the wrong status: a route the catalog lacks is
 * a working page served as a 404, and a catalog page the router lacks is a not-found page served as
 * a 200. Nothing at runtime shows either, so the build compares them first ({@link routeMismatches})
 * and fails on any difference, for SvelteKit too (`../check-app-routes.mjs`), whose server answers
 * with the right status by itself but whose routes are the same list's.
 *
 * Each router is read as text, the one place its routes are declared: the React apps' route tables
 * and dataset registries, the documentation's children, Vue Router's and Angular's route arrays, the
 * vanilla app's route table and SvelteKit's `src/routes` directories. A parameter segment (`:datasetId`,
 * `rules/:ruleId`) is a pattern that matches any one segment. A reading that finds no routes is an
 * error, never an empty list that agrees with nothing.
 *
 * `tests/tooling/routeShells.test.ts` checks every host's router against the catalog and every
 * function here.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importTypeScript } from './typescript-source.mjs';

/** The repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The page catalog every host's routes are held to. */
export const HOST_PAGES_MODULE = join(REPO_ROOT, 'packages/examples-shared/src/page-meta/hostPages.ts');

/** The file a host answers every unknown path with (`not_found_handling: "404-page"`). */
export const NOT_FOUND_SHELL = '404.html';

/** Each routed host's package directory under `packages/`. */
export const HOST_PACKAGES = Object.freeze({
	angular: 'examples-angular',
	docs: 'examples-docs',
	'react-plain': 'examples-react-plain',
	'react-rtk': 'examples-react-rtk',
	sveltekit: 'examples-sveltekit',
	vanilla: 'examples-vanilla',
	vue: 'examples-vue',
});

/**
 * Load the page catalog, and the constants a router names its paths by.
 *
 * @returns {Promise<import('./route-shells.d.mts').RouteCatalog>} The catalog's functions and the constants.
 */
export async function loadRouteCatalog() {
	const hostPages = /** @type {import('./route-shells.d.mts').HostPagesModule} */ (await importTypeScript(HOST_PAGES_MODULE));
	const pageMeta = /** @type {import('./route-shells.d.mts').RouteConstants} */ (
		await importTypeScript(join(REPO_ROOT, 'packages/examples-shared/src/page-meta/pageMeta.ts'))
	);
	const verticals = /** @type {{ LAB_ROUTE_PATH: string }} */ (await importTypeScript(join(REPO_ROOT, 'packages/examples-shared/src/verticals/verticals.ts')));

	return {
		constants: { DOCS_APP_BASE_PATH: pageMeta.DOCS_APP_BASE_PATH, DOCS_SITE_BASE_PATH: pageMeta.DOCS_SITE_BASE_PATH, LAB_ROUTE_PATH: verticals.LAB_ROUTE_PATH },
		hostPages,
	};
}

/**
 * Read a repository file as text.
 *
 * @param {string} path - Path relative to the repository root.
 * @returns {string} The contents.
 */
function readRepoFile(path) {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * The text of one array literal in a source file, between its `[` and the `]` that closes it.
 *
 * @param {string} path - The file, relative to the repository root.
 * @param {RegExp} declaration - Matches the declaration up to and including its opening `[`.
 * @returns {string} The array's body.
 * @throws {Error} When the declaration is not in the file, or its `]` is not found.
 */
function arrayBody(path, declaration) {
	const source = readRepoFile(path);
	const start = declaration.exec(source);

	if (start === null) {
		throw new Error(`${path}: no ${declaration.source} — the route table moved or was renamed; update scripts/lib/route-shells.mjs with it.`);
	}

	let depth = 1;

	for (let index = start.index + start[0].length; index < source.length; index += 1) {
		const character = source.charAt(index);

		if (character === '[') {
			depth += 1;
		} else if (character === ']') {
			depth -= 1;
		}
		if (depth === 0) {
			return source.slice(start.index + start[0].length, index);
		}
	}

	throw new Error(`${path}: the array opened by ${declaration.source} never closes.`);
}

/**
 * Every `path: '…'` string in a route table's text.
 *
 * @param {string} body - The table's text.
 * @returns {string[]} The paths, in order.
 */
function quotedPaths(body) {
	return [...body.matchAll(/\bpath: '([^']*)'/gu)].map(([, path]) => path ?? '');
}

/**
 * The documentation section's child paths, from its route list (`docsRoutes.tsx`).
 *
 * @returns {string[]} The children, `''` for the index.
 */
function docsChildPaths() {
	const path = 'packages/examples-shared/src/docs/docsRoutes.tsx';

	return [...arrayBody(path, /export const DOCS_PAGE_ROUTES: readonly DocsPageRoute\[\] = \[/u).matchAll(/\bdocsPage\('([^']*)',/gu)].map(([, child]) => child ?? '');
}

/**
 * The documentation section's route patterns under a base path, as the router mounts it.
 *
 * @param {string} basePath - `''` or `/docs`.
 * @returns {string[]} The patterns.
 */
function docsPatterns(basePath) {
	return docsChildPaths().map((child) => {
		if (child !== '') {
			return `${basePath}/${child}`;
		}

		return basePath === '' ? '/' : basePath;
	});
}

/**
 * The dataset ids a React app's `/:datasetId` route resolves (`src/datasets.tsx`): one top-level
 * `id` per entry, and as many as the exported list holds.
 *
 * @param {string} packageDirectory - The app's package directory.
 * @returns {string[]} The ids.
 */
function reactDatasetIds(packageDirectory) {
	const path = `packages/${packageDirectory}/src/datasets.tsx`;
	const ids = [...readRepoFile(path).matchAll(/^\tid: '([a-z-]+)',$/gmu)].map(([, id]) => id ?? '');
	const listed = arrayBody(path, /export const datasets: readonly DatasetEntry\[\] = \[/u).split(',').filter((name) => name.trim() !== '');

	if (ids.length !== listed.length) {
		throw new Error(`${path}: ${String(ids.length)} dataset ids for ${String(listed.length)} entries in \`datasets\`; read it again in scripts/lib/route-shells.mjs.`);
	}

	return ids;
}

/**
 * A React route table's patterns (`src/App.tsx`): its literal paths but the `*` catch-all, the
 * constants it names, the documentation where it mounts it, and every dataset id in place of
 * `/:datasetId`.
 *
 * @param {string} packageDirectory - The app's package directory.
 * @param {import('./route-shells.d.mts').RouteConstants & { LAB_ROUTE_PATH: string }} constants - The values a table names paths by.
 * @returns {string[]} The patterns.
 * @throws {Error} When the table names a path in a way this does not read.
 */
function reactPatterns(packageDirectory, constants) {
	const path = `packages/${packageDirectory}/src/App.tsx`;
	const body = arrayBody(path, /const ROUTES: RouteObject\[\] = \[/u);
	const patterns = quotedPaths(body)
		.filter((pattern) => pattern !== '*')
		.flatMap((pattern) => (pattern === '/:datasetId' ? reactDatasetIds(packageDirectory).map((id) => `/${id}`) : [pattern]));

	for (const [, name] of body.matchAll(/\bpath: ([A-Z_]+)\b/gu)) {
		if (name !== 'LAB_ROUTE_PATH') {
			throw new Error(`${path}: a route's path is the constant ${name ?? ''}; teach scripts/lib/route-shells.mjs its value.`);
		}
		patterns.push(constants.LAB_ROUTE_PATH);
	}
	for (const [, base] of body.matchAll(/\bdocsRouteAt\(([A-Z_]+)\)/gu)) {
		if (base === 'DOCS_APP_BASE_PATH') {
			patterns.push(...docsPatterns(constants.DOCS_APP_BASE_PATH));
		} else if (base === 'DOCS_SITE_BASE_PATH') {
			patterns.push(...docsPatterns(constants.DOCS_SITE_BASE_PATH));
		} else {
			throw new Error(`${path}: the documentation is mounted at ${base ?? ''}; teach scripts/lib/route-shells.mjs its value.`);
		}
	}

	return patterns;
}

/**
 * SvelteKit's page routes: every directory under `src/routes` with a `+page.svelte`.
 *
 * @returns {string[]} The paths.
 */
function svelteKitPatterns() {
	const routesDirectory = resolve(REPO_ROOT, 'packages/examples-sveltekit/src/routes');

	return readdirSync(routesDirectory, { recursive: true })
		.map((entry) => String(entry))
		.filter((entry) => entry === '+page.svelte' || entry.endsWith(`${sep}+page.svelte`))
		.map((entry) => `/${posix.dirname(entry.split(sep).join('/'))}`.replace(/^\/\.$/u, '/'));
}

/**
 * The route patterns a host's router declares, other than its catch-all.
 *
 * @param {import('./route-shells.d.mts').RoutedHost} host - The host.
 * @param {import('./route-shells.d.mts').RouteConstants & { LAB_ROUTE_PATH: string }} constants - The values a route table names paths by.
 * @returns {{ readonly source: string, readonly patterns: readonly string[] }} The file the routes are read from, and the patterns.
 * @throws {Error} When the router declares no route, or one this does not read.
 */
export function routerPatterns(host, constants) {
	const packageDirectory = HOST_PACKAGES[host];
	/** @type {{ source: string, patterns: string[] }} */
	let read;

	switch (host) {
		case 'angular': {
			const source = `packages/${packageDirectory}/src/app/app.routes.ts`;

			read = { patterns: quotedPaths(arrayBody(source, /export const routes: Routes = \[/u)).filter((path) => path !== '**').map((path) => `/${path}`), source };
			break;
		}
		case 'docs':
		case 'react-plain':
		case 'react-rtk':
			read = { patterns: reactPatterns(packageDirectory, constants), source: `packages/${packageDirectory}/src/App.tsx` };
			break;
		case 'sveltekit':
			read = { patterns: svelteKitPatterns(), source: `packages/${packageDirectory}/src/routes` };
			break;
		case 'vanilla': {
			const source = `packages/${packageDirectory}/src/main.ts`;

			read = { patterns: quotedPaths(arrayBody(source, /const routes: readonly Route\[\] = \[/u)).filter((path) => path !== '*'), source };
			break;
		}
		case 'vue': {
			const source = `packages/${packageDirectory}/src/router.ts`;

			read = { patterns: quotedPaths(arrayBody(source, /const routes: RouteRecordRaw\[\] = \[/u)).filter((path) => path !== '/:pathMatch(.*)*'), source };
			break;
		}
		default:
			throw new Error(`route-shells: no router is known for the host "${String(host)}".`);
	}

	if (read.patterns.length === 0) {
		throw new Error(`${read.source}: no routes read; a check that read nothing would agree with nothing.`);
	}

	return read;
}

/**
 * Whether a path matches a route pattern, segment by segment: a `:name` segment matches any one
 * non-empty segment, every other segment itself.
 *
 * @param {string} path - A page's path.
 * @param {string} pattern - A route pattern.
 * @returns {boolean} Whether it matches.
 */
export function pathMatchesPattern(path, pattern) {
	const segmentsOf = (/** @type {string} */ value) => (value === '/' ? [] : value.slice(1).split('/'));
	const pathSegments = segmentsOf(path);
	const patternSegments = segmentsOf(pattern);

	return pathSegments.length === patternSegments.length
		&& patternSegments.every((segment, index) => (segment.startsWith(':') ? pathSegments[index] !== '' : segment === pathSegments[index]));
}

/**
 * Where a router and a host's page list disagree.
 *
 * @param {readonly string[]} patterns - The router's patterns.
 * @param {readonly string[]} paths - The host's pages.
 * @returns {{ readonly unrouted: readonly string[], readonly unlisted: readonly string[] }} The pages no
 *   route renders, and the routes no page uses. Both empty when the two agree.
 */
export function routeMismatches(patterns, paths) {
	return {
		unlisted: patterns.filter((pattern) => !paths.some((path) => pathMatchesPattern(path, pattern))),
		unrouted: paths.filter((path) => !patterns.some((pattern) => pathMatchesPattern(path, pattern))),
	};
}

/**
 * Check a host's router against its page list.
 *
 * @param {import('./route-shells.d.mts').RoutedHost} host - The host.
 * @param {import('./route-shells.d.mts').RouteCatalog} catalog - From {@link loadRouteCatalog}.
 * @returns {readonly string[]} The host's pages, when the two agree.
 * @throws {Error} Naming each disagreement and both files, when they do not.
 */
export function checkRouterAgainstCatalog(host, catalog) {
	const paths = catalog.hostPages.hostPagePaths(host);
	const { patterns, source } = routerPatterns(host, catalog.constants);
	const { unlisted, unrouted } = routeMismatches(patterns, paths);

	if (unlisted.length > 0 || unrouted.length > 0) {
		// SvelteKit's server answers by its routes alone, so there the cost is the lists the catalog feeds
		// (the sitemap, `llms.txt`, the comparison page); everywhere else it is the wrong status code.
		const isServerRouted = !catalog.hostPages.isShellHost(host);
		const unroutedCost = isServerRouted ? 'it is listed in the sitemap but answers 404' : 'it would be served as a 200 that shows the not-found page';
		const unlistedCost = isServerRouted ? 'it is missing from the sitemap and every list the catalog feeds' : 'it would be served as a 404';

		throw new Error([
			`${host}: the router (${source}) and the page catalog (${relative(REPO_ROOT, HOST_PAGES_MODULE)}) disagree.`,
			...unrouted.map((path) => `  ${path} is a page in the catalog, but no route renders it: ${unroutedCost}.`),
			...unlisted.map((pattern) => `  ${pattern} is a route, but the catalog lists no page for it: ${unlistedCost}. Add it to the vertical's routes (examples-shared/src/verticals/verticals.ts).`),
		].join('\n'));
	}

	return paths;
}

/**
 * Escape text for an HTML attribute value or element.
 *
 * @param {string} text - The text.
 * @returns {string} The text with `&`, `<`, `>` and `"` escaped.
 */
function escapeHtml(text) {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** The page's `<title>`. */
const TITLE = /<title>[^<]*<\/title>/gu;

/** The page's `<meta name="description">`, written across lines or not. */
const DESCRIPTION = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gu;

/** A canonical link or a robots meta, which a built page must not carry before its shells are written. */
const INDEXING = /<link\b[^>]*\brel="canonical"|<meta\b[^>]*\bname="robots"/u;

/**
 * Write a page's head into a built page: its title, its description, and its canonical link or, for a
 * page that is not indexed, a `noindex` robots meta — the same tags `applyPageMeta` writes in the
 * browser.
 *
 * @param {string} html - The built page, carrying exactly one `<title>` and one description, and no
 *   canonical link or robots meta.
 * @param {import('./route-shells.d.mts').ShellPageMeta} meta - The page's head.
 * @returns {string} The page with that head.
 * @throws {Error} When the page does not have the shape above.
 */
export function writeShellHead(html, meta) {
	const titles = html.match(TITLE) ?? [];
	const descriptions = html.match(DESCRIPTION) ?? [];

	if (titles.length !== 1 || descriptions.length !== 1) {
		throw new Error(`the built page has ${String(titles.length)} <title> and ${String(descriptions.length)} <meta name="description">; it needs exactly one of each.`);
	}
	if (INDEXING.test(html)) {
		throw new Error('the built page already carries a canonical link or a robots meta; its shells are written once, from a fresh build.');
	}

	const indexing = meta.canonicalUrl === null ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`;

	return html
		.replace(TITLE, () => `<title>${escapeHtml(meta.title)}</title>`)
		.replace(DESCRIPTION, () => `<meta name="description" content="${escapeHtml(meta.description)}" />\n\t\t${indexing}`);
}
