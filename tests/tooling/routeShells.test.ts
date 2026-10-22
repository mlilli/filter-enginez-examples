/**
 * Every host answers a page it serves with a 200 and any other path with its not-found page and a 404:
 * each router serves exactly the page catalog's list, and each client-routed host's build writes a
 * shell for every page in it.
 *
 * @remarks
 * The client-routed hosts (the two React apps, Vue, Angular, vanilla and the documentation site) are
 * Workers static assets with `not_found_handling: "404-page"`: a path with a file is a 200, any other
 * path the nearest `404.html` with a 404. Their builds write those files from the catalog in
 * `packages/examples-shared/src/page-meta/hostPages.ts` (`scripts/write-route-shells.mjs`); SvelteKit's
 * server answers by its routes alone. What would fail silently, and where:
 *
 * - **A router and the catalog that disagree.** A route the catalog lacks is a working page served
 *   with a 404, which a crawler drops; a catalog page no route renders is the not-found page served
 *   with a 200. Neither shows in a browser. Every router is read here and held to the catalog.
 * - **A build that stops writing the shells,** or writes them where the host does not deploy from:
 *   every page would be a 404. Each build script must run the step on the directory its
 *   `wrangler.jsonc` deploys, after every step that edits `index.html` and before the corpus strip.
 * - **A shell for a page the catalog lists, missing.** The step itself is run here on a fixture build
 *   for every host, and every page's shell is checked for the head that page's catalog entry gives.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import {
	HOST_PACKAGES,
	loadRouteCatalog,
	NOT_FOUND_SHELL,
	pathMatchesPattern,
	routeMismatches,
	routerPatterns,
	writeShellHead,
} from '../../scripts/lib/route-shells.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

/** The step a client-routed host's build writes its shells with. */
const WRITE_STEP = 'node ../../scripts/write-route-shells.mjs';

/** The step SvelteKit's build checks its routes with. */
const CHECK_STEP = 'node ../../scripts/check-app-routes.mjs --host sveltekit';

/** The step every app's build ends with (`buildsStripLocalCorpus.test.ts`). */
const STRIP_STEP = 'node ../../scripts/strip-local-corpus.mjs';

/** A built page, as small as the step accepts: one title, one description, an app root. */
const FIXTURE_PAGE = [
	'<!doctype html>',
	'<html lang="en">',
	'\t<head>',
	'\t\t<title>Fixture</title>',
	'\t\t<meta',
	'\t\t\tname="description"',
	'\t\t\tcontent="Fixture"',
	'\t\t/>',
	'\t</head>',
	'\t<body><div id="root"></div></body>',
	'</html>',
	'',
].join('\n');

// The catalog the build reads, loaded the way the build loads it.
const catalog = await loadRouteCatalog();
const { hostNotFoundMeta, hostPagePaths, hostPages, isShellHost, ROUTED_HOSTS, shellFileName } = catalog.hostPages;
const targets = listDeployTargets();
const scratchDirectories: string[] = [];

afterAll(() => {
	for (const directory of scratchDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
});

/**
 * A host's build script's steps.
 *
 * @param host - The host.
 * @returns The `&&`-separated commands, trimmed.
 */
function buildSteps(host: keyof typeof HOST_PACKAGES): readonly string[] {
	const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', HOST_PACKAGES[host], 'package.json'), 'utf8')) as {
		readonly scripts?: Readonly<Record<string, string>>;
	};

	return (manifest.scripts?.['build'] ?? '').split('&&').map((step) => step.trim());
}

describe('the routed hosts', () => {
	it('are the six demo apps and the documentation site, each a deployed package', () => {
		expect(ROUTED_HOSTS).toHaveLength(7);
		expect(ROUTED_HOSTS.filter((host) => isShellHost(host))).toHaveLength(6);
		for (const host of ROUTED_HOSTS) {
			expect(targets.some((target) => target.packageDirectory === HOST_PACKAGES[host]), host).toBe(true);
		}
	});
});

describe.each(ROUTED_HOSTS)('%s', (host) => {
	const paths = hostPagePaths(host);

	it('serves exactly the catalog’s pages: every route is a page, every page a route', () => {
		const { patterns, source } = routerPatterns(host, catalog.constants);

		expect(paths.length).toBeGreaterThan(3);
		expect(patterns.length, `no routes read from ${source}`).toBeGreaterThan(3);
		expect(routeMismatches(patterns, paths), `${source} against the page catalog`).toEqual({ unlisted: [], unrouted: []});
	});

	if (!isShellHost(host)) {
		it('checks its routes in its build, which writes no shells: its server answers by route', () => {
			const steps = buildSteps(host);

			expect(steps).toContain(CHECK_STEP);
			expect(steps.some((step) => step.startsWith(WRITE_STEP))).toBe(false);
			expect(steps.at(-1)?.startsWith(STRIP_STEP)).toBe(true);
		});

		return;
	}

	it('writes its shells in its build, into the directory it deploys, last before the corpus strip', () => {
		const target = targets.find((candidate) => candidate.packageDirectory === HOST_PACKAGES[host]);
		const steps = buildSteps(host);
		const assets = posix.normalize(target?.config.assets?.directory ?? '');

		expect(steps.at(-2)).toBe(`${WRITE_STEP} ${assets} --host ${host}`);
		expect(steps.at(-1)?.startsWith(STRIP_STEP)).toBe(true);
		expect(target?.config.assets?.not_found_handling).toBe('404-page');
	});

	it('names no shell after a file its static directory already holds', () => {
		const staticDirectory = resolve(REPO_ROOT, 'packages', HOST_PACKAGES[host], 'public');
		const staticFiles = new Set(existsSync(staticDirectory) ? readdirSync(staticDirectory, { recursive: true }).map((entry) => String(entry).split('\\').join('/')) : []);
		const shells = [...paths.map((path) => shellFileName(path)), NOT_FOUND_SHELL];

		expect(staticFiles.size).toBeGreaterThan(3);
		expect(new Set(shells).size).toBe(shells.length);
		expect(shells.filter((file) => staticFiles.has(file))).toEqual([]);
	});

	it('gets a shell for every page, each with that page’s head, and a 404.html that is not indexed', () => {
		const output = mkdtempSync(join(tmpdir(), `route-shells-${host}-`));

		scratchDirectories.push(output);
		writeFileSync(join(output, 'index.html'), FIXTURE_PAGE);

		const run = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts/write-route-shells.mjs'), output, '--host', host], { encoding: 'utf8' });

		expect(run.status, run.stderr).toBe(0);
		for (const { meta, path } of hostPages(host)) {
			const shell = join(output, shellFileName(path));

			expect(existsSync(shell), `no shell for ${path}`).toBe(true);
			expect(readFileSync(shell, 'utf8')).toBe(writeShellHead(FIXTURE_PAGE, meta));
		}
		expect(readFileSync(join(output, NOT_FOUND_SHELL), 'utf8')).toBe(writeShellHead(FIXTURE_PAGE, hostNotFoundMeta(host)));
		expect(readFileSync(join(output, NOT_FOUND_SHELL), 'utf8')).toContain('<meta name="robots" content="noindex" />');
	});
});

describe('the write step', () => {
	it('refuses a build it has already run on, rather than writing every head twice', () => {
		const output = mkdtempSync(join(tmpdir(), 'route-shells-twice-'));

		scratchDirectories.push(output);
		writeFileSync(join(output, 'index.html'), FIXTURE_PAGE);

		const script = resolve(REPO_ROOT, 'scripts/write-route-shells.mjs');

		expect(spawnSync(process.execPath, [script, output, '--host', 'vue'], { encoding: 'utf8' }).status).toBe(0);

		const second = spawnSync(process.execPath, [script, output, '--host', 'vue'], { encoding: 'utf8' });

		expect(second.status).toBe(1);
		expect(second.stderr).toContain('already');
	});

	it('refuses a host that writes no shells, and a build with no index.html', () => {
		const output = mkdtempSync(join(tmpdir(), 'route-shells-refusals-'));

		scratchDirectories.push(output);

		const script = resolve(REPO_ROOT, 'scripts/write-route-shells.mjs');
		const noIndex = spawnSync(process.execPath, [script, output, '--host', 'vue'], { encoding: 'utf8' });

		expect(noIndex.status).toBe(1);
		expect(noIndex.stderr).toContain('does not exist');
		writeFileSync(join(output, 'index.html'), FIXTURE_PAGE);

		const svelteKit = spawnSync(process.execPath, [script, output, '--host', 'sveltekit'], { encoding: 'utf8' });

		expect(svelteKit.status).toBe(1);
		expect(svelteKit.stderr).toContain('not a host that writes route shells');
	});
});

describe('the route reading', () => {
	it('matches a parameter segment to any one segment, and every other segment to itself', () => {
		expect(pathMatchesPattern('/', '/')).toBe(true);
		expect(pathMatchesPattern('/wine', '/wine')).toBe(true);
		expect(pathMatchesPattern('/docs/rules/range', '/docs/rules/:ruleId')).toBe(true);
		expect(pathMatchesPattern('/docs/rules', '/docs/rules/:ruleId')).toBe(false);
		expect(pathMatchesPattern('/wine', '/')).toBe(false);
		expect(pathMatchesPattern('/wine-server', '/wine')).toBe(false);
	});

	it('reports a page no route renders and a route no page uses', () => {
		expect(routeMismatches(['/', '/books', '/lab'], ['/', '/books', '/wine'])).toEqual({ unlisted: ['/lab'], unrouted: ['/wine']});
	});
});

describe('the head a shell carries', () => {
	it('is the page’s title, description and canonical link, escaped, in place of the build’s', () => {
		const html = writeShellHead(FIXTURE_PAGE, { canonicalUrl: 'https://vue.filterenginez.com/wine', description: 'Bottles & "notes"', title: 'Wine <reviews>' });

		expect(html).toContain('<title>Wine &lt;reviews&gt;</title>');
		expect(html).toContain('<meta name="description" content="Bottles &amp; &quot;notes&quot;" />');
		expect(html).toContain('<link rel="canonical" href="https://vue.filterenginez.com/wine" />');
		expect(html).not.toContain('Fixture');
		expect(html).not.toContain('name="robots"');
	});

	it('is noindex, with no canonical link, for a page that is not indexed', () => {
		const html = writeShellHead(FIXTURE_PAGE, { canonicalUrl: null, description: '', title: 'Page not found' });

		expect(html).toContain('<meta name="robots" content="noindex" />');
		expect(html).not.toContain('rel="canonical"');
	});

	it('refuses a page without exactly one title and one description', () => {
		const meta = { canonicalUrl: null, description: '', title: 'x' };

		expect(() => writeShellHead(FIXTURE_PAGE.replace('<title>Fixture</title>', ''), meta)).toThrow(/0 <title>/u);
		expect(() => writeShellHead(FIXTURE_PAGE.replace('</head>', '<meta name="description" content="again" /></head>'), meta)).toThrow(/2 <meta name="description">/u);
	});
});
