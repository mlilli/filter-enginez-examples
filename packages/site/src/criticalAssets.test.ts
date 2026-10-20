/**
 * Tests for `criticalAssets.ts`: the stylesheet inlining and the font preloads the site's build applies
 * to every page, and the cut of a stylesheet to what a demo app's first screen can use.
 *
 * @remarks
 * The pages here are cut-down copies of what Vite writes: the stylesheet link in the exact form it
 * emits, after the head's other links. `tests/tooling/cloudflareDeploy.test.ts` holds the real pages
 * and the Vite config to the same arrangement. The stylesheets for the cut are small hand-written
 * sheets, each built to exercise one rule of it; `tests/tooling/criticalCss.test.ts` runs it inside the
 * apps' build plugin.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	classUsage,
	criticalStylesheet,
	inlineStylesheets,
	needsFullStylesheet,
	preloadFonts,
	requiredClasses,
	usesClass,
} from './criticalAssets.js';

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

describe('classUsage and usesClass', () => {
	it('reads every word of markup and minified code, in strings, template literals and object keys', () => {
		const usage = classUsage([
			'<div class="fe-a fe-b"><span class=\'fe-c\'></span></div>',
			'e.className="min-h-[44px] md:flex";t=`fe-d ${n}`;h="<i class=\\"fe-e\\">";c({active:x,"fe-f--on":y})',
		]);

		for (const name of ['fe-a', 'fe-b', 'fe-c', 'min-h-[44px]', 'md:flex', 'fe-d', 'fe-e', 'active', 'fe-f--on']) {
			expect(usesClass(usage, name), name).toBe(true);
		}
		expect(usage.words.has('')).toBe(false);
		expect(usesClass(usage, 'fe-g')).toBe(false);
	});

	it('reads a class built from a fixed start as a prefix, and leaves short fragments alone', () => {
		const usage = classUsage(['b="fe-bar--"+t;s=`fe-tree__${x}`;o="on-"+e;"x_"']);

		expect(usage.prefixes).toEqual(['fe-bar--', 'fe-tree__']);
		expect(usesClass(usage, 'fe-bar--high')).toBe(true);
		expect(usesClass(usage, 'fe-tree__label')).toBe(true);
		expect(usesClass(usage, 'on-top')).toBe(false);
		expect(usesClass(usage, 'fe-chip')).toBe(false);
	});
});

describe('requiredClasses', () => {
	it.each([
		['.fe-a', ['fe-a']],
		['.fe-a .fe-b>.fe-c:hover::after', ['fe-a', 'fe-b', 'fe-c']],
		['.fe-a:not(.fe-b):is(.fe-c,.fe-d)', ['fe-a']],
		['[class~="fe-x"].fe-a[data-v=".fe-y"]', ['fe-a']],
		['.md\\:flex', ['md:flex']],
		['.min-h-\\[44px\\]', ['min-h-[44px]']],
		['.\\31 0x', ['10x']],
		[':root', []],
		['a.', []],
	])('%s requires %j', (selector, classes) => {
		expect(requiredClasses(selector)).toEqual(classes);
	});
});

/** A page whose first screen writes `fe-hub` and `fe-header`, and starts the class `fe-card--`. */
const HUB = classUsage(['<header class="fe-header"></header>', 'h="fe-hub";c="fe-card--"+s']);

describe('criticalStylesheet', () => {
	it('keeps the rules the page can match and every rule that needs no class, in order, as written', () => {
		const css =
			':root{--a:1}.fe-hub{color:red}.fe-panel{color:blue}.fe-header .fe-hub,.fe-panel .fe-x{margin:0}' +
			'.fe-panel .fe-hub{gap:1px}.fe-card--live{border:0}.fe-panel:is(.fe-a,.fe-b),.fe-x{order:1}body{margin:0}';
		const cut = criticalStylesheet(css, HUB);

		expect(cut.css).toBe(':root{--a:1}.fe-hub{color:red}.fe-header .fe-hub,.fe-panel .fe-x{margin:0}.fe-card--live{border:0}body{margin:0}');
		expect(cut.ruleCount).toBe(8);
		expect(cut.keptRuleCount).toBe(5);
		expect(cut.omittedSelectors).toEqual([['fe-panel'], ['fe-panel', 'fe-hub'], ['fe-panel'], ['fe-x']]);
	});

	it('keeps a block at-rule when anything inside it is kept, and a named @layer block always', () => {
		const css =
			'@layer theme,base;@media (min-width:720px){.fe-hub{gap:2px}.fe-panel{gap:3px}}@supports (display:grid){.fe-panel{display:grid}}' +
			'@layer base{.fe-panel{color:red}}@layer{.fe-panel{color:blue}}@font-face{font-family:X;src:url(/x.woff2)}@property --p{syntax:"*";inherits:false}';

		expect(criticalStylesheet(css, HUB).css).toBe(
			'@layer theme,base;@media (min-width:720px){.fe-hub{gap:2px}}@layer base{}@font-face{font-family:X;src:url(/x.woff2)}@property --p{syntax:"*";inherits:false}',
		);
	});

	it('keeps a @keyframes the kept CSS or the page names, and lists the others', () => {
		const usage = classUsage(['h="fe-hub";s.animation="fe-pulse 1s"']);
		const css =
			'.fe-hub{animation:fe-spin 1s}.fe-panel{animation:fe-fade 1s}@keyframes fe-spin{to{rotate:1turn}}' +
			'@-webkit-keyframes "fe-fade"{to{opacity:0}}@keyframes fe-pulse{50%{opacity:.5}}@keyframes fe-spin-slow{to{rotate:1turn}}';
		const cut = criticalStylesheet(css, usage);

		expect(cut.css).toBe('.fe-hub{animation:fe-spin 1s}@keyframes fe-spin{to{rotate:1turn}}@keyframes fe-pulse{50%{opacity:.5}}');
		expect(cut.omittedKeyframes).toEqual(['fe-fade', 'fe-spin-slow']);
	});

	it('drops comments but a /*! notice, and reads strings, escapes, comments and parentheses as text', () => {
		const css =
			'/*! notice */ /* note \\ } */ .fe-hub::after{content:"}{;";background:url(data:image/svg+xml,{x})}' +
			"[title='a,b{'].fe-hub,.fe-x\\{{color:red}.fe-y{content:'\\'}';margin:0/* } */}";

		expect(criticalStylesheet(css, HUB).css).toBe(
			'/*! notice */.fe-hub::after{content:"}{;";background:url(data:image/svg+xml,{x})}' + "[title='a,b{'].fe-hub,.fe-x\\{{color:red}",
		);
	});

	it.each([
		['a block that never closes', '.fe-hub{color:red', 'a block that never closes, opened at offset 7'],
		['a string that never ends', '.fe-hub{content:"x}', 'a string that never ends, at offset 16'],
		['a comment that never ends', '.fe-hub{} /* x', 'a comment that never ends, at offset 10'],
		['a stray closing brace', '.fe-hub{}}', 'text that is not a statement, at offset 9'],
		['a declaration outside any rule', 'color:red', 'text that is not a statement, at offset 0'],
	])('fails on %s', (_case, css, message) => {
		expect(() => criticalStylesheet(css, HUB)).toThrow(message);
	});
});

describe('needsFullStylesheet', () => {
	const css = '.fe-hub{color:red}.fe-panel{color:blue}.fe-header .fe-badge{gap:0}.fe-ghost .fe-hub{margin:0}@keyframes fe-fade{to{opacity:0}}';
	const cut = criticalStylesheet(css, HUB);
	/** Everything the app writes: the first screen, the panel's chunk and the badge's. */
	const everything = classUsage(['fe-header fe-hub fe-panel fe-badge']);

	it('is true for code that writes a class the cut has no rule for', () => {
		expect(needsFullStylesheet(cut, { everything, loaded: classUsage(['"fe-panel"']), startup: HUB })).toBe(true);
	});

	it('is true for code that completes a selector with a class the first screen cannot write', () => {
		expect(needsFullStylesheet(cut, { everything, loaded: classUsage(['"fe-badge"']), startup: HUB })).toBe(true);
	});

	it('is true for code that names a @keyframes the cut left out', () => {
		expect(needsFullStylesheet(cut, { everything, loaded: classUsage(['a="fe-fade 1s"']), startup: HUB })).toBe(true);
	});

	it('is false for code that writes only classes the first screen already can', () => {
		expect(needsFullStylesheet(cut, { everything, loaded: classUsage(['"fe-hub fe-header"']), startup: HUB })).toBe(false);
	});

	it('is false for a selector nothing in the app can complete', () => {
		// `.fe-ghost .fe-badge` needs `fe-ghost`, which no code in the app writes, so the code that writes
		// `fe-badge` cannot make it match.
		const ghostCut = criticalStylesheet('.fe-hub{color:red}.fe-ghost .fe-badge{gap:0}', HUB);
		const app = classUsage(['fe-header fe-hub fe-badge']);

		expect(needsFullStylesheet(ghostCut, { everything: app, loaded: classUsage(['"fe-badge"']), startup: HUB })).toBe(false);
	});
});
