/**
 * Prettier must never be handed the wine corpus **where it is linked** — each vertical's static dir.
 *
 * @remarks
 * This file asserts the `.prettierignore` globs covering the LINKED copies of the corpus. The rule
 * covering the corpus SOURCE, in the engine's `mock-data` package, is the engine repository's to
 * assert: the source lives there, under neither `public/` nor `static/`, so these globs do not reach
 * it and neither rule implies the other.
 *
 * ## The failure this pins, and why it is Angular-only
 *
 * Without these globs, `pnpm lint` dies with `examples-angular#lint:fix exited (134)` — SIGABRT,
 * reported as `Abort trap: 6`, with no filename anywhere in the output: `prettier --write .` loads a
 * 116 MB `public/data-real-full.json` into the V8 heap.
 *
 * **The Angular-only part is the interesting half.** `pnpm link:wine-corpus` links the corpus into all
 * six verticals. Five get **symlinks**, which Prettier refuses outright — "Explicitly specified pattern
 * … is a symbolic link" — so the file is skipped for free. Angular gets a **hard link**, because
 * `@angular/build`'s dev server will not serve a symlink from `public/` (the symlinked corpus comes
 * back as the SPA fallback, 200 `text/html`). A hard link is indistinguishable from a real file to
 * every tool, including Prettier — so the one vertical that needs a hard link is the one where
 * Prettier tries to parse the corpus.
 *
 * ## Why a config assertion rather than a run
 *
 * Proving Prettier skips the file by running it needs the corpus present — it is gitignored, so the
 * check would silently pass on any machine without it, which is the exact shape of a guard that stops
 * guarding.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The two static-directory conventions across the six verticals. */
const STATIC_DIRECTORIES = ['public', 'static'] as const;

describe('.prettierignore covers the linked wine corpus', () => {
	const patterns = readFileSync(resolve(REPO_ROOT, '.prettierignore'), 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'));

	it('parses some patterns at all, so the cases below have subjects', () => {
		expect(patterns.length, '.prettierignore parsed to zero patterns — has it moved?').toBeGreaterThan(5);
	});

	it.each(STATIC_DIRECTORIES)("ignores the corpus under a vertical's %s/ directory", (directory) => {
		// Matched as a whole pattern rather than by substring: a `**/public/data-real-full.json` entry
		// would satisfy a substring check while leaving the `.ndjson` twin exposed the day someone hard-
		// links that one too.
		expect(patterns).toContain(`**/${directory}/data-real-full.*`);
	});

	it('keeps every vertical that CAN hold a hard link inside the globs', () => {
		// The globs are `**`-rooted rather than a roster of six package paths, so a seventh vertical is
		// covered on the day it is created. This asserts that PROPERTY rather than the roster: a
		// maintainer narrowing these to explicit package paths would pass every case above.
		const corpusPatterns = patterns.filter((pattern) => pattern.includes('data-real-full'));

		expect(corpusPatterns.length).toBeGreaterThan(0);
		expect(corpusPatterns.every((pattern) => pattern.startsWith('**/'))).toBe(true);
	});
});
