/**
 * End-to-end tests for the RTK real-estate app — the critical filter flow.
 *
 * @remarks
 * The real-estate sibling of `books.spec.ts`: boot the
 * (bundled, main-thread) corpus, narrow with a filter, watch the result count re-compute through the
 * redux-bridge mirror, then clear. Real-estate's distinctive piece is the **geo-radius filter** — a
 * dedicated test engages the "Filter by distance" checkbox and asserts the geo rule commits as an
 * active "Distance" chip. It asserts on the deterministic chip (the rule reached the engine), NOT on
 * the Leaflet tile render, so the test doesn't depend on network tile fetches: the numeric geo
 * controls are the accessible, testable path; the map is a progressive enhancement.
 *
 * The count-ticking + mobile-drawer machinery is shared: it lives in `./filterFlow.ts`, whose docblocks
 * carry the `settledCount` / drawer rationale. Real-estate boots on the main thread, so its boot wait is
 * short — but still generous to cover the bitmap-accel init.
 *
 * **Selectors (mirror the books app; real-estate drawer is `dialog[name="Listing filters"]`):**
 *   - `subtitle('Real estate', 'react-rtk')` — the header subtitle, present once `<DatasetRoute>` swaps in the app.
 *   - `.fe-result-count__number` / `.fe-chip` / `.fe-filter-chip` / "Clear all" — shared react-ui.
 *   - `getByLabel('Filter by distance')` — the geo-radius section's enable checkbox.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	closeFilterPanel,
	histogramSignature,
	isMobileProject,
	isPaintedHistogramBar,
	openFilterPanel,
	PLAYWRIGHT_POLL_INTERVALS,
	rangeSliderByLabel,
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
	return page.getByRole('dialog', { name: 'Listing filters' });
}

/** Navigate to the real-estate route and wait for the corpus boot to swap in the live page. */
async function bootRealEstateApp(page: Page): Promise<void> {
	// `/` is the dataset landing hub; the real-estate app lives at `/real-estate`.
	await page.goto('/real-estate');
	// Main-thread boot over the bundled tier (+ bitmap-accel init) behind the BrainSynapse loader.
	await expect(page.getByText(subtitle('Real estate', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('React RTK real-estate app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootRealEstateApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and shows an active-filter chip', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		expect(await settledCount(page)).toBeLessThan(before);
	});

	test('enabling the geo-radius filter commits a Distance chip', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, filterDrawer(page));
		// Engaging the checkbox adds the geo rule at the default center + radius. Asserted via the
		// deterministic "Distance" chip — proof the rule reached the engine — rather than a count delta
		// (which depends on where the default center lands in the procedural corpus) or a tile render.
		await page.getByLabel('Filter by distance').check();
		await closeFilterPanel(page, testInfo, filterDrawer(page));

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Distance' })).toBeVisible();

		// Clearing removes it again.
		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
	});

	test('the price slider draws a distribution overlay, and it repaints on a commit', async ({ page }, testInfo) => {
		// The full chain in one assertion: the bundle query asked for a bucket count, the engine computed
		// the histogram, `fieldHistogram` reshaped it, the panel passed it, and the slider tiered it. Any
		// broken link renders zero bars — while every other assertion in this file still passes.
		await openFilterPanel(page, testInfo, filterDrawer(page));

		const priceSlider = rangeSliderByLabel(page, 'Price');

		await expect(priceSlider).toHaveCount(1);

		const before = await histogramSignature(priceSlider);

		expect(before.length).toBeGreaterThan(1);
		// Every bar carries a tier modifier and a height. A bar with neither is a bar the shared
		// classifier never reached, which renders as an invisible zero-height sliver rather than an error.
		expect(before.every(isPaintedHistogramBar)).toBe(true);

		// Narrowing a DIFFERENT facet must reshape this field's distribution: the counts are
		// filtered-except-self, so they answer "given everything else you picked". A static overlay would
		// pass every assertion above and still be telling the user about the whole corpus.
		//
		// The only chip click in this file with no `settledCount` before it: its three siblings open with
		// `const before = await settledCount(page)` and inherit that wait for free. With no `before` to
		// capture, a raw click lands in a panel body that is still `--busy` — `pointer-events: none` on
		// the scroller itself, since `RealEstateFilterPanel` puts `__scroller` and `__body` on ONE
		// element. `clickFirstFacetChip` supplies both the wait and the diagnosis.
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		await settledCount(page);
		await openFilterPanel(page, testInfo, filterDrawer(page));

		await expect
			.poll(async () => (await histogramSignature(priceSlider)).join(), { intervals: [...PLAYWRIGHT_POLL_INTERVALS]})
			.not.toBe(before.join());
	});

	test('clear all resets every active filter', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('mobile: the filter drawer opens from the trigger and closes via its × button', async ({ page }, testInfo) => {
		test.skip(!isMobileProject(testInfo), 'The off-canvas drawer only exists below the lg breakpoint.');

		const drawer = page.getByRole('dialog', { name: 'Listing filters' });

		await expect(drawer).toHaveCount(0);
		await page.getByRole('button', { name: 'Filters' }).click();
		await expect(drawer).toBeVisible();

		await page.getByRole('button', { name: 'Close filters' }).click();
		await expect(drawer).toHaveCount(0);
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan: on mobile they live in the drawer, so open it (the
		// helper is a no-op on desktop, where the sidebar is already in the tree). The geo map is off
		// by default (progressive enhancement), so the scan covers the labeled numeric controls.
		await openFilterPanel(page, testInfo, filterDrawer(page));

		// Scan the SETTLED visual state — emulate reduced motion so axe evaluates final colors, not a
		// transient card fade-in frame (opacity < 1 blends muted text toward the page bg → false
		// contrast fail). Real-estate boots slower (geo/R-tree/Leaflet), so its scan reliably catches
		// the fade; the CSS `prefers-reduced-motion: reduce` blocks disable the card animations.
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
