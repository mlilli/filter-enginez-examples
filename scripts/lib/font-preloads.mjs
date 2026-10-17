/**
 * Font preloads for built pages: which brand fonts a page asks for from its head, and the code that
 * writes and checks those `<link rel="preload">` tags.
 *
 * @remarks
 * A browser discovers a webfont late: only once it has downloaded and parsed the stylesheet that
 * declares it and laid out text that uses it. Until then the text renders in a fallback, and the swap
 * to the brand face is a visible jump after the first paint. A `<link rel="preload" as="font">` in the
 * HTML's head moves the request to the moment the preload scanner reads the head, in parallel with
 * the stylesheet and the scripts.
 *
 * ### Which fonts
 *
 * The demo apps preload {@link APP_PRELOADED_FONTS}: Inter, the body face every screen sets first,
 * and the display face the header's wordmark and page links are set in. Not JetBrains Mono: its subset
 * is the largest of the three (about 42 kB), the first screen sets only the header's small subtitle in
 * it, and a preload competes for the same early bandwidth as the startup JavaScript. The landing site
 * makes its own choice, which includes it (`packages/site/vite.config.ts`).
 *
 * ### Who writes them
 *
 * - The five Vite single-page apps (both React apps, Vue, vanilla, the documentation site) through
 *   {@link fontPreloadsPlugin} in their `vite.config.ts`.
 * - Angular through `scripts/preload-fonts.mjs`, after `ng build`, with {@link findBuiltFonts}: its
 *   builder takes no HTML plugin, and its hashed font names exist only once it has run.
 * - SvelteKit through its own `preload` option in `src/hooks.server.ts`, which preloads the same two
 *   faces; `tests/tooling/fontPreloads.test.ts` keeps its list equal to this one.
 * - The landing site through {@link preloadFonts}, from its own `criticalAssets` build plugin.
 *
 * `scripts/check-font-preloads.mjs` then reads each built page back and fails the build unless it
 * preloads exactly these faces, each from a file that is in the build.
 *
 * Plain JavaScript, with its types in `font-preloads.d.mts`: Vite configs load it directly, and so do
 * Node scripts run before anything is compiled.
 *
 * @packageDocumentation
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The brand fonts every demo app preloads, by the file name of the subset in `@filter-enginez/brand`.
 *
 * @remarks
 * In the order the preloads are written. See the module remarks for why JetBrains Mono is not here.
 */
export const APP_PRELOADED_FONTS = Object.freeze(['FilterEngineZDisplay-Subset.woff2', 'Inter-Subset.woff2']);

/**
 * Any `<link>` whose attributes make it a font preload, in whatever order they are written.
 *
 * @remarks
 * Attribute order differs between the writers (SvelteKit puts `href` first), and a check that counted
 * only one spelling would miss a preload written another way, and report "exactly these faces" over a
 * page that has more.
 */
const ANY_FONT_PRELOAD = /<link\b(?=[^>]*\brel=["']?preload\b)(?=[^>]*\bas=["']?font\b)[^>]*>/giu;

/** The attributes a font preload must carry to be used: the font's type, and CORS mode. */
const REQUIRED_PRELOAD_ATTRIBUTES = [/\stype=["']font\/woff2["']/iu, /\scrossorigin(?:[\s>=]|$)/iu];

/** The `href` of a tag. */
const HREF = /\bhref=["']?([^"'\s>]+)/iu;

/**
 * Add a font preload for each URL, before the page's first `<link>`.
 *
 * @remarks
 * `crossorigin` is required: fonts are always fetched in CORS mode, and a preload without it is a
 * different request, so the font would be downloaded twice.
 *
 * @param {string} html - The page.
 * @param {readonly string[]} fontHrefs - The WOFF2 files to preload, as the page's stylesheet names them.
 * @returns {string} The page with the preloads in its head.
 * @throws {Error} When the page has no `<link>` to put them before.
 */
export function preloadFonts(html, fontHrefs) {
	const firstLink = html.indexOf('<link');

	if (firstLink === -1) {
		throw new Error('The page has no <link> in its head to put the font preloads before.');
	}

	const preloads = fontHrefs.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>\n\t\t`).join('');

	return `${html.slice(0, firstLink)}${preloads}${html.slice(firstLink)}`;
}

/**
 * The `href` of every font preload in a page, in page order.
 *
 * @param {string} html - The page.
 * @returns {string[]} Each preload's `href`; a preload with no `href` contributes an empty string.
 */
export function readFontPreloads(html) {
	return [...html.matchAll(ANY_FONT_PRELOAD)].map(([tag]) => HREF.exec(tag)?.[1] ?? '');
}

/**
 * Whether every font preload in a page carries `type="font/woff2"` and `crossorigin`.
 *
 * @remarks
 * Fonts are always fetched in CORS mode, so a preload without `crossorigin` is a different request:
 * the browser downloads the font once for the preload and again for the stylesheet.
 *
 * @param {string} html - The page.
 * @returns {boolean} `true` when every font preload carries both.
 */
export function fontPreloadsAreWellFormed(html) {
	return [...html.matchAll(ANY_FONT_PRELOAD)].every(([tag]) => REQUIRED_PRELOAD_ATTRIBUTES.every((attribute) => attribute.test(tag)));
}

/**
 * The name a hashed build file was made from: `Inter-Subset-DlVByD-t.woff2` → `Inter-Subset.woff2`.
 *
 * @remarks
 * Vite and Angular append `-<8-character hash>` to the original stem, and SvelteKit `.<hash>`. A name
 * with no such suffix is returned as it is.
 *
 * @param {string} fileName - The file's base name.
 * @returns {string} The name without its content hash.
 */
export function sourceFontName(fileName) {
	return fileName.replace(/[-.][\w-]{8}(\.woff2)$/u, '$1');
}

/**
 * Find each font's hashed file in a build directory.
 *
 * @param {string} directory - The build output directory (the one the site is served from).
 * @param {readonly string[]} fontNames - The fonts' original file names.
 * @returns {string[]} A root-relative URL for each font, in the order given (`/media/Inter-Subset-1A2B3C4D.woff2`).
 * @throws {Error} When a font is missing from the build, or present under more than one hashed name.
 */
export function findBuiltFonts(directory, fontNames) {
	/** @type {string[]} */
	const woff2Files = [];
	/** @param {string} folder */
	const walk = (folder) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);

			if (entry.isDirectory()) {
				walk(path);
			} else if (entry.name.endsWith('.woff2')) {
				woff2Files.push(path);
			}
		}
	};

	walk(directory);

	return fontNames.map((name) => {
		const matches = woff2Files.filter((path) => sourceFontName(path.slice(path.lastIndexOf(sep) + 1)) === name);

		if (matches.length !== 1) {
			throw new Error(
				`${directory} holds ${String(matches.length)} built copies of ${name}; preloading needs exactly one.`,
			);
		}

		return `/${relative(directory, matches[0] ?? '').split(sep).join('/')}`;
	});
}

/**
 * The Vite plugin that preloads {@link APP_PRELOADED_FONTS} (or the fonts given) from every page the
 * build writes.
 *
 * @remarks
 * Build only: the dev server serves the fonts from their source paths, with no hashed name to point a
 * preload at. The hook runs `post`, once Vite has written the page's own asset links, and reads each
 * font's hashed URL out of the bundle by the name of the file it was made from; a font the build does
 * not contain fails the build rather than shipping a preload that 404s.
 *
 * @param {{ readonly fonts?: readonly string[] }} [options] - The fonts to preload, by original file
 *   name. Default {@link APP_PRELOADED_FONTS}.
 * @returns {import('./font-preloads.d.mts').FontPreloadsPlugin} The plugin.
 */
export function fontPreloadsPlugin(options = {}) {
	const fonts = options.fonts ?? APP_PRELOADED_FONTS;

	return {
		apply: 'build',
		name: 'filter-enginez-font-preloads',
		transformIndexHtml: {
			handler(html, context) {
				if (context.bundle === undefined) {
					throw new Error(`${context.filename}: the build passed no bundle to find the fonts in.`);
				}

				const assets = Object.values(context.bundle).filter((output) => output.type === 'asset');
				const hrefs = fonts.map((name) => {
					const font = assets.find((asset) => (asset.originalFileNames ?? []).some((original) => original === name || original.endsWith(`/${name}`)));

					if (font === undefined) {
						throw new Error(`${context.filename}: the build has no ${name} to preload.`);
					}

					return `/${font.fileName}`;
				});

				return preloadFonts(html, hrefs);
			},
			order: 'post',
		},
	};
}
