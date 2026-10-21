/**
 * End-to-end tests for the SvelteKit books app (`/books`) — the critical filter flow at parity with
 * the React `books.spec.ts`, driving the first non-React vertical.
 *
 * @remarks
 * This app renders `<BooksView>` over `@filter-enginez/
 * svelte-signals` binding a main-thread engine, reusing the shared `ui-styles` `fe-*` classes — so the
 * selectors are identical to the React specs. Two Svelte-specific differences from `books.spec.ts`:
 *
 *   - **The mobile collapse.** The filter panel is an inline collapse toggled by a "Filters" button
 *     and kept mounted under `hidden`, so `openFilterPanel` just expands it — there's nothing to close.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the SvelteKit
 *     origin via `svelteUrl(...)`.
 *
 * Covers the full journey: boot → narrow with an InSet chip → remove the active-filter pill to restore
 * → the shareable-`?f=` URL round-trip (filter, reload, state restored) → a settled-state axe scan.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { BOOKS_SEARCH_COPY } from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { describeBooksParity } from './booksParity.js';
import {
	ACTIVE_CHIP,
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	TOGGLEABLE_CHIP,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { svelteUrl } from './svelteBase.js';

/** Navigate to a books URL and wait for the main-thread boot to render the live page. */
async function bootBooksApp(page: Page, path = '/books'): Promise<void> {
	await page.goto(svelteUrl(path));
	// Main-thread boot over the bundled tier (+ bitmap-accel init) behind the "Booting…" placeholder.
	await expect(page.getByText(subtitle('Books', 'sveltekit'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('SvelteKit books app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootBooksApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and shows an active-filter pill', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		expect(await settledCount(page)).toBeLessThan(before);
	});

	test('removing the active-filter pill restores the full set', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBeLessThan(before);

		// Each active pill carries a "Remove <label> filter" × button.
		await page.locator('.fe-filter-chip__remove').first().click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('shareable-URL round-trip: a filter writes ?f= and a reload restores it', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		const narrowed = await settledCount(page);

		// The engine → URL sync writes the serialized config to `?f=` (debounced ~150ms).
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();

		// A full reload re-hydrates the engine from `?f=` — the active pill + narrowed count return.
		await page.reload();
		await expect(page.getByText(subtitle('Books', 'sveltekit'))).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);
	});

	test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
		test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

		// Without `fe-filter-panel__scroller` the panel stops scrolling and the PAGE scrolls instead,
		// which nothing else notices. See the helper.
		await expectPanelScrollsToLastControl(page, `input[aria-label="${BOOKS_SEARCH_COPY.isbn.ariaLabel}"]`);
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan (open the collapse on mobile; no-op on desktop).
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Scan the SETTLED visual state — reduced motion so axe evaluates final colors, not a transient
		// card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast fail).
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});

describeBooksParity({ id: 'sveltekit', label: 'SvelteKit' });
