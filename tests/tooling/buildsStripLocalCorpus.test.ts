/**
 * Every app that links the local-only wine corpus must strip it from its production build.
 *
 * @remarks
 * `scripts/link-wine-corpus.mjs` links the real wine corpus — CC BY-NC-SA 4.0 data that must never be
 * distributed — into each wine app's static-asset directory, and every bundler here copies that
 * directory into its build output. `scripts/strip-local-corpus.mjs` removes it again, but only for an
 * app whose `build` script runs it. This guard ties the two lists together:
 *
 * - the apps are DERIVED from `TARGET_DIRS` in `link-wine-corpus.mjs`, so a newly linked app is covered
 *   the moment it is linked, rather than when someone remembers to add it here;
 * - so is every DEPLOYED package that depends on the dataset package (`@filter-enginez/mock-data`),
 *   linked or not — the landing site's live benchmark loads its wine data, and that loader looks for
 *   the local corpus beside itself, so a deployable build that bundles it strips its output too;
 * - each such app's `build` must run the strip step as its LAST command, so nothing after it can copy
 *   the corpus back in;
 * - the strip script itself is exercised against a scratch directory, including the "wrong output
 *   path" case, which must fail rather than report a clean build.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STRIP_SCRIPT = resolve(REPO_ROOT, 'scripts/strip-local-corpus.mjs');
const STRIP_COMMAND = 'node ../../scripts/strip-local-corpus.mjs';

/**
 * The app packages `link-wine-corpus.mjs` links the corpus into, read from its `TARGET_DIRS` list.
 *
 * @returns Package directory names, e.g. `examples-react-rtk`.
 */
function readLinkedAppPackages(): readonly string[] {
	const source = readFileSync(resolve(REPO_ROOT, 'scripts/link-wine-corpus.mjs'), 'utf8');
	const listBody = /const TARGET_DIRS = \[([\s\S]*?)\];/u.exec(source)?.[1] ?? '';

	return [...listBody.matchAll(/'packages\/([^/']+)\/[^']+'/gu)].map((match) => match[1] ?? '');
}

const LINKED_APPS = readLinkedAppPackages();

/**
 * The deployed packages (each with a `wrangler.jsonc`) that depend on `@filter-enginez/mock-data`.
 *
 * @returns Package directory names.
 */
function readDeployedDatasetPackages(): readonly string[] {
	return listDeployTargets()
		.map((target) => target.packageDirectory)
		.filter((directory) => {
			const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', directory, 'package.json'), 'utf8')) as {
				readonly dependencies?: Readonly<Record<string, string>>;
			};

			return manifest.dependencies?.['@filter-enginez/mock-data'] !== undefined;
		});
}

/** Every package whose build must end with the strip step: linked, or deployed with the dataset package. */
const STRIPPED_PACKAGES = [...new Set([...LINKED_APPS, ...readDeployedDatasetPackages()])].sort();

describe('production builds strip the local-only wine corpus', () => {
	it('finds the linked apps, so the cases below are not vacuous', () => {
		expect(LINKED_APPS.length, 'no TARGET_DIRS read from link-wine-corpus.mjs — did the list move?').toBeGreaterThanOrEqual(6);
	});

	it('covers the deployed sites that bundle the dataset package but are not linked', () => {
		// Pinned by name so the derivation above is shown to reach beyond the linked list.
		expect(STRIPPED_PACKAGES).toEqual(expect.arrayContaining(['examples-docs', 'site']));
	});

	for (const app of STRIPPED_PACKAGES) {
		it(`${app}: build ends with the strip step`, () => {
			const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', app, 'package.json'), 'utf8')) as {
				readonly scripts?: Readonly<Record<string, string>>;
			};
			const build = manifest.scripts?.['build'] ?? '';
			const lastCommand = build.split('&&').at(-1)?.trim() ?? '';

			expect(
				lastCommand.startsWith(STRIP_COMMAND),
				`${app}'s build is "${build}" — it must END with \`${STRIP_COMMAND} <output dirs>\`, or a linked corpus ships in the build`,
			).toBe(true);
		});
	}
});

describe('strip-local-corpus.mjs', () => {
	let scratch = '';

	afterEach(() => {
		if (scratch !== '') {
			rmSync(scratch, { force: true, recursive: true });
			scratch = '';
		}
	});

	it('removes corpus files at any depth and leaves everything else', () => {
		scratch = mkdtempSync(join(tmpdir(), 'strip-local-corpus-'));
		mkdirSync(join(scratch, 'client', 'assets'), { recursive: true });
		writeFileSync(join(scratch, 'data-real-full.json'), '[]');
		writeFileSync(join(scratch, 'client', 'data-real-full.ndjson'), '');
		writeFileSync(join(scratch, 'client', 'assets', 'winemag-data-130k-v2.csv'), '');
		writeFileSync(join(scratch, 'client', 'assets', 'index.js'), '');
		writeFileSync(join(scratch, 'mark.svg'), '');

		const run = spawnSync(process.execPath, [STRIP_SCRIPT, scratch], { encoding: 'utf8' });

		expect(run.status, run.stderr).toBe(0);
		expect(existsSync(join(scratch, 'data-real-full.json'))).toBe(false);
		expect(existsSync(join(scratch, 'client', 'data-real-full.ndjson'))).toBe(false);
		expect(existsSync(join(scratch, 'client', 'assets', 'winemag-data-130k-v2.csv'))).toBe(false);
		expect(existsSync(join(scratch, 'client', 'assets', 'index.js'))).toBe(true);
		expect(existsSync(join(scratch, 'mark.svg'))).toBe(true);
		expect(run.stdout).toContain('removed 3');
	});

	it('fails on an output directory that does not exist', () => {
		const run = spawnSync(process.execPath, [STRIP_SCRIPT, join(tmpdir(), 'strip-local-corpus-missing-dir')], {
			encoding: 'utf8',
		});

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('does not exist');
	});
});
