/**
 * End-to-end tests for the framework-less real-estate app (`/real-estate`).
 *
 * @remarks
 * The vanilla sibling of `real-estate.spec.ts` and
 * `svelte-real-estate.spec.ts`, sharing their boot / settled-count / geo-chip machinery. Two
 * structural notes:
 *
 *   - **No off-canvas drawer.** The mobile filter panel is an inline collapse toggled by a "Filters"
 *     button rather than a `dialog`, so `openFilterPanel` just expands it and there is nothing to
 *     close. Same as SvelteKit's.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the vanilla
 *     origin via `vanillaUrl(...)`.
 *
 * ### What this vertical adds that no other spec covers
 *
 * Every other real-estate route is rendered by a framework that re-renders on state change. This one
 * mutates hand-built DOM in place: the panel builds fourteen sections once and each control's
 * `update(state)` re-applies the engine's committed rules to nodes held in closure variables. That is
 * a genuinely different failure mode — a framework that forgets to re-render shows stale UI loudly,
 * whereas a missed `update` call here shows a control that simply never changes. So the assertions
 * below deliberately check the CONTROL's state after a commit, not only the resulting count.
 *
 * The geo test asserts on the deterministic "Distance" chip — proof the rule reached the engine —
 * rather than on a Leaflet tile render, so it depends on no network tiles and no map chunk. The
 * numeric geo controls are the accessible, testable path; the map is a progressive enhancement.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	chipLabelWithoutCount,
	expectPanelScrollsToLastControl,
	histogramSignature,
	isMobileProject,
	isPaintedHistogramBar,
	openFilterPanel,
	PLAYWRIGHT_POLL_INTERVALS,
	rangeSliderByLabel,
	RESULT_COUNT,
	settledCount,
	TOGGLEABLE_CHIP,
	TREE_ROW,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { vanillaUrl } from './vanillaBase.js';

/**
 * Wait for the main-thread boot to replace the progress placeholder with the live page.
 *
 * @remarks
 * Separate from {@link bootRealEstateApp} because it must be usable after a `page.reload()`, where
 * navigating again would be actively wrong: `bootRealEstateApp` goes to a bare `/real-estate`, so
 * calling it after a reload throws away the `?f` query string the round-trip test just produced. That
 * is precisely the bug this split prevents.
 *
 * Generous timeout: this route builds a location hierarchy, the metro centroids and six slider
 * baselines from the booted corpus before it renders anything.
 */
async function waitForRealEstateBoot(page: Page): Promise<void> {
	await expect(page.getByText(subtitle('Real estate', 'vanilla'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/** Navigate to the real-estate route and wait for the boot. */
async function bootRealEstateApp(page: Page): Promise<void> {
	await page.goto(vanillaUrl('/real-estate'));
	await waitForRealEstateBoot(page);
}

test.describe('vanilla real-estate app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootRealEstateApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and repaints the chip', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		// The label must be read WITHOUT the projected-count badge, or it can never match this same chip
		// once it is selected. See `chipLabelWithoutCount`.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBeLessThan(before);

		// The control itself must show the commit, not just the results. This is the framework-less
		// failure mode: a missed `update(state)` leaves a chip looking unselected over results it is
		// filtering, and no count assertion would notice.
		await expect(
			page.locator('.fe-chip--selected').filter({ hasText: label }).first(),
		).toBeVisible();
	});

	test('the price slider draws a distribution overlay, and it repaints on a commit', async ({ page }, testInfo) => {
		// The framework-less twin of the same test in `real-estate.spec.ts`, and worth having twice: this
		// vertical is the only one whose bars are reconciled by hand, so it is the only one where a repaint
		// can leave a stale class on a reused element. The unit suite covers that directly; this covers the
		// whole chain from bundle query to painted DOM in a real browser.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const priceSlider = rangeSliderByLabel(page, 'Price');

		await expect(priceSlider).toHaveCount(1);

		const before = await histogramSignature(priceSlider);

		expect(before.length).toBeGreaterThan(1);
		expect(before.every(isPaintedHistogramBar)).toBe(true);

		// Narrowing a different facet must reshape this field's distribution — the counts are
		// filtered-except-self, so a static overlay would pass everything above while describing the whole
		// corpus.
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		await settledCount(page);

		await expect
			.poll(async () => (await histogramSignature(priceSlider)).join(), { intervals: [...PLAYWRIGHT_POLL_INTERVALS]})
			.not.toBe(before.join());
	});

	test('selecting a location in the hierarchy commits a Location chip', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// The picker renders the tree's top level collapsed, so the first row is a top-level node — a
		// click on it cascades its whole subtree into the selection, which is what makes this control
		// different from a chip group.
		await page.locator(TREE_ROW).first().click();

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Location' })).toBeVisible();
		expect(await settledCount(page)).toBeLessThanOrEqual(before);

		// And the tree row repaints to checked — same reasoning as the chip above.
		await expect(page.locator('.fe-tree__control--checked').first()).toBeVisible();
	});

	test('enabling the geo-radius filter commits a Distance chip', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Engaging the checkbox adds the geo rule at the default center + radius. Asserted via the
		// deterministic "Distance" chip — proof the rule reached the engine — rather than a count delta
		// (which depends on where the default center lands in the corpus) or a tile render.
		await page.getByLabel('Filter by distance').check();

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Distance' })).toBeVisible();

		// Clearing removes it again. In this vertical that also proves the geo section derives its
		// enabled state from the RULE's presence rather than from a local flag: the checkbox has to
		// un-check itself in response to an engine change it did not initiate.
		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		await expect(page.getByLabel('Filter by distance')).not.toBeChecked();
	});

	test('deselecting the last value of a facet clears it rather than emptying the results', async ({
		page,
	}, testInfo) => {
		// The single most likely thing to get wrong in a panel, and it fails LOUDLY in the wrong
		// direction: an `InSetRule` with an empty set still participates in the AND and matches nothing,
		// so a facet that writes one instead of removing itself filters the corpus to zero.
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);

		// Click THIS chip again, by name. An unscoped `.fe-chip--selected').first()` happens to hit the
		// right one only because the date group — whose "Any time" option is selected by default —
		// is section 13 of 14 and therefore later in the DOM. That is section ordering doing the work of
		// an assertion, and it would break silently the day the panel is reordered.
		await page.locator('.fe-chip--selected').filter({ hasText: label }).first().click();

		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('clear all resets every active filter', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
		test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

		// The measurement is `expectPanelScrollsToLastControl`'s, not this spec's. All four real-estate
		// specs carried a byte-identical copy of it, which is the shape where the fifth quietly disagrees
		// — and all of them predated the helper the histogram pass extracted for the books panels.
		//
		// The description search is the LAST section in all six real-estate panels, and it is named
		// explicitly rather than found with `:last-child`: "what sits last" is a per-dataset fact, and a
		// helper that guessed could pass against a spacer.
		await expectPanelScrollsToLastControl(page, 'input[aria-label="Search listing descriptions"]');
	});

	test('shareable-URL round-trip: a filter writes ?f= and a reload restores it', async ({
		page,
	}, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		// Captured BEFORE the click, badge-less, because the assertion after the reload has to name this
		// exact chip — see the comment on that assertion for why an unscoped match is a false pass.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		const narrowed = await settledCount(page);

		await expect
			.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 })
			.not.toBeNull();

		// Wait, do NOT re-navigate: `bootRealEstateApp` goes to a bare `/real-estate` and would discard
		// the `?f` this test exists to restore from.
		await page.reload();
		await waitForRealEstateBoot(page);

		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);

		/*
		 * The panel's controls must reflect the restored state too — hydration writes rules onto the
		 * engine and every control derives from that map, so a chip left unselected here would mean the
		 * panel never received its first `update`.
		 *
		 * Scoped to the chip that was actually clicked, and that is the whole point. An unscoped
		 * `.fe-chip--selected` is a FALSE PASS: `<DatePresetGroup>` marks its "Any time" option selected
		 * whenever no date rule is active — the default — so at least one selected chip always exists and
		 * the assertion goes green on a panel that received nothing from hydration — a passing test that
		 * is not evidence of coverage.
		 */
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await expect(page.locator('.fe-chip--selected').filter({ hasText: label })).toHaveCount(1);
	});

	test('has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Scan the settled state with motion reduced, so axe evaluates final colors rather than a
		// transient animation frame.
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter(
			(violation) => violation.impact === 'serious' || violation.impact === 'critical',
		);
		const summary = blocking
			.map((violation) => `${violation.id} (${violation.impact ?? 'n/a'}, ${violation.nodes.length} node(s))`)
			.join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
