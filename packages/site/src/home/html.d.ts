/**
 * Vite's `?raw` import of an HTML file: the file's text, as a string.
 *
 * @remarks
 * For the home page's tests, which load `index.html` itself rather than a copy of its install block, so
 * the markup and the script that enhances it cannot drift apart unnoticed.
 *
 * @packageDocumentation
 */

declare module '*.html?raw' {
	/** The file's contents. */
	const content: string;

	export default content;
}
