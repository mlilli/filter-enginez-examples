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
 *   - **The collapse toggle names its region.** react-ui's `<FilterCollapse>` sets `aria-controls` on
 *     the "Filters" toggle, pointing at the `.fe-filter-collapse` it shows and hides; the case below
 *     pins that for the React wine page. The shared suite covers the toggle's labels and
 *     `aria-expanded` in all six.
 *   - **The landing + routing suite**, which is not the wine filter flow.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import { FILTER_COLLAPSE, FILTERS_TOGGLE, isMobileProject } from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { describeWineVertical } from './wineFlow.js';

describeWineVertical({ id: 'react-rtk', label: 'React RTK' });

test.describe('React RTK wine app — the collapse toggle', () => {
	test('mobile: the "Filters" toggle names the region it shows and hides', async ({ page }, testInfo) => {
		test.skip(!isMobileProject(testInfo), 'The toggle only exists below the two-column breakpoint.');

		await page.goto('/wine');
		await expect(page.getByText(subtitle('Wine', 'react-rtk', 'worker'))).toBeVisible({ timeout: 60_000 });

		const toggle = page.locator(FILTERS_TOGGLE);
		const regionId = await toggle.getAttribute('aria-controls');

		expect(regionId, 'the toggle names no region').not.toBeNull();
		await expect(page.locator(FILTER_COLLAPSE)).toHaveAttribute('id', regionId ?? '');
		await expect(page.locator(FILTER_COLLAPSE)).toHaveAttribute('hidden');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator(FILTER_COLLAPSE)).not.toHaveAttribute('hidden');
	});
});

test.describe('landing + routing', () => {
	test('the landing hub shows the datasets and routes into the live one', async ({ page }) => {
		await page.goto('/');

		// Hero wordmark + the "select a dataset" prompt, both scoped to `main`: the app header repeats the
		// wordmark as a pointer-only home link, so an unscoped text query matches two elements.
		const hub = page.getByRole('main');

		await expect(hub.getByText('Filter EngineZ', { exact: true })).toBeVisible();
		await expect(hub.getByText('Select a dataset to explore')).toBeVisible();

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
