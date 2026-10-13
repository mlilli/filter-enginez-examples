/**
 * End-to-end test for the shareable-URL round-trip on the React books app (`/books`).
 *
 * @remarks
 * `@filter-enginez/url-state-router` is wired into the main-thread routes (`FilterEngineUrlSync` +
 * the format toggle + copy-link), so a filter change serializes to `?f=` and a fresh page load
 * re-hydrates the engine from it. This proves that contract end-to-end: filter → the URL carries the
 * state → a reload restores the same active filter + narrowed count. Selectors mirror `books.spec.ts`
 * (shared `ui-styles` `fe-*` classes; mobile filters live in the `dialog[name="Book filters"]` drawer).
 */

import { expect, type Locator, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	closeFilterPanel,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/**
 * What "open" means in this vertical: react-ui renders the mobile filter panel as an off-canvas
 * `dialog` named for the dataset, so the drawer itself is the readiness signal — and, once dismissed,
 * the absence signal. (The non-React verticals expand an inline collapse and wait for a chip instead.)
 */
function filterDrawer(page: Page): Locator {
	return page.getByRole('dialog', { name: 'Book filters' });
}

/** Navigate to the books route and wait for the corpus boot to swap in the live books page. */
async function bootBooksApp(page: Page): Promise<void> {
	await page.goto('/books');
	await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('React books app — shareable-URL round-trip', () => {
	test('a filter serializes to ?f= and a fresh load restores it', async ({ page }, testInfo) => {
		await bootBooksApp(page);
		const full = await settledCount(page);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		const narrowed = await settledCount(page);

		expect(narrowed).toBeLessThan(full);

		// The engine → URL sync writes the serialized config to `?f=` (debounced).
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();
		const shared = page.url();

		// A brand-new navigation to the shared URL re-hydrates the engine from `?f=`.
		await page.goto('about:blank');
		await page.goto(shared);
		await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);
	});
});
