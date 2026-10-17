#!/usr/bin/env node
/**
 * `preload-fonts` — add the brand-font preloads to a built page whose bundler cannot.
 *
 *     node ../../scripts/preload-fonts.mjs dist/browser/index.html    # from examples-angular, after `ng build`
 *
 * @remarks
 * The Vite apps preload their first screen's fonts with `fontPreloadsPlugin` from their own build
 * (`lib/font-preloads.mjs` explains which fonts and why). Angular's application builder takes no HTML
 * plugin, and the fonts' hashed file names exist only once it has run, so its build runs this
 * afterwards: it finds each of {@link APP_PRELOADED_FONTS} in the page's directory by the name it was
 * built from, and writes a `<link rel="preload" as="font">` for each into the page's head, at the
 * URL the stylesheet loads it from.
 *
 * A font missing from the build, or present twice, fails the step, and so does a page that already
 * preloads a font: run twice over one build, the step would otherwise write every preload twice.
 * `scripts/check-font-preloads.mjs`, which the build runs next, then checks the result exactly as it
 * checks every other app's.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { APP_PRELOADED_FONTS, findBuiltFonts, preloadFonts, readFontPreloads } from './lib/font-preloads.mjs';

const [page, ...extra] = process.argv.slice(2);

if (page === undefined || extra.length > 0) {
	console.error('✗ preload-fonts: usage: node preload-fonts.mjs <built-page.html>');
	process.exit(1);
}

const pagePath = resolve(page);

if (!existsSync(pagePath)) {
	console.error(`✗ preload-fonts: ${pagePath} does not exist — is the build script pointing at the right output?`);
	process.exit(1);
}

const html = readFileSync(pagePath, 'utf8');

if (readFontPreloads(html).length > 0) {
	console.error(`✗ preload-fonts: ${pagePath} already preloads a font; run this once, on a fresh build.`);
	process.exit(1);
}

try {
	const hrefs = findBuiltFonts(dirname(pagePath), APP_PRELOADED_FONTS);

	writeFileSync(pagePath, preloadFonts(html, hrefs));
	console.log(`→ preload-fonts: ${pagePath} preloads ${hrefs.join(', ')}`);
} catch (error) {
	console.error(`✗ preload-fonts: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
