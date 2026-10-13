/**
 * Repo-level invariants for the wine corpus symlinks.
 *
 * @remarks
 * The corpus files are ~116MB each and gitignored, so each wine-serving app gets a link (a symlink, or
 * a hard link for Angular) to the single copy under `mock-data`. Two things have to stay in step and
 * nothing else enforces either:
 *
 *   1. Every directory the linker writes into must exist.
 *   2. Every link it creates must be gitignored — the targets are ignored, but a symlink is a real
 *      file to git, and committing one would put a broken path in the repo for everyone who has not
 *      generated the corpus.
 *
 * The failure this guards is quiet in the worst way. `loadWineCorpus` treats an unavailable tier as
 * "fall back to the bundled 10k default", and 10k is BELOW `WORKER_THRESHOLD` — so a missing link
 * means the app boots, filters correctly, and simply never uses the worker. Nothing errors. The tier
 * you were trying to demonstrate is just absent, and the only tell is a boot that finishes suspiciously
 * fast.
 *
 * The symlink syscalls themselves are not tested here; that is OS behavior. What is tested is the
 * bookkeeping that drifts when another vertical grows a wine route.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = readFileSync(resolve(REPO_ROOT, 'scripts/link-wine-corpus.mjs'), 'utf8');
const GITIGNORE = readFileSync(resolve(REPO_ROOT, '.gitignore'), 'utf8');

/**
 * The static-asset directories the script links into, read from the script itself.
 *
 * @remarks
 * Parsed rather than duplicated: a hardcoded copy here would pass while the script linked somewhere
 * else entirely, which is precisely the drift this file exists to catch.
 *
 * @returns The directory paths, relative to the repo root.
 */
function targetDirs(): string[] {
	const block = /const TARGET_DIRS = \[([\s\S]*?)\];/u.exec(SCRIPT)?.[1] ?? '';

	return [...block.matchAll(/'([^']+)'/gu)].map(([, dir]) => dir ?? '');
}

/** The corpus filenames the script links, read from the script itself. */
function corpusFiles(): string[] {
	const block = /const FILES = \[([\s\S]*?)\];/u.exec(SCRIPT)?.[1] ?? '';

	return [...block.matchAll(/'([^']+)'/gu)].map(([, file]) => file ?? '');
}

describe('wine corpus link script', () => {
	it('declares the directories and files it links', () => {
		// A guard on the parser. If either regex stopped matching, every assertion below would iterate
		// an empty list and pass — green while checking nothing.
		expect(targetDirs().length).toBeGreaterThan(0);
		expect(corpusFiles()).toEqual(['data-real-full.json', 'data-real-full.ndjson']);
	});

	it.each(targetDirs())('%s exists', (dir) => {
		// A typo'd path would make the script silently link nowhere useful — and since it reports
		// success either way, the first symptom is a wine route quietly running the 10k tier.
		expect(existsSync(resolve(REPO_ROOT, dir))).toBe(true);
	});

	it.each(targetDirs().flatMap((dir) => corpusFiles().map((file) => `${dir}/${file}`)))(
		'%s is gitignored',
		(linkPath) => {
			// The link TARGETS are ignored, but a symlink is a real entry to git. Committing one puts a
			// dangling path in the repo for everyone who has not generated the 116MB corpus.
			expect(GITIGNORE).toContain(linkPath);
		},
	);

	it('uses SvelteKit\'s static/ rather than public/', () => {
		// Bundler convention, not preference: SvelteKit serves from `static/`, Vite's React apps from
		// `public/`. Linking into the wrong one produces a 404 on a URL that looks perfectly correct.
		expect(targetDirs()).toContain('packages/examples-sveltekit/static');
		expect(targetDirs().filter((dir) => dir.includes('examples-react')).every((dir) => dir.endsWith('/public'))).toBe(true);
	});
});
