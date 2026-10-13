/**
 * `/wine` on the RTK app — the worker tier over `reactive-signals`, mirrored into Redux.
 *
 * @remarks
 * **The cases live in `./wineFlow.ts`**, shared with all five other verticals.
 *
 * What is specific to this vertical:
 *
 *   - **No `url` builder.** Playwright's single `baseURL` IS this app, so the shared suite navigates
 *     to a bare `/wine`. Every other vertical passes an absolute-URL builder; a `reactRtkBase.ts`
 *     here would export a function returning its argument unchanged.
 *   - **The drawer.** react-ui renders the mobile filter panel as an off-canvas `<dialog>`; the
 *     shared suite uses it as its open-readiness signal and dismisses it before touching the results
 *     column. See `WineVerticalSpec.filterDrawer`.
 *   - **The two suites below**, which are not the wine filter flow.
 *
 * **`closeFilterPanel` is not called after every chip click, and that is deliberate.** The shared
 * suite closes the drawer only where the results column is actually touched. The keyboard case in
 * particular runs with the panel OPEN in all six verticals — the undo/redo hook declines only inside
 * `input` / `textarea` / `[contenteditable]`, and focus is on the chip button just clicked either way,
 * so closing is not load-bearing there, and the four inline-collapse verticals have no close button.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, test } from '@playwright/test';

import { isMobileProject } from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { describeWineVertical } from './wineFlow.js';

/**
 * What "open" means in this vertical: react-ui renders the mobile filter panel as an off-canvas
 * `dialog` named for the dataset, so the drawer itself is the readiness signal — and, once dismissed,
 * the absence signal. (The non-React verticals expand an inline collapse and wait for a chip instead.)
 *
 * The `role` exists only while the drawer is open, which is what makes it safe as a readiness signal
 * against `<FilterDrawer>`'s `keepMounted` children.
 */
function filterDrawer(page: Page): Locator {
	return page.getByRole('dialog', { name: 'Wine filters' });
}

describeWineVertical({ filterDrawer, id: 'react-rtk', label: 'React RTK' });

test.describe('React RTK wine app — the drawer itself', () => {
	test('mobile: the filter drawer opens from the trigger and closes via its × button', async ({ page }, testInfo) => {
		test.skip(!isMobileProject(testInfo), 'The off-canvas drawer only exists below the lg breakpoint.');

		// **This case stays out of the shared suite because the drawer is its SUBJECT.** Everywhere
		// else the drawer is a means of reaching the filters, which is why `openFilterPanel` hides it;
		// here the assertion IS that the trigger and the × work, so it must not go through the helper
		// that would use them.
		await page.goto('/wine');
		await expect(page.getByText(subtitle('Wine', 'react-rtk', 'worker'))).toBeVisible({ timeout: 60_000 });

		const drawer = filterDrawer(page);

		await expect(drawer).toHaveCount(0);
		await page.getByRole('button', { name: 'Filters' }).click();
		await expect(drawer).toBeVisible();

		await page.getByRole('button', { name: 'Close filters' }).click();
		await expect(drawer).toHaveCount(0);
	});
});

test.describe('landing + routing', () => {
	test('the landing hub shows the datasets and routes into the live one', async ({ page }) => {
		await page.goto('/');

		// Hero wordmark + the "select a dataset" prompt.
		await expect(page.getByText('Filter EngineZ')).toBeVisible();
		await expect(page.getByText('Select a dataset to explore')).toBeVisible();

		// The dataset cards: Wine and both Books entries are asserted as links; Real estate by its label.
		const wineCard = page.getByRole('link', { name: 'Explore Wine reviews' });

		await expect(wineCard).toBeVisible();
		await expect(page.getByRole('link', { exact: true, name: 'Explore Books' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Explore Books · config-driven' })).toBeVisible();
		await expect(page.getByText('Real estate', { exact: true })).toBeVisible();

		// Navigating into wine boots the app. The subtitle names the `'worker'` tier this route runs on.
		await wineCard.click();
		await expect(page).toHaveURL(/\/wine$/u);
		await expect(page.getByText(subtitle('Wine', 'react-rtk', 'worker'))).toBeVisible({ timeout: 60_000 });
	});

	test('an unknown dataset id renders the "filtered to zero" 404', async ({ page }) => {
		await page.goto('/does-not-exist');

		// The dataset resolver renders the shared 404 for a dead id (no silent redirect home).
		await expect(page.locator('.fe-notfound')).toBeVisible();
		await expect(page.getByText('No records passed this filter')).toBeVisible();
		await expect(page).toHaveURL(/\/does-not-exist$/u);
	});
});
