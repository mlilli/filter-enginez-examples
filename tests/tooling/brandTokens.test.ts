/**
 * The design tokens in `@filter-enginez/brand` match the design system that authors them.
 *
 * @remarks
 * ## Two sheets, one shared half
 *
 * `brand/tokens.css` is NOT a byte-identical copy of `docs/branding/design-system/colors_and_type.css`.
 * Its `:root` declarations are identical to the design system's, in the same order; what sits BELOW
 * them differs, because `brand/tokens.css` is a token sheet plus the repo's global element-defaults
 * sheet:
 *
 *   1. the semantic element styles are wrapped in `@layer base`, which
 *      `tests/tooling/cascadeLayers.test.ts` guards — unlayered, they outrank every Tailwind utility
 *      in the two React apps regardless of specificity;
 *   2. `color-scheme: dark`, without which native form controls render in light mode;
 *   3. `cursor: pointer` / `not-allowed` on checkboxes and radios.
 *
 * All three are app-side concerns that would be wrong to push back into the design system —
 * `@layer base` in particular exists to solve a Tailwind cascade problem only two of six verticals
 * have.
 *
 * ## What this therefore asserts
 *
 * The half that can rot: the token block. Comparing whole files would fail for reasons nobody wants
 * fixed; comparing the `:root` declarations catches the failure that actually matters — a color or a
 * type step edited in the design system and never carried across, or vice versa.
 *
 * Order is preserved in the comparison, so a reordering is caught too. Only comments and whitespace
 * are ignored, and those are known to differ (Prettier normalizes one copy's comment indentation).
 *
 * It runs on `pnpm test`, so it is enforced locally as well as in CI.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the tokens are authored. */
const DESIGN_SYSTEM_SHEET = 'docs/branding/design-system/colors_and_type.css';

/** Where they ship. */
const BRAND_SHEET = 'packages/brand/src/tokens.css';

/**
 * The declarations inside the first `:root` block, in source order.
 *
 * @remarks
 * Comments are stripped first, since both sheets annotate their tokens heavily and one of them
 * mentions custom-property names inside prose. Whitespace is normalized per declaration because the
 * two copies genuinely differ there and nobody wants a test that fails on indentation.
 *
 * @param path - Repo-relative path to a stylesheet.
 * @returns Each declaration, trimmed, in the order it appears.
 */
function rootDeclarations(path: string): string[] {
	const withoutComments = readFileSync(resolve(REPO_ROOT, path), 'utf8')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '');
	const block = /:root\s*\{(?<body>[\s\S]*?)\n\}/u.exec(withoutComments);

	expect(block, `${path} has no :root block — did the sheet change shape?`).not.toBeNull();

	return (block?.groups?.['body'] ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

describe('brand design tokens', () => {
	it('ships the design system\'s token block unchanged', () => {
		// The whole point. If this fails, one of the two sheets was edited and the other was not, and
		// the answer is to carry the change across — never to relax this test.
		expect(rootDeclarations(BRAND_SHEET)).toEqual(rootDeclarations(DESIGN_SYSTEM_SHEET));
	});

	it('reads a plausible number of tokens from each', () => {
		// A regex that stops matching returns an empty list from BOTH sheets, and two empty lists are
		// equal. That is the shape where a rename turns this suite green by comparing nothing.
		expect(rootDeclarations(DESIGN_SYSTEM_SHEET).length).toBeGreaterThan(50);
	});

	it('carries element defaults that the design system does NOT', () => {
		// The documented divergence, asserted so it stays deliberate. If someone "restores byte
		// equality" by deleting these, the React apps get 18px section headings back and the dark
		// verticals get light-mode checkboxes — with nothing else in the repo objecting.
		const brand = readFileSync(resolve(REPO_ROOT, BRAND_SHEET), 'utf8');
		const designSystem = readFileSync(resolve(REPO_ROOT, DESIGN_SYSTEM_SHEET), 'utf8');

		for (const addition of ['@layer base', 'color-scheme: dark']) {
			expect(brand, `${BRAND_SHEET} lost its "${addition}"`).toContain(addition);
			expect(
				designSystem,
				`${DESIGN_SYSTEM_SHEET} gained "${addition}" — if that is deliberate, update this test `
					+ 'and its header together',
			).not.toContain(addition);
		}
	});
});
