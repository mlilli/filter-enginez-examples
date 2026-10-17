#!/usr/bin/env node
/**
 * `check-font-preloads` — fail a build whose first page does not preload exactly the brand fonts it
 * should, from files that are in the build.
 *
 *     node ../../scripts/check-font-preloads.mjs dist/index.html                     # a Vite app, after `vite build`
 *     node ../../scripts/check-font-preloads.mjs <page.html> --root <served-dir>    # when the page and its assets live apart
 *
 * @remarks
 * Every demo app preloads the same two faces, {@link APP_PRELOADED_FONTS} (`lib/font-preloads.mjs`
 * says which and why), and each writes the preloads its own way: a Vite plugin, a post-build step for
 * Angular, SvelteKit's `preload` option. What can go wrong is the same everywhere and invisible
 * everywhere: a preload that names a file the build no longer has is a 404 on every first visit, a
 * missing one costs nothing but speed, and an extra one (JetBrains Mono, say) spends early bandwidth
 * the startup scripts need. No test or screen shows any of them.
 *
 * So each app's build runs this on its built page. It passes only when the page's font preloads,
 * read in any attribute order, are exactly one per face in the list, each carrying `type="font/woff2"`
 * and `crossorigin` (without it the browser fetches the font a second time), and each pointing at a
 * file under the root the page is served from. A page or root that does not exist is an error, not
 * a pass: a check that read nothing looks exactly like one that passed.
 *
 * `tests/tooling/fontPreloads.test.ts` pins this script's behavior and that every app's build runs it.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { APP_PRELOADED_FONTS, fontPreloadsAreWellFormed, readFontPreloads, sourceFontName } from './lib/font-preloads.mjs';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node check-font-preloads.mjs <built-page.html> [--root <served-dir>]';

/**
 * Print a failure and exit.
 *
 * @param {string} message - What is wrong and how to fix it.
 * @returns {never} Never; the process exits.
 */
function fail(message) {
	console.error(`✗ check-font-preloads: ${message}`);
	process.exit(1);
}

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
const rootArgument = rootFlag === -1 ? undefined : argv[rootFlag + 1];
const positional = argv.filter((_, index) => rootFlag === -1 || (index !== rootFlag && index !== rootFlag + 1));

if (positional.length !== 1 || (rootFlag !== -1 && (rootArgument === undefined || rootArgument.startsWith('--')))) {
	fail(USAGE);
}

const pagePath = resolve(positional[0] ?? '');
const root = resolve(rootArgument ?? dirname(pagePath));

if (!existsSync(pagePath)) {
	fail(`${pagePath} does not exist — is the build script pointing at the right page?`);
}
if (!existsSync(root)) {
	fail(`${root} does not exist — is --root the directory the page is served from?`);
}

const html = readFileSync(pagePath, 'utf8');
const hrefs = readFontPreloads(html);
const names = hrefs.map((href) => sourceFontName(href.slice(href.lastIndexOf('/') + 1)));
const expected = [...APP_PRELOADED_FONTS].sort();

if (JSON.stringify([...names].sort()) !== JSON.stringify(expected)) {
	fail(
		`${pagePath} preloads [${names.join(', ')}], not exactly [${expected.join(', ')}].\n` +
			'  The demo apps preload these two faces and no others (scripts/lib/font-preloads.mjs).',
	);
}
if (!fontPreloadsAreWellFormed(html)) {
	fail(`${pagePath} has a font preload without type="font/woff2" or crossorigin; the browser would fetch that font twice.`);
}

// A root-relative URL (`/assets/…`), or one relative to a page served at the root (`./_app/…`, as
// SvelteKit writes them). Anything else — another origin, a parent directory — is not this build's file.
for (const href of hrefs) {
	if (!/^\.?\/(?!\/)/u.test(href) || href.includes('..') || !existsSync(join(root, href))) {
		fail(`${pagePath} preloads ${href}, which is not a file under ${root}.`);
	}
}

console.log(`→ check-font-preloads: ${pagePath} preloads ${names.join(', ')}`);
