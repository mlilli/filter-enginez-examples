/**
 * End-to-end tests for the Vue 3 real-estate app (`/real-estate`) — the fourteen-section panel over
 * `@filter-enginez/vue-signals`.
 *
 * @remarks
 * The Vue sibling of `svelte-real-estate.spec.ts` and
 * `vanilla-real-estate.spec.ts`, sharing their boot / settled-count / geo-chip machinery through
 * `filterFlow.ts`. Two structural notes:
 *
 *   - **No off-canvas drawer.** The mobile filter panel is an inline `.fe-filter-collapse` toggled by a
 *     "Filters" button, not react-ui's named `dialog`, so `openFilterPanel` merely expands it and there
 *     is nothing to close. On this route the collapse is hidden with the `hidden` attribute rather than
 *     `v-if` (unlike Vue's own `/books`), so the controls stay in the DOM while closed — which is why
 *     every readiness wait below is a VISIBILITY wait, never a count.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the Vue origin via
 *     `vueUrl(...)`.
 *
 * ### What this vertical adds that no other real-estate spec covers
 *
 * **The panel DERIVES every control's selection from `activeRules`**, as Angular's and vanilla's do
 * and as Vue's own books panel does — it holds no local mirror of the fourteen selections.
 *
 * That matters because `RealEstatePage` calls `core.loadConfig(urlConfig)` before the panel mounts. A
 * panel that mirrored its selections in local state initialized to empty would restore a shared `?f`
 * link with every control unselected — and the next click on a restored chip would write a
 * one-element set, silently dropping the values it never knew about. A header chip's × would also have
 * to do TWO things, drop the rule and reset the mirror, and doing only the first would look completely
 * healthy from the results column. These assertions fail the moment anything reintroduces a mirror.
 * `.fe-chip--selected` is always matched against a specific label for the same reason — an unscoped
 * match is a false pass, since `<DatePresetGroup>` marks "Any time" selected by default.
 *
 * The geo test asserts on the deterministic "Distance" chip — proof the rule reached the engine —
 * rather than on a Leaflet tile render, so it needs no network tiles and no map chunk. The numeric geo
 * controls are the accessible, testable path; the map is a progressive enhancement.
 *
 * @packageDocumentation
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
import { subtitle } from './subtitles.js';
import { vueUrl } from './vueBase.js';

/** Each active pill's × button. Dropping the rule must repaint the control it came from. */
const REMOVE_PILL = '.fe-filter-chip__remove';

/**
 * Wait for the main-thread boot to replace the progress placeholder with the live page.
 *
 * @remarks
 * Separate from {@link bootRealEstateApp} because it must be usable after a `page.reload()`, where
 * navigating again would be actively wrong: `bootRealEstateApp` goes to a bare `/real-estate` and would
 * discard the `?f` query string the round-trip test exists to restore from.
 *
 * The signal is the header subtitle plus the result count — both in the results column, both OUTSIDE
 * the filter panel. Waiting on anything in the panel would conflate "the route has not booted" with
 * "the drawer is closed", and only one of those is a failure.
 *
 * Generous timeout: this route builds the location hierarchy, the metro centroids and six slider
 * baselines from the booted corpus, behind the "Booting the real-estate engine…" placeholder, before it
 * renders anything at all.
 */
async function waitForRealEstateBoot(page: Page): Promise<void> {
	await expect(page.getByText(subtitle('Real estate', 'vue'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/** Navigate to the real-estate route and wait for the main-thread boot. */
async function bootRealEstateApp(page: Page): Promise<void> {
	await page.goto(vueUrl('/real-estate'));
	await waitForRealEstateBoot(page);
}

test.describe('Vue real-estate app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootRealEstateApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and shows an active-filter pill', async ({
		page,
	}, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		// The label must be read WITHOUT its projected-count badge, or it can never match this same chip
		// once it is selected — the panel drops the badge on selection. See `chipLabelWithoutCount`.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBeLessThan(before);

		// The chip has to repaint as well. Here that is a statement about local state: the panel's own
		// `selectedTypes`-style ref is the source of `--selected`, so this failing means the commit and
		// the control's copy of the truth have already diverged on the way IN — before any reset is
		// involved.
		const selected = page.locator('.fe-chip--selected').filter({ hasText: label }).first();

		await expect(selected).toBeVisible();
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

		// And the row repaints to checked. The rendered tree and the rule's `selected` list are built
		// from different structures, so a divergence between them surfaces here and nowhere else.
		await expect(page.locator('.fe-tree__control--checked').first()).toBeVisible();
	});

	test('enabling the geo-radius filter commits a Distance chip', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Engaging the checkbox adds the geo rule at the default center + radius. The geo section is
		// dynamically imported on mount, so it lands a tick after the rest of the panel; `check()`
		// auto-waits for it, which is why no explicit wait precedes this line.
		await page.getByLabel('Filter by distance').check();

		// Asserted via the deterministic "Distance" chip — proof the rule reached the engine — rather
		// than a count delta (which depends on where the default center lands in the corpus) or a tile
		// render.
		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Distance' })).toBeVisible();

		// Clearing removes it again AND un-checks the box. The box derives from the engine's geo rule
		// (`rule('geo-proximity')`), so the un-check proves "Clear all" reached a section the panel loads
		// dynamically and never looks inside — through the engine, with no reset handshake.
		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		await expect(page.getByLabel('Filter by distance')).not.toBeChecked();
	});

	test('removing a header pill resets the CONTROL, not just the rule', async ({ page }, testInfo) => {
		// A regression pin: with selection derived this passes for free, and it fails the moment anything
		// reintroduces a local mirror. A removal that
		// only calls `removeFacet(engine, ruleId)` produces a perfectly correct results column — pill
		// gone, count restored — over a chip that is still lit. The panel's local state and the engine's
		// rule map have silently forked, and the next click on that chip toggles it OFF a selection the
		// engine no longer holds.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		const label = await chipLabelWithoutCount(chip);

		await chip.click();

		const selected = page.locator('.fe-chip--selected').filter({ hasText: label });

		await expect(selected.first()).toBeVisible();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		await page.locator(REMOVE_PILL).first().click();

		// The rule went (this much a rule-only removal would also satisfy)...
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);

		// ...and so did the SELECTION. `toHaveCount(0)` rather than `not.toBeVisible()` because the chip
		// itself must still be there and clickable — it is only its `--selected` class that must go. The
		// count badge returns at the same moment, which is precisely why the label was captured without
		// it: `hasText` still matches `Condo(412)`, so this assertion is about the class alone.
		await expect(selected).toHaveCount(0);
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

		// Click the SAME chip back off, matched by its badge-less label rather than by position: the
		// listed-date presets render `.fe-chip` too, so a bare first-match would be a positional bet.
		const selected = page.locator('.fe-chip--selected').filter({ hasText: label }).first();

		await selected.click();

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
		// Captured for the post-reload control assertion at the bottom, and captured WITHOUT the
		// projected-count badge so it still matches once the chip is selected.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		const narrowed = await settledCount(page);

		// The engine → URL sync writes the serialized config to `?f=` via `history.replaceState`,
		// debounced ~150ms — so no new history entry, and nothing to see before the debounce lands.
		await expect
			.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 })
			.not.toBeNull();

		// Wait, do NOT re-navigate: `bootRealEstateApp` goes to a bare `/real-estate` and would discard
		// the `?f` this test exists to restore from. This is also the only test that exercises
		// `ContainsAllRule`'s registry registration indirectly — a rule missing from `ruleRegistry` fails
		// to deserialize, and the reload comes back unfiltered.
		await page.reload();
		await waitForRealEstateBoot(page);

		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);

		// Reopen the drawer — a reload closes it at phone width — because the panel's controls must
		// reflect the restored state too. Hydration writes rules onto the engine, and this panel seeds
		// its local state FROM those rules on mount, so an unselected chip here would mean the seeding
		// ran before hydration rather than after it.
		//
		// Matched by LABEL, not by position: the listed-date group renders its "Any time" option as a
		// `.fe-chip--selected` chip whenever no date rule is active, so an unscoped first-match here would
		// go green on a panel that seeded nothing at all.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const restored = page.locator('.fe-chip--selected').filter({ hasText: label }).first();

		await expect(restored).toBeVisible();
	});

	test('has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan (expand the collapse on mobile; a no-op on desktop).
		// The geo map is off by default, so this covers the labeled numeric controls rather than
		// Leaflet's own chrome.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Scan the SETTLED visual state — reduced motion so axe evaluates final colors rather than a
		// transient card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast
		// fail). This route fades tree rows in on expand, which is the same hazard one control down.
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
