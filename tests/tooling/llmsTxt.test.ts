/**
 * Every deployed host serves an `llms.txt` that Lighthouse accepts and that links only where these
 * sites, the repositories and npm are.
 *
 * @remarks
 * Lighthouse's `llms-txt` audit fetches `/llms.txt` from the page's origin. A 4xx makes it not
 * applicable; a file it is served must have an H1 (`/^\s*#\s+.+/m`), at least one Markdown link and
 * at least 50 characters. These hosts are single-page apps, which answer a missing file with their
 * `index.html` and a 200, so a host without a real file would be served its HTML shell and fail all
 * three. The checks are restated here, from the audit, rather than imported from the generator.
 *
 * Each host's file is generated from the route registries and committed in its static directory,
 * which its build copies as-is; `packages/site/src/sitemap/llmsTxt.test.ts` holds every copy to the
 * generator and every link to a page the sitemap lists. This guard starts from the deploy targets
 * instead, so a new site without a file fails here the day its `wrangler.jsonc` appears, and it checks
 * what the deployment does with the file: it reaches the visitor from the assets, as `text/plain`.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { type DeployTarget, listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import { workerRunsFirstFor } from './support/workersRouting.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The landing site's package directory, whose Worker runs first for every page and passes the file through. */
const SITE_PACKAGE = 'site';

/** The three addresses an `llms.txt` may link to that are not these sites. */
const EXTERNAL_URLS: ReadonlySet<string> = new Set([
	'https://github.com/mlilli/filter-enginez',
	'https://github.com/mlilli/filter-enginez-examples',
	'https://www.npmjs.com/org/filter-enginez',
]);

/** Lighthouse's H1 check. */
const LIGHTHOUSE_H1 = /^\s*#\s+.+/mu;

/** A Markdown link: `[text](url)`. */
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/gu;

/** Lighthouse's minimum length. */
const LIGHTHOUSE_MIN_LENGTH = 50;

const TARGETS = listDeployTargets();

/** Every host a site is deployed on. */
const DEPLOYED_HOSTS: ReadonlySet<string> = new Set(TARGETS.flatMap((target) => target.hosts));

/**
 * The directory a package's build copies into its output as-is: `static/` under SvelteKit, `public/`
 * everywhere else.
 *
 * @param target - The deploy target.
 * @returns The directory, relative to the repository root.
 */
function staticDirectory(target: DeployTarget): string {
	const packagePath = `packages/${target.packageDirectory}`;

	return existsSync(resolve(REPO_ROOT, packagePath, 'svelte.config.js')) ? `${packagePath}/static` : `${packagePath}/public`;
}

/**
 * A target's committed `llms.txt`, or `''` when it has none.
 *
 * @param target - The deploy target.
 * @returns The file's text.
 */
function llmsTxt(target: DeployTarget): string {
	const path = resolve(REPO_ROOT, staticDirectory(target), 'llms.txt');

	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('llms.txt', () => {
	it('finds the deployed sites, so the cases below are not vacuous', () => {
		expect(TARGETS.length).toBeGreaterThanOrEqual(8);
		expect(DEPLOYED_HOSTS.size).toBeGreaterThanOrEqual(8);
	});

	for (const target of TARGETS) {
		describe(target.packageDirectory, () => {
			const text = llmsTxt(target);
			const links = [...text.matchAll(MARKDOWN_LINK)].map(([, title, url]) => ({ title: title ?? '', url: url ?? '' }));

			it('ships one in the directory its build copies as-is', () => {
				expect(
					text,
					`${staticDirectory(target)}/llms.txt is missing: run vitest run packages/site/src/sitemap/llmsTxt.test.ts --update, after adding the host to llmsTxtHosts() if it is new`,
				).not.toBe('');
			});

			it('passes Lighthouse’s three checks: an H1, a Markdown link, at least 50 characters', () => {
				expect(LIGHTHOUSE_H1.test(text), 'no H1').toBe(true);
				expect(links.length, 'no Markdown link').toBeGreaterThan(0);
				expect(text.length).toBeGreaterThanOrEqual(LIGHTHOUSE_MIN_LENGTH);
			});

			it('names the project in its H1 and summarizes the host in the line under it', () => {
				expect(text).toMatch(/^# Filter EngineZ.*\n\n> \S.+\n/u);
			});

			it('links its own host, and otherwise only the deployed hosts, the repositories and npm, over https', () => {
				const unknown = links.filter(({ url }) => {
					if (EXTERNAL_URLS.has(url)) {
						return false;
					}

					const parsed = URL.canParse(url) ? new URL(url) : null;

					return parsed?.protocol !== 'https:' || !DEPLOYED_HOSTS.has(parsed.hostname) || parsed.search !== '' || parsed.hash !== '';
				});

				expect(unknown).toEqual([]);
				expect(links.some(({ url }) => target.hosts.includes(new URL(url).hostname)), 'no link to its own host').toBe(true);
				expect(links.filter(({ title }) => title.trim() === '')).toEqual([]);
			});

			it('reaches the visitor from the static assets, as the file the build copied', () => {
				// Workers static assets serve a `.txt` file as `text/plain; charset=utf-8` (wrangler's
				// `getContentType`, from the file extension). The Worker never answers the path instead,
				// except the landing site's, which runs first for every page and hands this one to the
				// assets unchanged (`siteRequestHandler.ts` redirects only `www.` and its pages' aliases).
				const isWorkerFirst = workerRunsFirstFor(target.config.assets?.run_worker_first, '/llms.txt');

				expect(isWorkerFirst, 'the Worker runs first for /llms.txt').toBe(target.packageDirectory === SITE_PACKAGE);
			});

			it('keeps the content type the assets give it: no _headers rule sets one', () => {
				const headersPath = resolve(REPO_ROOT, staticDirectory(target), '_headers');
				const headers = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : '';

				expect(headers.split('\n').filter((line) => /^\s+content-type\s*:/iu.test(line))).toEqual([]);
			});
		});
	}

	it('reads links the way the checks above need, so they can fail', () => {
		const sample = '# Title\n\n> Summary.\n\n- [One](https://filterenginez.com/): A.\n- [Two](https://example.com/x): B.\n';

		expect([...sample.matchAll(MARKDOWN_LINK)].map(([, title, url]) => [title, url])).toEqual([
			['One', 'https://filterenginez.com/'],
			['Two', 'https://example.com/x'],
		]);
		expect(LIGHTHOUSE_H1.test('<!doctype html><title>app</title>')).toBe(false);
	});
});
