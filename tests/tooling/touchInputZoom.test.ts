/**
 * Text entry never zooms the page on a phone or tablet, in any site of the repo.
 *
 * @remarks
 * iOS Safari zooms the whole page in when a focused `input`, `select` or `textarea` computes to a
 * font-size below 16px. The cure is one rule in `ui-styles`' `@layer base` (read its comment): at
 * touch and below-desktop sizes those controls compute to 16px, `!important` in the earliest layer, so
 * no component class, Tailwind utility or inline style can take it back.
 *
 * A rule like that fails silently in three ways, and this file covers each:
 *
 * - **The rule changes shape.** It leaves `@layer base` (an unlayered `!important` loses to Tailwind's
 *   layered `!` utilities), drops `!important` (every `.fe-*` field size beats it), drops a control,
 *   or its width stops matching the `lg` breakpoint the apps switch layouts at.
 * - **A stylesheet entry stops reaching it.** A new app, page or sheet that does not import `ui-styles`
 *   ships fields at 12–14px and zooms, and nothing else notices. Entries are DERIVED: every `.css`
 *   under a package's `src/` that no other sheet imports, so a new one is checked the day it appears.
 * - **Tailwind's layers go first.** The rule outranks Tailwind's utilities only while `base` comes
 *   before Tailwind's `theme`, `components` and `utilities` layers, which holds because the brand
 *   tokens (or `ui-styles`) are imported before `tailwindcss`. (Tailwind hoists one layer of its own,
 *   `properties`, above everything; it declares only `--tw-*` custom properties, never a font size.)
 *
 * And the tempting non-fix stays out: no page may switch zoom off with `maximum-scale` or
 * `user-scalable` in its viewport tag, which would take pinch-zoom away from everyone who needs it.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { enclosingLayer, stripCssComments } from './support/cssLayers.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The sheet that carries the rule. */
const UI_STYLES = 'packages/ui-styles/src/styles.css';

/** How a sheet imports {@link UI_STYLES} from another package. */
const UI_STYLES_SPECIFIER = '@filter-enginez/ui-styles/styles.css';

/** How a sheet imports the brand tokens, which open `@layer base` too. */
const BRAND_TOKENS_SPECIFIER = '@filter-enginez/brand/tokens.css';

/** The packages whose stylesheets are building blocks for the others, not entries of their own. */
const LIBRARY_PACKAGES: ReadonlySet<string> = new Set(['brand', 'ui-styles']);

/** The media query the rule sits under, captured with the width it names. */
const RULE_MEDIA = /@media \(pointer: coarse\), \(max-width: (\d+)px\) \{/u;

/** The controls the rule covers, each of which iOS zooms into. */
const TEXT_ENTRY_SELECTORS = ['input:not(', 'select', 'textarea'] as const;

/** The `input` types the rule leaves alone: none of them takes text, so none zooms. */
const NON_TEXT_INPUT_TYPES = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];

/**
 * Read a repo file.
 *
 * @param path - Repo-relative path.
 * @returns Its contents.
 */
function read(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * Every `.css` file under a directory, recursively, skipping dependencies and build output.
 *
 * @param dir - Absolute directory.
 * @returns Absolute paths.
 */
function cssFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		if (entry === 'node_modules' || entry === 'dist') {
			return [];
		}

		if (statSync(path).isDirectory()) {
			return cssFiles(path);
		}

		return entry.endsWith('.css') ? [path] : [];
	});
}

/**
 * The `@import` specifiers of a sheet, in order.
 *
 * @param css - Comment-stripped stylesheet text.
 * @returns The specifiers.
 */
function importsOf(css: string): string[] {
	return [...css.matchAll(/@import\s+['"]([^'"]+)['"]/gu)].map(([, specifier]) => specifier ?? '');
}

/** Every application stylesheet: each package's `src/**\/*.css`, libraries excluded. */
const APP_SHEETS = readdirSync(resolve(REPO_ROOT, 'packages'))
	.filter((name) => !LIBRARY_PACKAGES.has(name))
	.map((name) => resolve(REPO_ROOT, 'packages', name, 'src'))
	.filter((dir) => existsSync(dir))
	.flatMap(cssFiles);

/** Each sheet's imports, keyed by absolute path, with relative specifiers resolved. */
const IMPORTS: ReadonlyMap<string, readonly string[]> = new Map(
	APP_SHEETS.map((path) => [
		path,
		importsOf(stripCssComments(readFileSync(path, 'utf8'))).map((specifier) =>
			specifier.startsWith('.') ? resolve(dirname(path), specifier) : specifier,
		),
	]),
);

/** The sheets no other sheet imports: what an app, or a page, actually loads. */
const ENTRIES = APP_SHEETS.filter((path) => ![...IMPORTS.values()].some((imports) => imports.includes(path)));

/**
 * Whether a sheet reaches {@link UI_STYLES}, directly or through the sheets it imports.
 *
 * @param path - Absolute path of the sheet.
 * @param seen - Sheets already visited, against an import cycle.
 * @returns `true` when the rule is in the sheet's cascade.
 */
function reachesUiStyles(path: string, seen: ReadonlySet<string> = new Set()): boolean {
	const imports = IMPORTS.get(path) ?? [];

	return (
		imports.includes(UI_STYLES_SPECIFIER)
		|| imports.some((target) => IMPORTS.has(target) && !seen.has(target) && reachesUiStyles(target, new Set([...seen, path])))
	);
}

/** The rule's media block in `ui-styles`, comment-stripped, with its offset in the sheet. */
function ruleBlock(): { readonly block: string; readonly offset: number; readonly width: number } {
	const css = stripCssComments(read(UI_STYLES));
	const match = RULE_MEDIA.exec(css);

	expect(match, 'the touch font-size rule is gone from ui-styles, or its media query changed shape').not.toBeNull();

	const offset = match?.index ?? 0;
	const block = css.slice(offset, css.indexOf('}', css.indexOf('}', offset) + 1) + 1);

	return { block, offset, width: Number(match?.[1] ?? Number.NaN) };
}

describe('touch text-entry font-size floor', () => {
	it('sets the covered controls to 16px, !important, in @layer base', () => {
		const { block, offset } = ruleBlock();
		const css = stripCssComments(read(UI_STYLES));

		expect(enclosingLayer(css, offset), 'the rule must sit in @layer base, ahead of every layer that sets a font size').toBe('base');
		expect(block).toMatch(/font-size: 16px !important;/u);
		for (const selector of TEXT_ENTRY_SELECTORS) {
			expect(block, `the rule no longer covers ${selector}`).toContain(selector);
		}
	});

	it('exempts exactly the input types that take no text', () => {
		const exempt = [...ruleBlock().block.matchAll(/\[type='([a-z]+)'\]/gu)].map(([, type]) => type ?? '');
		const byName = (left: string, right: string): number => left.localeCompare(right);

		expect(exempt.sort(byName)).toEqual(NON_TEXT_INPUT_TYPES.slice().sort(byName));
	});

	it('covers every width below the lg breakpoint the apps switch layouts at', () => {
		const desktopMinWidth = /export const DESKTOP_MIN_WIDTH_PX = (\d+);/u.exec(
			read('packages/examples-shared/src/viewport/viewportCore.ts'),
		)?.[1];

		expect(desktopMinWidth, 'DESKTOP_MIN_WIDTH_PX moved or changed shape').toBeDefined();
		expect(ruleBlock().width).toBe(Number(desktopMinWidth) - 1);
	});

	it('finds the stylesheet entries, so the cases below are not vacuous', () => {
		// Six apps, the documentation site, and the landing site's three page sheets.
		expect(ENTRIES.length).toBeGreaterThanOrEqual(9);
	});

	it.each(ENTRIES.map((path) => [relative(REPO_ROOT, path), path]))('%s reaches the rule through ui-styles', (_name, path) => {
		expect(reachesUiStyles(path), `${relative(REPO_ROOT, path)} never imports ${UI_STYLES_SPECIFIER}`).toBe(true);
	});

	it.each(ENTRIES.map((path) => [relative(REPO_ROOT, path), path]))('%s declares @layer base before Tailwind’s layers', (_name, path) => {
		const imports = IMPORTS.get(path) ?? [];
		const tailwind = imports.indexOf('tailwindcss');
		const firstBase = imports.findIndex(
			(specifier) => specifier === BRAND_TOKENS_SPECIFIER || specifier === UI_STYLES_SPECIFIER || IMPORTS.has(specifier),
		);

		expect(firstBase, 'the sheet imports nothing that opens @layer base').toBeGreaterThanOrEqual(0);
		if (tailwind >= 0) {
			expect(firstBase, 'tailwindcss is imported before the sheet that opens @layer base').toBeLessThan(tailwind);
		}
	});

	it('is the only !important font-size in any stylesheet, so nothing can outrank it from an earlier layer', () => {
		const offenders = [...APP_SHEETS, resolve(REPO_ROOT, UI_STYLES), resolve(REPO_ROOT, 'packages/brand/src/tokens.css')]
			.flatMap((path) => {
				const matches = stripCssComments(readFileSync(path, 'utf8')).match(/font-size:[^;]*!important/gu) ?? [];

				return matches.map((match) => `${relative(REPO_ROOT, path)}: ${match}`);
			});

		expect(offenders).toEqual([`${UI_STYLES}: font-size: 16px !important`]);
	});
});

describe('page zoom stays on', () => {
	/** Every HTML entry: each package's `index.html`, SvelteKit's `app.html`, and the site's pages. */
	const pages = readdirSync(resolve(REPO_ROOT, 'packages')).flatMap((name) => {
		const directory = resolve(REPO_ROOT, 'packages', name);

		return [
			...readdirSync(directory).filter((entry) => entry.endsWith('.html')).map((entry) => join(directory, entry)),
			...['src/index.html', 'src/app.html'].map((entry) => join(directory, entry)).filter((path) => existsSync(path)),
		];
	});

	it('finds every page, so the case below is not vacuous', () => {
		// Six apps, the documentation site, and the landing site's four pages.
		expect(pages.length).toBeGreaterThanOrEqual(11);
	});

	it.each(pages.map((path) => [relative(REPO_ROOT, path), path]))('%s leaves pinch-zoom on', (_name, path) => {
		expect(readFileSync(path, 'utf8')).not.toMatch(/maximum-scale|user-scalable/u);
	});
});
