/**
 * End-to-end test for the shareable-URL round-trip on the React books app (`/books`).
 *
 * @remarks
 * `@filter-enginez/url-state-router` is wired into the main-thread routes (`FilterEngineUrlSync` +
 * the format toggle + copy-link), so a filter change serializes to `?f=` and a fresh page load
 * re-hydrates the engine from it. This proves that contract end-to-end: filter → the URL carries the
 * state → a reload restores the same active filter + narrowed count. Selectors mirror `books.spec.ts`
 * (shared `ui-styles` `fe-*` classes; at phone width the filters sit behind the "Filters" toggle).
 */

import { expect, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	FACET_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

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

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
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
