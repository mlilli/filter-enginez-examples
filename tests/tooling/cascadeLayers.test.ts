/**
 * Element-default CSS must live in `@layer base`.
 *
 * @remarks
 * This guards a failure whose every symptom points away from the cause.
 *
 * `brand/tokens.css` sets `h3 { font-size: var(--text-lg) }` as a design-system default. Unlayered,
 * that rule beats EVERY Tailwind utility in the two React apps — per CSS Cascade 5, unlayered author
 * styles outrank every cascade layer regardless of specificity, and Tailwind emits utilities into
 * `@layer utilities`. So `<h3 className="text-xs">` would render at 18px instead of 12px.
 *
 * The four non-Tailwind verticals are unaffected either way, because they label those headings with
 * `.fe-*` CLASSES, and a class outranks a bare element selector within the same layer. That
 * asymmetry makes the failure read as "the other verticals are too small" — the shared stylesheet
 * quietly overriding only the Tailwind apps.
 *
 * The invariant is therefore not cosmetic: an element default that cannot be overridden by a utility
 * class is not a default. Asserting on layer membership rather than on any particular font-size
 * keeps this honest as the design system changes.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { enclosingLayer, stripCssComments as stripComments } from './support/cssLayers.js';
import { readUiStyles } from './support/uiStylesSheet.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Stylesheets that declare bare-element rules, and must therefore layer them, each with how to read
 * it. `ui-styles` is read whole, its partials inlined in cascade order (`support/uiStylesSheet.ts`).
 */
const SHEETS: Readonly<Record<string, () => string>> = {
	'brand/tokens.css': () => readFileSync(resolve(REPO_ROOT, 'packages/brand/src/tokens.css'), 'utf8'),
	'ui-styles/styles.css': readUiStyles,
};

describe('cascade layers', () => {
	it.each(Object.entries(SHEETS))('%s layers its heading defaults', (name, read) => {
		const css = stripComments(read());
		const offsets = [...css.matchAll(/(?:^|\})\s*(h[1-6])[\s,{]/gu)].map((match) => match.index);

		expect(offsets.length).toBeGreaterThan(0);

		for (const offset of offsets) {
			expect(enclosingLayer(css, offset), `heading rule at offset ${offset} in ${name} is unlayered`)
				.toBe('base');
		}
	});

	it('declares color-scheme once, in the SHARED sheet', () => {
		// Native form-control chrome — unchecked checkbox backgrounds, scrollbars, select dropdowns —
		// is drawn by the UA, and the UA only draws it dark when told. Declared per app, any vertical
		// that misses it renders white checkboxes on dark panels with no rule anywhere to point at.
		// Asserting it sits in the brand sheet keeps it shared: a
		// seventh vertical gets it by importing tokens, without anyone remembering to.
		const tokens = stripComments(SHEETS['brand/tokens.css']?.() ?? '');

		expect(tokens).toMatch(/^\s*color-scheme:\s*dark;$/mu);
	});

	it('states filter-panel typography ONCE, in ui-styles', () => {
		// The panel title and section labels are declared once, in these shared classes. Restated per
		// component — inline styles in a React panel, a scoped Svelte style block — the copies diverge:
		// one dataset grows an accent border the others lack, and padding differs between datasets
		// inside the same framework.
		//
		// This scans for the tell: a `<h2>`/`<h3>` in a filter panel that sets its own font-size or
		// border-left instead of wearing the shared class. It cannot catch every possible redefinition,
		// but it catches the likely one, which is a component quietly growing back its own copy.
		const OFFENDERS = [
			'packages/examples-shared/src/books/BookFilterSections.tsx',
			'packages/examples-shared/src/books/BooksFilterPanel.tsx',
			'packages/examples-shared/src/real-estate/RealEstateFilterPanel.tsx',
			'packages/examples-shared/src/real-estate/RealEstateFilterSections.tsx',
			'packages/examples-shared/src/real-estate/GeoRadiusSection.tsx',
			'packages/examples-shared/src/wine/filters/PanelHeader.tsx',
			'packages/examples-shared/src/wine/filters/SectionHeader.tsx',
			'packages/examples-sveltekit/src/lib/controls/SectionHeader.svelte',
			'packages/examples-sveltekit/src/lib/controls/PanelHeader.svelte',
		];

		for (const path of OFFENDERS) {
			const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');

			expect(source, `${path} re-declares a left border instead of using the shared class`)
				.not.toMatch(/border-?[lL]eft[:=]\s*['"]?2px solid var\(--accent\)/u);
			// Scoped to HEADINGS. Matching any `text-sm` in the file would trip on a checkbox label,
			// which legitimately wears that utility — the invariant is about h2/h3 sizing, not about
			// banning a class from the file.
			expect(source, `${path} re-declares a heading font-size instead of using the shared class`)
				.not.toMatch(/<h[23][^>]{0,200}?\btext-(xs|sm|lg)\b/su);
		}
	});

	it('keeps the .fe-* component classes UNLAYERED', () => {
		// The other half of the contract, and the reason the verticals render correctly. These classes
		// must keep outranking the layered element defaults; moving them into `base` would put them in
		// a specificity fight with `h3` instead of cleanly winning, and moving them into a layer
		// declared before `utilities` would hand React's utilities the final say over component CSS.
		const css = stripComments(readUiStyles());
		const offset = css.indexOf('.fe-books-section-label');

		expect(offset).toBeGreaterThan(-1);
		expect(enclosingLayer(css, offset)).toBeNull();
	});
});
