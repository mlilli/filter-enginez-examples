/**
 * HTML escaping for the site's server-free renders: the how-it-works page's text at build time, and
 * the compare page's view at build time and in the browser.
 *
 * @remarks
 * Its own module, at the root of `src/`, because both pages import it and neither should drag the
 * other's content into its bundle. Pure string work, so it runs under Node in the Vite config and in
 * the browser alike.
 *
 * @packageDocumentation
 */

/**
 * Escape text for use in HTML element content or a double- or single-quoted attribute value.
 *
 * @param text - Any text.
 * @returns The text with `&`, `<`, `>`, `"` and `'` replaced by entities.
 *
 * @example
 * ```ts
 * escapeHtml('a < b && "c"'); // 'a &lt; b &amp;&amp; &quot;c&quot;'
 * ```
 */
export function escapeHtml(text: string): string {
	// `&` first, so the entities written by the later replacements are not escaped a second time.
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
