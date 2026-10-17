/**
 * The two edits the site's build makes to every page it writes, so the first render waits on nothing
 * but the HTML: the stylesheet goes into the page, and the fonts are requested from its head.
 *
 * @remarks
 * Vite writes each page's CSS to a hashed file and links it from the page's head, and a browser
 * renders nothing until that file arrives: a second round trip, after the HTML's, on every first visit.
 * The fonts the stylesheet declares are a third: a browser finds them only once it has parsed the CSS
 * and laid out text that uses them.
 *
 * - {@link inlineStylesheets} replaces each stylesheet link with a `<style>` holding the stylesheet
 *   itself. The site's pages are small and their CSS compresses to a few kilobytes more than the HTML,
 *   so carrying it in every page costs less than the round trip it removes.
 * - {@link preloadFonts} adds a `<link rel="preload">` for each font the first screen sets, ahead of the
 *   page's first other link, where the browser's preload scanner meets it within the HTML's first few
 *   kilobytes.
 *
 * Pure string functions, so they are tested on their own; `vite.config.ts` reads the built stylesheets
 * and fonts out of the bundle and calls them.
 *
 * @packageDocumentation
 */

/** A stylesheet link exactly as Vite writes one into a built page. */
const STYLESHEET_LINK = /<link rel="stylesheet" crossorigin href="([^"]+)">/gu;

/**
 * A `url()` whose target is relative to the stylesheet's own location.
 *
 * @remarks
 * Inlined, such a URL would resolve against the page instead, and point somewhere else. Vite writes
 * every asset URL from the site root (`/assets/…`) or as a `data:` URI, so a build should never contain
 * one; finding one fails the build rather than shipping a page whose fonts or images are missing.
 */
const RELATIVE_URL = /url\(\s*(?!\s|['"]?(?:data:|\/|#|https?:))/u;

/** What {@link inlineStylesheets} did to a page. */
export interface InlinedPage {
	/** The page, with each stylesheet link replaced by its stylesheet. */
	readonly html: string;
	/** The `href` of every stylesheet it inlined, in page order. */
	readonly inlined: readonly string[];
}

/**
 * Replace every stylesheet link in a built page with a `<style>` holding that stylesheet.
 *
 * @param html - The page, as Vite wrote it.
 * @param readStylesheet - The stylesheet a link's `href` names, or `undefined` if the build has none.
 * @returns The page, and which stylesheets went into it.
 * @throws {Error} When a link names a stylesheet the build does not have, or a stylesheet cannot be
 *   inlined as it is: one that would close its own `<style>` element, or one with a relative `url()`.
 */
export function inlineStylesheets(html: string, readStylesheet: (href: string) => string | undefined): InlinedPage {
	const inlined: string[] = [];
	const page = html.replaceAll(STYLESHEET_LINK, (_link, href: string) => {
		const css = readStylesheet(href);

		if (css === undefined) {
			throw new Error(`The page links ${href}, which is not in the build.`);
		}
		if (/<\/style/iu.test(css)) {
			throw new Error(`${href} contains "</style", which would end the inline <style> early.`);
		}
		if (RELATIVE_URL.test(css)) {
			throw new Error(`${href} has a relative url(), which would resolve against the page once inlined.`);
		}
		inlined.push(href);

		return `<style>${css}</style>`;
	});

	return { html: page, inlined };
}

/**
 * Add a font preload for each URL, before the page's first `<link>`.
 *
 * @remarks
 * `crossorigin` is required: fonts are always fetched in CORS mode, and a preload without it is a
 * different request, so the font would be downloaded twice.
 *
 * @param html - The page.
 * @param fontHrefs - The WOFF2 files to preload, as the page's stylesheet names them.
 * @returns The page with the preloads in its head.
 * @throws {Error} When the page has no `<link>` to put them before.
 */
export function preloadFonts(html: string, fontHrefs: readonly string[]): string {
	const firstLink = html.indexOf('<link');

	if (firstLink === -1) {
		throw new Error('The page has no <link> in its head to put the font preloads before.');
	}

	const preloads = fontHrefs.map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>\n\t\t`).join('');

	return `${html.slice(0, firstLink)}${preloads}${html.slice(firstLink)}`;
}
