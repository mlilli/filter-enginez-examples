/**
 * The documentation site serves the documentation at its root, every `/docs` address there answers
 * with a permanent redirect to the same path without the prefix, and nothing in this repository links
 * the prefixed form.
 *
 * @remarks
 * `docs.filterenginez.com/` is the documentation home and `/rules/range` a rule's page, while the two
 * React apps serve the same pages under their own `/docs`. Three things would fail silently:
 *
 * - **A redirect that stops matching.** Links and indexed URLs from before carry `/docs`; the host's
 *   `public/_redirects` sends `/docs` and `/docs/*` to the root with a 301, keeping the query string.
 *   A `_redirects` source matches its path exactly, so `/docs/*` does not cover `/docs` itself, and a
 *   destination with a query string of its own would drop the visitor's. A Worker that ran first for
 *   those paths would bypass the file altogether.
 * - **A link written with the prefix.** It still works, through a redirect on every visit, which is
 *   what a performance audit flags and what nobody would see in a browser. Every file in the
 *   repository is read for one.
 * - **A documentation page that links by absolute `/docs` path** rather than through its base path
 *   (`examples-shared/src/docs/docsBasePath.ts`): on the documentation site it would leave the root.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import { isBinaryPath, REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';
import { workerRunsFirstFor } from './support/workersRouting.js';

/** The documentation site's host. */
const DOCS_HOST = 'docs.filterenginez.com';

/** A link to the documentation site under the prefix it no longer serves, built so this file does not contain one. */
const PREFIXED_DOCS_LINK = new RegExp(`${DOCS_HOST.replaceAll('.', '\\.')}/docs(?:[/?#"'\`)\\s]|$)`, 'mu');

/** The redirects file the documentation site's build copies into its assets. */
const REDIRECTS = 'packages/examples-docs/public/_redirects';

/** The shared documentation pages' source. */
const DOCS_SOURCE = 'packages/examples-shared/src/docs';

/**
 * Read a repository file as text.
 *
 * @param path - Repo-relative path.
 * @returns The contents.
 */
function readRepoFile(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

const target = listDeployTargets().find((candidate) => candidate.packageDirectory === 'examples-docs');
const rules = readRepoFile(REDIRECTS).split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));

describe('the documentation site’s /docs addresses', () => {
	it('finds the site and its redirects, so the cases below are not vacuous', () => {
		expect(target?.hosts).toEqual([DOCS_HOST]);
		expect(rules.length, `${REDIRECTS} holds no rules`).toBeGreaterThan(0);
	});

	it('answer with a 301 to the same path at the root, keeping the query string', () => {
		expect(rules).toEqual(['/docs / 301', '/docs/* /:splat 301']);
	});

	it('reach the redirects: the Worker does not run first for them', () => {
		for (const path of ['/docs', '/docs/', '/docs/rules/range']) {
			expect(workerRunsFirstFor(target?.config.assets?.run_worker_first, path), path).toBe(false);
		}
	});
});

describe('links to the documentation site', () => {
	const textFiles = walkRepoFiles().filter((path) => !isBinaryPath(path));

	it('reads the whole repository, so the case below is not vacuous', () => {
		expect(textFiles.length).toBeGreaterThan(200);
		expect(textFiles.filter((path) => readRepoFile(path).includes(`https://${DOCS_HOST}`)).length).toBeGreaterThan(5);
	});

	it('never carry the /docs prefix, which the site answers with a redirect', () => {
		expect(textFiles.filter((path) => PREFIXED_DOCS_LINK.test(readRepoFile(path)))).toEqual([]);
	});

	it('read the way the case above needs, so it can fail', () => {
		for (const link of [`https://${DOCS_HOST}/docs`, `https://${DOCS_HOST}/docs/rules/range`, `(https://${DOCS_HOST}/docs)`, `"https://${DOCS_HOST}/docs?x=1"`]) {
			expect(PREFIXED_DOCS_LINK.test(link), link).toBe(true);
		}
		for (const link of [`https://${DOCS_HOST}/`, `https://${DOCS_HOST}/rules/range`, `https://${DOCS_HOST}/documents`]) {
			expect(PREFIXED_DOCS_LINK.test(link), link).toBe(false);
		}
	});
});

describe('the documentation pages’ own links', () => {
	const pages = walkRepoFiles(resolve(REPO_ROOT, DOCS_SOURCE)).filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'));

	it('finds the pages, so the case below is not vacuous', () => {
		expect(pages.length).toBeGreaterThan(5);
	});

	it('go through the base path the section was mounted at, never an absolute /docs path', () => {
		// `to="/docs…"` or `` to={`/docs…`} ``: either leaves the documentation site's root.
		expect(pages.filter((path) => /\bto=(?:"|\{`|\{')\/docs\b/u.test(readRepoFile(path)))).toEqual([]);
		expect(pages.filter((path) => readRepoFile(path).includes('useDocsPath()'))).not.toEqual([]);
	});
});
