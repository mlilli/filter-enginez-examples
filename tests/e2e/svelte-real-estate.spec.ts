/**
 * End-to-end tests for the SvelteKit real-estate app (`/real-estate`) — the widest panel in the repo.
 *
 * @remarks
 * The Svelte sibling of `real-estate.spec.ts`, sharing its
 * boot / settled-count / geo-chip machinery, with two structural differences it inherits from
 * `svelte-books.spec.ts`:
 *
 *   - **The mobile collapse.** The filter panel is an inline collapse toggled by a "Filters" button,
 *     so `openFilterPanel` just expands it and there is nothing to close. That is also why the results
 *     column stays interactable on mobile.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the SvelteKit
 *     origin via `svelteUrl(...)`.
 *
 * ### What this covers that no other spec does
 *
 * Two of these tests guard failure modes that pass every other gate, not a novel flow:
 *
 *   1. **The panel scroller is actually scrollable.** `/real-estate` has fourteen sections, so the
 *      panel always overflows its sticky card — and a wrapper carrying the mobile `hidden` attribute
 *      with no class severs the flex height chain `.fe-filter-panel__scroller` depends on, leaving the
 *      bottom sections unreachable. Nothing
 *      typechecks or unit-tests that; a layout invariant needs a real layout engine, which is exactly
 *      what e2e is for. See `.fe-filter-collapse` in `ui-styles`.
 *   2. **The location hierarchy commits.** The tri-state tree is this route's distinctive control and
 *      the one whose rows are derived from a different structure than the bundle's candidate list; a
 *      rendering/selection divergence there is invisible until a click produces the wrong rule.
 *   3. **A `?f` restore reaches the CONTROLS, not just the pill and the count.** The panel derives
 *      selection from `activeRules`. A panel that mirrored it in local `$state` without seeding it from
 *      the engine would restore a shared link's filter with every chip unselected — and a test that only
 *      looked at the results column would pass anyway. The assertion at the bottom of the round-trip
 *      test is what keeps the derivation in place.
 *
 * The geo test asserts on the deterministic "Distance" chip — proof the rule reached the engine —
 * rather than on a Leaflet tile render, so it depends on no network tiles. The numeric geo controls
 * are the accessible, testable path; the map is a progressive enhancement.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	chipLabelWithoutCount,
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	TOGGLEABLE_CHIP,
	TREE_ROW,
} from './filterFlow.js';
import { describeRealEstateParity } from './realEstateParity.js';
import { subtitle } from './subtitles.js';
import { svelteUrl } from './svelteBase.js';

/** Navigate to the real-estate route and wait for the main-thread boot to render the live page. */
async function bootRealEstateApp(page: Page): Promise<void> {
	await page.goto(svelteUrl('/real-estate'));
	// Main-thread boot over the streamed default tier (+ bitmap-accel + R-tree init) behind the
	// "Booting the real-estate engine…" placeholder. Generous, because this route builds a location
	// hierarchy and six slider baselines from the booted corpus before it renders.
	await expect(page.getByText(subtitle('Real estate', 'sveltekit'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('SvelteKit real-estate app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootRealEstateApp(page);
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

	test('selecting a location in the hierarchy commits a Location chip', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// The picker renders the tree's top level collapsed, so the first row is a top-level node — a
		// click on it cascades its whole subtree into the selection, which is the behavior that makes
		// this control different from a chip group.
		await page.locator(TREE_ROW).first().click();

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Location' })).toBeVisible();
		expect(await settledCount(page)).toBeLessThanOrEqual(before);
	});

	test('enabling the geo-radius filter commits a Distance chip', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Engaging the checkbox adds the geo rule at the default center + radius. Asserted via the
		// deterministic "Distance" chip — proof the rule reached the engine — rather than a count delta
		// (which depends on where the default center lands in the corpus) or a tile render.
		await page.getByLabel('Filter by distance').check();

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Distance' })).toBeVisible();

		// Clearing removes it again, which also proves the checkbox derives from the rule's PRESENCE:
		// "Clear all" only drops rules, so an unchecked box here is the derivation working. There is no
		// reset callback left for the section to register.
		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		await expect(page.getByLabel('Filter by distance')).not.toBeChecked();
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

	test('shareable-URL round-trip: a filter writes ?f= and a reload restores it', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		// Captured for the post-reload control assertion at the bottom, and captured WITHOUT the
		// projected-count badge so it still matches once the chip is selected.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		const narrowed = await settledCount(page);

		// The engine → URL sync writes the serialized config to `?f=` (debounced ~150ms).
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();

		// A full reload re-hydrates the engine from `?f=`. Reload rather than re-navigate: a bare
		// `/real-estate` would discard the `?f` this test exists to restore from. This is also the only
		// test that exercises `ContainsAllRule`'s registry registration indirectly — a rule missing from
		// `ruleRegistry` fails to deserialize and the reload comes back unfiltered.
		await page.reload();
		await expect(page.getByText(subtitle('Real estate', 'sveltekit'))).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);

		// Reopen the collapse — a reload closes it at phone width — because the panel's CONTROLS must
		// reflect the restored state too, not only the pill and the count. `+page.svelte` calls
		// `core.loadConfig(urlConfig)` before the view renders, so an unselected chip here means the panel
		// is ignoring rules that were already on the engine when it mounted.
		//
		// Matched by LABEL, not by position: `<DatePresetGroup>` renders its "Any time" option as a
		// `.fe-chip--selected` chip whenever no date rule is active — the default — so an unscoped
		// first-match would go green on a panel that seeded nothing at all.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const restored = page.locator('.fe-chip--selected').filter({ hasText: label }).first();

		await expect(restored).toBeVisible();
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan (open the collapse on mobile; no-op on desktop). The
		// geo map is off by default, so the scan covers the labeled numeric controls rather than
		// Leaflet's own chrome.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Scan the SETTLED visual state — reduced motion so axe evaluates final colors, not a transient
		// card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast fail). This
		// route also fades tree rows in on expand, which is the same hazard one control down.
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});

describeRealEstateParity({ id: 'sveltekit', label: 'SvelteKit' });
