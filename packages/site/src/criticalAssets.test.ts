/**
 * Tests for `criticalAssets.ts`: the stylesheet inlining and the font preloads the site's build applies
 * to every page.
 *
 * @remarks
 * The pages here are cut-down copies of what Vite writes: the stylesheet link in the exact form it
 * emits, after the head's other links. `tests/tooling/cloudflareDeploy.test.ts` holds the real pages
 * and the Vite config to the same arrangement.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { inlineStylesheets, preloadFonts } from './criticalAssets.js';

/** A built page's head and body, with one stylesheet link where Vite puts it. */
const PAGE = [
	'<head>',
	'\t\t<title>Filter EngineZ</title>',
	'\t\t<link rel="canonical" href="https://filterenginez.com/" />',
	'\t\t<script type="module" crossorigin src="/assets/index-abc.js"></script>',
	'\t\t<link rel="stylesheet" crossorigin href="/assets/styles-abc.css">',
	'</head>',
	'<body><h1>Filter EngineZ</h1></body>',
].join('\n');

/** The stylesheet the page links, as Vite writes it: asset URLs from the site root. */
const STYLES = "@font-face{font-family:Inter;src:url(/assets/Inter-Subset-abc.woff2)format('woff2')}h1{color:#f1ecdf}";

/** A lookup over one built stylesheet. */
const readStyles = (href: string): string | undefined => (href === '/assets/styles-abc.css' ? STYLES : undefined);

describe('inlineStylesheets', () => {
	it('replaces the stylesheet link with the stylesheet, where the link was', () => {
		const { html, inlined } = inlineStylesheets(PAGE, readStyles);

		expect(inlined).toEqual(['/assets/styles-abc.css']);
		expect(html).not.toContain('rel="stylesheet"');
		expect(html).toContain(`<script type="module" crossorigin src="/assets/index-abc.js"></script>\n\t\t<style>${STYLES}</style>\n</head>`);
	});

	it('inlines every stylesheet link, each with its own sheet, in page order', () => {
		const page = PAGE.replace('</head>', '<link rel="stylesheet" crossorigin href="/assets/extra-abc.css">\n</head>');
		const { html, inlined } = inlineStylesheets(page, (href) => (href === '/assets/extra-abc.css' ? 'p{margin:0}' : readStyles(href)));

		expect(inlined).toEqual(['/assets/styles-abc.css', '/assets/extra-abc.css']);
		expect(html.indexOf(`<style>${STYLES}</style>`)).toBeLessThan(html.indexOf('<style>p{margin:0}</style>'));
	});

	it('leaves a page with no stylesheet link as it is', () => {
		const page = PAGE.replace(/\n\t\t<link rel="stylesheet"[^>]*>/u, '');

		expect(inlineStylesheets(page, readStyles)).toEqual({ html: page, inlined: []});
	});

	it('fails on a link to a stylesheet the build does not have', () => {
		expect(() => inlineStylesheets(PAGE, () => undefined)).toThrow('The page links /assets/styles-abc.css, which is not in the build.');
	});

	it('fails on a stylesheet that would close its own <style> element', () => {
		expect(() => inlineStylesheets(PAGE, () => "a::after{content:'</STYLE>'}")).toThrow('contains "</style"');
	});

	it.each([
		['a bare relative path', 'url(fonts/inter.woff2)'],
		['a quoted relative path', "url('../fonts/inter.woff2')"],
		['a dot-relative path, after whitespace', 'url( "./inter.woff2")'],
	])('fails on %s in a url(), which would resolve against the page once inlined', (_case, url) => {
		expect(() => inlineStylesheets(PAGE, () => `@font-face{src:${url}}`)).toThrow('has a relative url()');
	});

	it.each([
		['the site root', 'url(/assets/Inter-Subset-abc.woff2)'],
		['the site root, quoted after whitespace', 'url( "/assets/Inter-Subset-abc.woff2")'],
		['a data URI', "url('data:image/svg+xml,%3csvg%3e%3c/svg%3e')"],
		['a fragment', 'url(#glow)'],
		['an absolute URL', 'url("https://filterenginez.com/mark.svg")'],
	])('inlines a stylesheet whose url() is %s', (_case, url) => {
		expect(inlineStylesheets(PAGE, () => `a{background:${url}}`).inlined).toEqual(['/assets/styles-abc.css']);
	});
});

describe('preloadFonts', () => {
	it('puts one preload per font before the page’s first link, in the order given', () => {
		const html = preloadFonts(PAGE, ['/assets/A-abc.woff2', '/assets/B-abc.woff2']);
		const preload = (href: string): string => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`;

		expect(html.indexOf(preload('/assets/A-abc.woff2'))).toBeGreaterThan(html.indexOf('<title>'));
		expect(html.indexOf(preload('/assets/A-abc.woff2'))).toBeLessThan(html.indexOf(preload('/assets/B-abc.woff2')));
		expect(html.indexOf(preload('/assets/B-abc.woff2'))).toBeLessThan(html.indexOf('<link rel="canonical"'));
		expect(html.replace(/<link rel="preload"[^>]*>\n\t\t/gu, '')).toBe(PAGE);
	});

	it('changes nothing when there is no font to preload', () => {
		expect(preloadFonts(PAGE, [])).toBe(PAGE);
	});

	it('fails on a page with no link to put the preloads before', () => {
		expect(() => preloadFonts('<head><title>x</title></head>', ['/assets/A-abc.woff2'])).toThrow('The page has no <link>');
	});
});
