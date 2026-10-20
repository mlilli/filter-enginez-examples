/**
 * Every deployed host answers `/.well-known/*` with a 404, and advertises no agent catalog anywhere
 * else.
 *
 * @remarks
 * Lighthouse's agent-discovery audit looks for an agent or tool catalog four ways: an `Agentmap` line
 * in `robots.txt`, a `<link rel="ai-catalog">` in the page, a `Link` header with `rel=ai-catalog`, and
 * `/.well-known/ai-catalog.json`. None found makes the audit not applicable; a catalog that fails the
 * schema fails it. These sites offer no agents, tools or services, so the honest answer to each is
 * none — and for the last, a 404. A single-page app's assets answer that path with `index.html` and a
 * 200 instead: a catalog that exists and is not JSON.
 *
 * Each host gets its 404 one of three ways, and this guard holds each to one of them:
 *
 * - **A single-page app** (React, Angular, vanilla, Vue, the documentation site) sends
 *   `/.well-known/*` to a Worker first, examples-server's API Worker or its static-sites Worker, and
 *   both answer it from `wellKnown.ts` (whose own suite pins the response).
 * - **The landing site** answers unknown paths with its `404.html` and a 404 (`404-page`).
 * - **SvelteKit** answers a path no route matches with its error page and a 404, as long as no route
 *   or static file claims the path.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import { workerRunsFirstFor } from './support/workersRouting.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A well-known URI a client asks for. */
const AI_CATALOG_PATH = '/.well-known/ai-catalog.json';

/** The two examples-server Worker entries, relative to the repository root; both answer `/.well-known/*` from `wellKnown.ts`. */
const WELL_KNOWN_WORKER_ENTRIES: ReadonlySet<string> = new Set([
	'packages/examples-server/src/cloudflareWorker.ts',
	'packages/examples-server/src/staticAssetsWorker.ts',
]);

const TARGETS = listDeployTargets();

/**
 * Whether a package is the SvelteKit app.
 *
 * @param packageDirectory - The package directory under `packages/`.
 * @returns `true` when it carries a `svelte.config.js`.
 */
function isSvelteKit(packageDirectory: string): boolean {
	return existsSync(resolve(REPO_ROOT, 'packages', packageDirectory, 'svelte.config.js'));
}

/**
 * The HTML files a package serves or renders its pages from: every `*.html` at its root and in its `src/`.
 *
 * @param packageDirectory - The package directory under `packages/`.
 * @returns Paths relative to the repository root.
 */
function htmlShells(packageDirectory: string): readonly string[] {
	return ['', 'src'].flatMap((subdirectory) => {
		const directory = posix.join('packages', packageDirectory, subdirectory);

		return existsSync(resolve(REPO_ROOT, directory))
			? readdirSync(resolve(REPO_ROOT, directory)).filter((name) => name.endsWith('.html')).map((name) => posix.join(directory, name))
			: [];
	});
}

describe('/.well-known/*', () => {
	it('finds the deployed sites, so the cases below are not vacuous', () => {
		expect(TARGETS.length).toBeGreaterThanOrEqual(8);
		expect(TARGETS.filter((target) => target.config.assets?.not_found_handling === 'single-page-application').length).toBeGreaterThanOrEqual(6);
	});

	for (const target of TARGETS) {
		const packagePath = `packages/${target.packageDirectory}`;
		const { assets, main } = target.config;

		it(`${target.packageDirectory}: answers ${AI_CATALOG_PATH} with a 404`, () => {
			if (assets?.not_found_handling === 'single-page-application') {
				// The fallback would answer with index.html and a 200, so the Worker must answer first.
				const entry = main === undefined ? '' : posix.join(posix.dirname(target.configPath), main);

				expect(workerRunsFirstFor(assets.run_worker_first, AI_CATALOG_PATH), 'add "/.well-known/*" to assets.run_worker_first').toBe(true);
				expect(WELL_KNOWN_WORKER_ENTRIES.has(entry), `main must be one of ${[...WELL_KNOWN_WORKER_ENTRIES].join(', ')}, not "${entry}"`).toBe(true);
				expect(assets.binding).toBe('ASSETS');
			} else if (isSvelteKit(target.packageDirectory)) {
				// No fallback: what no file and no route claims, SvelteKit's router answers with a 404.
				expect(assets?.not_found_handling).toBeUndefined();
				expect(readdirSync(resolve(REPO_ROOT, packagePath, 'src/routes')).filter((name) => name.startsWith('.well-known') || name.startsWith('[...'))).toEqual([]);
			} else {
				expect(assets?.not_found_handling, 'the landing site answers unknown paths with 404.html').toBe('404-page');
				expect(existsSync(resolve(REPO_ROOT, packagePath, '404.html'))).toBe(true);
			}
		});

		it(`${target.packageDirectory}: publishes nothing under /.well-known/`, () => {
			for (const directory of ['public', 'static']) {
				expect(existsSync(resolve(REPO_ROOT, packagePath, directory, '.well-known')), `${packagePath}/${directory}/.well-known`).toBe(false);
			}
		});

		it(`${target.packageDirectory}: advertises no agent catalog in robots.txt, its pages or its headers`, () => {
			const files = [...htmlShells(target.packageDirectory), ...['public', 'static'].flatMap((directory) => [`${packagePath}/${directory}/robots.txt`, `${packagePath}/${directory}/_headers`])]
				.filter((path) => existsSync(resolve(REPO_ROOT, path)));

			expect(files.length, 'no robots.txt or HTML shell found').toBeGreaterThan(1);
			expect(files.filter((path) => /agentmap|ai-catalog/iu.test(readFileSync(resolve(REPO_ROOT, path), 'utf8')))).toEqual([]);
		});
	}
});
