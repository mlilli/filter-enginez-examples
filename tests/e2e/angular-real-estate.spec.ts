/**
 * End-to-end tests for the Angular real-estate app (`/real-estate`) — the widest panel in the repo,
 * and the only real-estate route whose engine is booted by a ROUTE RESOLVER.
 *
 * @remarks
 * The Angular sibling of `vanilla-real-estate.spec.ts` and
 * `svelte-real-estate.spec.ts`, sharing their boot / settled-count / geo-chip machinery through
 * `filterFlow.ts`. Two structural notes, both inherited from `angular-books.spec.ts`:
 *
 *   - **The mobile collapse.** The filter panel is an inline `.fe-filter-collapse` toggled by a
 *     "Filters" button, so `openFilterPanel` merely expands it and there is nothing to close. The
 *     collapse stays MOUNTED when closed — it is driven by the `hidden` attribute rather than an `@if`,
 *     because destroying it would destroy the Leaflet map inside it.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the Angular origin
 *     via `angularUrl(...)`.
 *
 * ### What this vertical adds that no other real-estate spec covers
 *
 * 1. **A deep link has to survive the router.** This is the only real-estate route booted from a route
 *    resolver, and Angular is the only vertical where a missing `<base href="/">` silently turns every
 *    deep link into the landing page: `PathLocationStrategy` falls back to `location.pathname`, so the
 *    base href BECOMES `/real-estate`, the router strips it, matches the empty path, and renders the
 *    dataset hub. `ng build`, `ngc` with full template type-checking, and eslint all pass through that.
 *    `angular-books.spec.ts` pins the class of bug for `/books`; the resolver gives it a second,
 *    independent cause here, because a resolver that never runs looks exactly like a route that never
 *    matched.
 * 2. **Selection is DERIVED, never mirrored.** Alone among the four framework panels, this one reads
 *    every control's value back out of `activeRules$` instead of holding fourteen pieces of local state
 *    behind a `registerReset` handshake. So the load-bearing assertions here are the ones where an
 *    engine change the CONTROL did not initiate has to reach it — "Clear all" un-checking the geo
 *    checkbox, and a `?f` restore re-selecting a chip.
 *
 * The geo test asserts on the deterministic "Distance" chip — proof the rule reached the engine —
 * rather than on a Leaflet tile render, so it needs no network tiles and no map chunk. The numeric geo
 * controls are the accessible, testable path; the map is a progressive enhancement.
 *
 * @packageDocumentation
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { angularUrl } from './angularBase.js';
import {
	ACTIVE_CHIP,
	chipLabelWithoutCount,
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	PLAYWRIGHT_POLL_INTERVALS,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
	TOGGLEABLE_CHIP,
	TREE_ROW,
} from './filterFlow.js';
import { describeRealEstateParity } from './realEstateParity.js';
import { subtitle } from './subtitles.js';

/**
 * The real-estate panel root — deliberately the dataset-neutral `fe-filter-panel`, NOT books'
 * `fe-books-panel`.
 *
 * @remarks
 * Used only by the deep-link test, which is about the panel EXISTING. Every readiness wait uses the
 * chips the panel reveals instead, per `filterFlow.ts`'s first trap: a boot signal inside the panel
 * cannot tell "the route did not boot" apart from "the collapse is shut".
 */
const FILTER_PANEL = '.fe-filter-panel';

/**
 * The shared app-chrome subtitle. The `fe-books-app__*` prefix is a documented misnomer — it is the
 * header every Angular vertical composes, books or not.
 */
const SUBTITLE = '.fe-books-app__subtitle';

/**
 * How this spec settles a count: Playwright's own probe cadence, as `angular-books.spec.ts` uses.
 *
 * @remarks
 * The coarser cadence is the point — its later probes land either side of the ~600ms count roll rather
 * than twice inside it, which makes a false "two consecutive reads agree" settle less likely.
 * `requirePositive` stays at its default `true`: every count this spec settles is taken over a
 * non-empty set, so a zero read can only mean the corpus never arrived, and refusing to call that
 * settled is the honest reading.
 */
const SETTLED: SettledCountOptions = { intervals: PLAYWRIGHT_POLL_INTERVALS, timeout: 20_000 };

/**
 * Wait for the real-estate route to finish booting.
 *
 * @remarks
 * Separate from {@link bootRealEstateApp} because it must be usable after a `page.reload()`, where
 * navigating again would be actively wrong: `bootRealEstateApp` goes to a bare `/real-estate` and would
 * discard the `?f` query string the round-trip test exists to restore from.
 *
 * The signal is the header subtitle plus the result count — both in the results column, both OUTSIDE
 * the filter panel. That is not incidental: at phone width the panel sits behind the "Filters"
 * collapse, so a boot wait on the panel would fail on mobile for a route that booted fine.
 *
 * Generous timeout: the route resolver boots the corpus over HTTP, initializes the Roaring/WASM
 * acceleration and the R-tree, and derives the location hierarchy, the metro centroids and six slider
 * baselines — all before the component is created, because the resolver holds the navigation open until
 * it resolves.
 */
async function waitForRealEstateBoot(page: Page): Promise<void> {
	await expect(page.locator(SUBTITLE)).toHaveText(subtitle('Real estate', 'angular'), { timeout: 45_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/** Navigate to the real-estate route and wait for the resolver-driven boot. */
async function bootRealEstateApp(page: Page): Promise<void> {
	await page.goto(angularUrl('/real-estate'));
	await waitForRealEstateBoot(page);
}

test.describe('Angular real-estate app — routing', () => {
	test('a DIRECT deep link to /real-estate renders the panel, not the landing page', async ({
		page,
	}, testInfo) => {
		// Deliberately its own navigation, outside any `beforeEach`: the whole assertion is about what a
		// COLD deep link resolves to. With no `<base href="/">` Angular's PathLocationStrategy falls back
		// to `location.pathname`, the base href becomes "/real-estate", the router strips it, matches the
		// empty path, and renders the dataset hub — invisible to `ng build` and to `ngc`.
		await page.goto(angularUrl('/real-estate'));
		await waitForRealEstateBoot(page);

		// No landing grid, and the URL was not rewritten. Together these say the ROUTE matched rather
		// than something merely rendering under a redirected path.
		await expect(page.locator('.fe-landing__grid')).toHaveCount(0);
		expect(new URL(page.url()).pathname).toBe('/real-estate');

		// And the resolver's payload actually reached the panel — the second failure mode a deep link has
		// on this route, since a resolver that never runs is indistinguishable from a route that never
		// matched. Opened first on mobile, where the panel sits behind the "Filters" trigger.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await expect(page.locator(FILTER_PANEL)).toBeVisible();
	});
});

test.describe('Angular real-estate app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootRealEstateApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page, SETTLED)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and shows an active-filter pill', async ({
		page,
	}, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const chip = page.locator(TOGGLEABLE_CHIP).first();
		// The label must be read WITHOUT its projected-count badge, or it can never match this same chip
		// once it is selected — the panel drops the badge on selection. See `chipLabelWithoutCount`.
		const label = await chipLabelWithoutCount(chip);

		await chip.click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);

		// The control has to show the commit too, and in THIS vertical that is a statement about the
		// derived-selection design: `--selected` is computed from `activeRules$`, so a failure here means
		// the rule never landed in the engine's rule map — not merely that a class was forgotten.
		const selected = page.locator('.fe-chip--selected').filter({ hasText: label }).first();

		await expect(selected).toBeVisible();
	});

	test('selecting a location in the hierarchy commits a Location chip', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// The picker renders the tree's top level collapsed, so the first row is a top-level node — a
		// click on it cascades its whole subtree into the selection, which is what makes this control
		// different from a chip group.
		await page.locator(TREE_ROW).first().click();

		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Location' })).toBeVisible();
		expect(await settledCount(page, SETTLED)).toBeLessThanOrEqual(before);

		// And the row repaints to checked. The rendered tree and the rule's `selected` list are built
		// from different structures, so a divergence between them surfaces here and nowhere else.
		await expect(page.locator('.fe-tree__control--checked').first()).toBeVisible();
	});

	test('enabling the geo-radius filter commits a Distance chip', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Engaging the checkbox adds the geo rule at the default center + radius. The section arrives
		// behind an `@defer (on immediate)` block, a tick after the rest of the panel; `check()`
		// auto-waits for it, which is why no explicit wait precedes this line.
		await page.getByLabel('Filter by distance').check();

		// Asserted via the deterministic "Distance" chip — proof the rule reached the engine — rather
		// than a count delta (which depends on where the default center lands in the corpus) or a tile
		// render.
		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Distance' })).toBeVisible();

		// Clearing removes it again AND un-checks the box. The second assertion is the whole point in
		// this vertical: the checkbox IS the rule's presence — no local flag, no reset handshake — so it
		// has to respond to an engine change it did not initiate. A local mirror would leave the box
		// checked over a filter that no longer exists.
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
		const before = await settledCount(page, SETTLED);

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
		expect(await settledCount(page, SETTLED)).toBe(before);
	});

	test('clear all resets every active filter', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBe(before);
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

		const narrowed = await settledCount(page, SETTLED);

		// The engine → URL sync writes the serialized config to `?f=` (debounced ~150ms).
		await expect
			.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 })
			.not.toBeNull();

		// Wait, do NOT re-navigate: `bootRealEstateApp` goes to a bare `/real-estate` and would discard
		// the `?f` this test exists to restore from. A reload is also what makes this a real test of the
		// resolver's hydration path — the resolver memoizes its payload for the session, so only a fresh
		// document re-runs the `readConfigFromUrl` branch.
		await page.reload();
		await waitForRealEstateBoot(page);

		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page, SETTLED)).toBe(narrowed);

		// Reopen the collapse — a reload shuts it at phone width — because the panel's controls must
		// reflect the restored state too. Every control here derives from the engine's rule map, so an
		// unselected chip over a restored rule would mean hydration wrote the URL config somewhere the
		// controls never read.
		//
		// Matched by LABEL, not by position: the listed-date group renders its "Any time" option as a
		// `.fe-chip--selected` chip whenever no date rule is active, so an unscoped first-match here would
		// go green on a panel that received nothing at all.
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

describeRealEstateParity({ id: 'angular', label: 'Angular' });
