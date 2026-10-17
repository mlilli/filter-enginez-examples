/**
 * The sub-breakpoint wordmark hide, pinned against the viewports Playwright actually drives.
 *
 * @remarks
 * ## The trap
 *
 * `ui-styles` hides `.fe-books-app__wordmark` below a breakpoint, in every app's header — the React
 * apps' included, which render the same element through the shared `<AppHeaderBrand>`. The `__subtitle` that most e2e specs use as their boot
 * signal (`tests/e2e/subtitles.ts` → `getByText(subtitle(…))` → `toBeVisible()`) lives INSIDE that
 * element. So a Playwright project narrower than the breakpoint does not fail one spec — it fails
 * every one of those specs at once, and each reads as "the app never booted" rather than as one
 * CSS rule. The cause and the symptom are in different files, different tiers and different
 * languages.
 *
 * The configured projects clear it: the narrowest is `mobile-chrome` (a Pixel 7, 412px) and the
 * breakpoint is 359px. This file exists so that if someone adds an iPhone SE project, the thing that
 * goes red is ONE test that names both numbers — not a wall of timeouts.
 *
 * ## Why everything here is parsed rather than restated
 *
 * A hardcoded `359` would keep passing while the CSS moved, which is the failure being guarded. The
 * breakpoint comes out of the stylesheet, the device names out of `playwright.config.ts`, and their
 * viewports out of Playwright's own device registry.
 *
 * ## The second invariant
 *
 * The breakpoint is stated ONCE, in that CSS rule. The eight React headers render the wordmark through
 * the shared `<AppHeaderBrand>`, which wears the `ui-styles` class rather than restating the breakpoint
 * as a Tailwind `min-[…]` variant — a second statement of one design decision, in a second language,
 * that could drift unseen unless someone compared a React vertical with a non-React one at exactly the
 * wrong width. So this file asserts the React headers render the shared brand and carry no such
 * variant, and that the shared brand wears the class the rule hides.
 */

// `@playwright/test`, not `playwright-core` — the latter is only a transitive dependency here and
// resolves nowhere from the repo root. This re-exports the same device registry, and importing it
// registers no test hooks, so Vitest is unbothered.
import { devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readUiStyles } from './support/uiStylesSheet.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The React dataset headers, each of which must render the shared brand rather than its own wordmark. */
const REACT_HEADERS = [
	'packages/examples-react-plain/src/books/BooksApp.tsx',
	'packages/examples-react-plain/src/books/BooksConfigApp.tsx',
	'packages/examples-react-plain/src/real-estate/RealEstateApp.tsx',
	'packages/examples-react-plain/src/wine/WineApp.tsx',
	'packages/examples-react-rtk/src/books/BooksApp.tsx',
	'packages/examples-react-rtk/src/books/BooksConfigApp.tsx',
	'packages/examples-react-rtk/src/real-estate/RealEstateApp.tsx',
	'packages/examples-react-rtk/src/wine/WineApp.tsx',
] as const;

/**
 * Read a repo file as text.
 *
 * @param path - Repo-relative path.
 * @returns The file contents.
 */
function read(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/**
 * The widest viewport at which `ui-styles` still hides the wordmark.
 *
 * @remarks
 * Anchored to the `@media` line immediately preceding the `.fe-books-app__wordmark { display: none }`
 * block rather than to any `max-width` in the sheet — `ui-styles` has many, and matching the first
 * one would pin an unrelated component's breakpoint while reporting success.
 *
 * @returns The `max-width` value in pixels.
 */
function wordmarkHideBreakpoint(): number {
	const css = readUiStyles();
	const match = /@media \(max-width: (\d+)px\) \{\s*\.fe-books-app__wordmark \{\s*display: none;/u.exec(css);

	expect(match, 'the .fe-books-app__wordmark hide rule moved or changed shape').not.toBeNull();

	return Number(match?.[1] ?? Number.NaN);
}

describe('narrow-viewport boot signal', () => {
	it('has no Playwright project narrower than the wordmark hide', () => {
		const breakpoint = wordmarkHideBreakpoint();
		const config = read('playwright.config.ts');
		const deviceNames = [...config.matchAll(/devices\['([^']+)'\]/gu)].map(([, name]) => name ?? '');

		expect(deviceNames.length, 'no `devices[…]` projects found — did the config change shape?')
			.toBeGreaterThan(0);

		for (const name of deviceNames) {
			const width = devices[name]?.viewport.width;

			expect(width, `Playwright has no device named ${name}`).toBeDefined();
			expect(
				width,
				`the "${name}" project is ${String(width)}px wide, at or below the ${breakpoint}px wordmark `
					+ 'hide — the __subtitle ~25 specs wait on is inside the hidden element, so they will all '
					+ 'time out as "never booted". Move the subtitle out of .fe-books-app__wordmark, or assert '
					+ 'the boot signal on something that survives. Do NOT widen the breakpoint to suit a spec.',
			).toBeGreaterThan(breakpoint);
		}
	});

	it.each(REACT_HEADERS)('%s renders the shared brand, with no breakpoint of its own', (file) => {
		const source = read(file);

		expect(source, `${file} no longer renders <AppHeaderBrand>`).toContain('<AppHeaderBrand');
		expect(
			source,
			`${file} restates the wordmark breakpoint as a Tailwind min-[…] variant — the CSS rule in ui-styles is the one statement of it`,
		).not.toMatch(/min-\[\d+px\]:flex/u);
	});

	it('gives the shared React brand the class the CSS rule hides', () => {
		expect(read('packages/examples-shared/src/app-header/AppHeaderBrand.tsx')).toContain(
			'className="fe-books-app__wordmark"',
		);
	});
});
