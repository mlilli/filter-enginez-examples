/**
 * End-to-end tests for the framework-less books demo — run against BOTH reactive surfaces.
 *
 * @remarks
 * The thesis of this vertical is that `/books` (fine-grained `reactive-signals`) and `/books-raw`
 * (the bare `@filter-enginez/core`, no adapter package at all) are behaviorally identical. So rather
 * than write one spec per route, the journey is parameterized over both — if the two ever diverge in
 * observable behavior, the same assertion fails on one of them and names which.
 *
 * The full-corpus boot is heavy, so these carry generous timeouts like the other verticals' specs.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	PLAYWRIGHT_POLL_INTERVALS,
	readCount,
	settledCount,
	type SettledCountOptions,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { vanillaUrl } from './vanillaBase.js';

/**
 * How this spec settles a count: any stable value, at Playwright's own probe cadence.
 *
 * @remarks
 * Two departures from the shared defaults, both deliberate, because changing either would change what
 * the tests assert:
 *
 *   - **`requirePositive: false`** — a stable 0 settles here. Nothing in this journey needs zero
 *     rejected: `waitForBoot` has already proved a card rendered before any count is read, and the
 *     first assertion is an explicit `toBeGreaterThan(0)`, which fails far more legibly than a poll
 *     timeout would.
 *   - **Playwright's cadence** rather than a flat 150ms — coarser probes straddle the ~600ms count roll
 *     instead of sampling inside it, which makes a false "two equal reads" settle less likely.
 */
const SETTLED: SettledCountOptions = {
	intervals: PLAYWRIGHT_POLL_INTERVALS,
	requirePositive: false,
	timeout: 15_000,
};

/** The two routes under test: same UI, different read path. */
const SURFACES = [
	{ path: '/books', subtitle: subtitle('Books', 'vanilla', 'signals') },
	{ path: '/books-raw', subtitle: subtitle('Books', 'vanilla', 'bare-core') },
] as const;

/**
 * Wait for the engine to boot and the first results to paint.
 *
 * @remarks
 * Both signals are OUTSIDE the filter panel, deliberately. At phone width the panel is behind
 * a "Filters" button — and waiting on anything inside it would conflate "the engine has not booted"
 * with "the drawer is closed". Only one of those is a failure.
 */
async function waitForBoot(page: Page): Promise<void> {
	await expect(page.locator('.fe-books-app')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.fe-book-card').first()).toBeVisible({ timeout: 60_000 });
}

for (const surface of SURFACES) {
	test.describe(`vanilla books — ${surface.subtitle}`, () => {
		test('boots, filters via a genre chip, and restores via the pill', async ({ page }, testInfo) => {
			await page.goto(vanillaUrl(surface.path));
			await waitForBoot(page);
			await openFilterPanel(page, testInfo, page.locator('.fe-chip').first());

			// The route identifies which surface is driving it.
			await expect(page.getByText(surface.subtitle)).toBeVisible();

			const total = await settledCount(page, SETTLED);

			expect(total).toBeGreaterThan(0);
			// No filters yet — the empty note shows and the active-filter bar does not.
			await expect(page.locator('.fe-active-filters__empty')).toBeVisible();

			// Toggle the first genre chip.
			await page.locator('.fe-chip').first().click();

			// The empty note gives way to the active-filter bar.
			await expect(page.locator('.fe-active-filters__empty')).toBeHidden();
			await expect(page.locator('.fe-filter-chip')).toHaveCount(1);
			await expect
				.poll(async () => readCount(page), { timeout: 15_000 })
				.toBeLessThan(total);

			// Removing the pill restores the full corpus.
			await page.locator('.fe-filter-chip__remove').first().click();
			await expect(page.locator('.fe-filter-chip')).toHaveCount(0);
			await expect(page.locator('.fe-active-filters__empty')).toBeVisible();
			await expect.poll(async () => readCount(page), { timeout: 15_000 }).toBe(total);
		});

		test('writes filter state into the URL and restores it on reload', async ({ page }, testInfo) => {
			await page.goto(vanillaUrl(surface.path));
			await waitForBoot(page);
			await openFilterPanel(page, testInfo, page.locator('.fe-chip').first());

			await page.locator('.fe-chip').first().click();
			await expect(page.locator('.fe-filter-chip')).toHaveCount(1);

			// The engine → URL sync is debounced; wait for `?f` to appear.
			await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 }).not.toBeNull();

			// Read the count only once its roll animation has settled — a mid-roll frame is not the
			// filtered total and would make this comparison meaningless.
			const filtered = await settledCount(page, SETTLED);

			// Reload the shared link — the filter should be rehydrated from `?f`.
			await page.reload();
			await waitForBoot(page);
			// No reopen needed: everything asserted below the reload — the pills and the count — lives in
			// the results column, outside the drawer.

			await expect(page.locator('.fe-filter-chip')).toHaveCount(1);
			await expect.poll(async () => readCount(page), { timeout: 15_000 }).toBe(filtered);
		});

		test('predictive-disable subdues chips that would empty the result set', async ({ page }, testInfo) => {
			await page.goto(vanillaUrl(surface.path));
			await waitForBoot(page);
			await openFilterPanel(page, testInfo, page.locator('.fe-chip').first());

			// Narrow hard with a genre, then a format — some combinations must become unavailable.
			await page.locator('.fe-chip').first().click();
			await expect(page.locator('.fe-filter-chip')).toHaveCount(1);

			// At least one chip somewhere in the panel should now be disabled (zero-result dead end).
			await expect
				.poll(async () => page.locator('.fe-chip--unavailable').count(), { timeout: 15_000 })
				.toBeGreaterThan(0);
			// Dead-end chips are genuinely non-interactive, not just dimmed.
			await expect(page.locator('.fe-chip--unavailable').first()).toBeDisabled();
		});

		test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
			test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

			await page.goto(vanillaUrl(surface.path));
			await waitForBoot(page);
			// Without `fe-filter-panel__scroller` the panel stops scrolling and the PAGE scrolls instead,
			// which nothing else notices. See the helper.
			// Runs on BOTH vanilla surfaces (`/books` and `/books-raw`), which share this panel.
			await expectPanelScrollsToLastControl(page, 'input[aria-label="ISBN-13 pattern"]');
		});

		test('has no serious or critical accessibility violations', async ({ page }) => {
			await page.goto(vanillaUrl(surface.path));
			await waitForBoot(page);
			// Scan the settled state with motion reduced, so axe evaluates final colors rather than a
			// transient animation frame.
			await page.emulateMedia({ reducedMotion: 'reduce' });

			const { violations } = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
			const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

			expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
		});
	});
}

test.describe('vanilla books — the two surfaces agree', () => {
	test('both routes report the same corpus total', async ({ page }) => {
		await page.goto(vanillaUrl('/books'));
		await waitForBoot(page);
		const signalsTotal = await settledCount(page, SETTLED);

		await page.goto(vanillaUrl('/books-raw'));
		await waitForBoot(page);
		const rawTotal = await settledCount(page, SETTLED);

		// Same engine, same corpus — the reactive surface must not change the answer.
		expect(rawTotal).toBe(signalsTotal);
	});
});
