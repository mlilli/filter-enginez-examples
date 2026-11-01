/**
 * End-to-end test for the shareable-URL round-trip on the React books app (`/books`).
 *
 * @remarks
 * `@filter-enginez/url-state-router` is wired into the main-thread routes (`FilterEngineUrlSync` +
 * the format toggle + copy-link), so a filter change serializes to `?f=` and a fresh page load
 * re-hydrates the engine from it. This proves that contract end-to-end: filter → the URL carries the
 * state → a reload restores the same active filter + narrowed count. Selectors mirror `books.spec.ts`
 * (shared `ui-styles` `fe-*` classes; at phone width the filters sit behind the "Filters" toggle).
 *
 * In both React apps the sync also follows the URL while the route stays mounted, so Back and Forward
 * between two filter states load each one, the state the sync itself wrote earlier included. The
 * second suite drives that on `/books` in each React app.
 */

import { expect, type Page, test } from '@playwright/test';

import { VERTICALS } from '../../packages/examples-shared/src/verticals/verticals.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import {
	ACTIVE_CHIP,
	appUrl,
	clickFirstFacetChip,
	FACET_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/** A selected chip in the books panel's body: one per value the filters hold. */
const SELECTED_FACET_CHIP = '.fe-filter-panel__body .fe-chip--selected';

/**
 * The two React apps, whose `<FilterEngineUrlSync>` keeps following `?f=` for as long as a route is
 * mounted, Back and Forward included.
 */
const REACT_VERTICALS = VERTICALS.filter(({ id }) => id === 'react-rtk' || id === 'react-plain');

/**
 * The current `?f=` value, once the debounced write has put one there that differs from `previous`.
 *
 * @param page - The page under test.
 * @param previous - The value to move past, or `null` for "any value".
 * @returns The new value.
 */
async function nextFilterParam(page: Page, previous: string | null): Promise<string> {
	const read = (): string | null => new URL(page.url()).searchParams.get('f');

	await expect.poll(read, { timeout: 5_000 }).not.toBeNull();
	await expect.poll(read, { timeout: 5_000 }).not.toBe(previous);

	return read() ?? '';
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

test.describe('React apps — Back and Forward between two filter states on one route', () => {
	for (const { id, name } of REACT_VERTICALS) {
		test(`${name}: Back to a state the app wrote loads it, and Forward loads the newer one`, async ({ page }, testInfo) => {
			const { bootTimeoutMs, tier } = BOOKS_ARRIVAL[id];

			await page.goto(appUrl(id, '/books'));
			await expect(page.getByText(subtitle('Books', id, tier))).toBeVisible({ timeout: bootTimeoutMs });
			await expect(page.locator(RESULT_COUNT)).toBeVisible();
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());

			await clickFirstFacetChip(page);
			await expect(page.locator(SELECTED_FACET_CHIP)).toHaveCount(1);
			const earlierCount = await settledCount(page);
			const earlier = await nextFilterParam(page, null);

			// Every filter write replaces the current history entry, so no control in the app leaves an
			// earlier filter state behind in history. Duplicating the entry here (outside the router, as
			// any script on the page could) makes the next write land in an entry of its own.
			await page.evaluate(() => {
				window.history.pushState(window.history.state, '', window.location.href);
			});

			await clickFirstFacetChip(page);
			await expect(page.locator(SELECTED_FACET_CHIP)).toHaveCount(2);
			const newerCount = await settledCount(page);
			const newer = await nextFilterParam(page, earlier);

			await page.goBack();
			expect(new URL(page.url()).searchParams.get('f')).toBe(earlier);
			await expect(page.locator(SELECTED_FACET_CHIP), 'Back reached the earlier link but the engine kept the newer state').toHaveCount(1);
			expect(await settledCount(page)).toBe(earlierCount);

			await page.goForward();
			expect(new URL(page.url()).searchParams.get('f')).toBe(newer);
			await expect(page.locator(SELECTED_FACET_CHIP), 'Forward reached the newer link but the engine kept the earlier state').toHaveCount(2);
			expect(await settledCount(page)).toBe(newerCount);
		});
	}
});
