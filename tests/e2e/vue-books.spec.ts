/**
 * End-to-end tests for the Vue 3 books app (`/books`) — the critical filter flow at parity with
 * `svelte-books.spec.ts` and `angular-books.spec.ts`, driving the `@filter-enginez/vue-signals` binding.
 *
 * @remarks
 * This app renders `<BooksView>` over `vue-signals` binding a
 * main-thread engine and reuses the shared `ui-styles` `fe-*` classes, so the selectors are identical to
 * the React, Svelte and Angular books specs. Three Vue-specific differences from `svelte-books.spec.ts`:
 *
 *   - **No off-canvas drawer.** The mobile filter panel is toggled by a "Filters" button rather than
 *     rendered as react-ui's named `dialog`, so `openFilterPanel` just reveals it and there is nothing
 *     to close.
 *   - **The panel is `v-if`'d out while closed**, not merely hidden — unlike Vue's own `/real-estate`,
 *     which keeps its collapse mounted so the Leaflet map survives. So at phone width the chips do not
 *     exist in the DOM until the drawer is opened, and every chip assertion below must be preceded by an
 *     `openFilterPanel` — including after a reload.
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app; these navigate to the Vue origin via
 *     `vueUrl(...)`.
 *
 * ### What this covers that the Vue real-estate spec does not
 *
 * **Predictive disable.** Books is the panel with the exclusion-projection bundle wired across all four
 * chip groups: for every unselected candidate the engine projects what the corpus would look like with
 * that value added, and the panel dims the ones that would come back empty. Nothing typechecks it and no
 * engine unit test can catch its absence, because the engine happily computes the projection for a panel
 * that never asks — the failure is a panel that stops asking, and it looks exactly like a panel with no
 * dead ends. Hence both halves are asserted: at least one chip goes unavailable, and a SELECTED chip is
 * never disabled (the invariant that keeps a zero-result corner escapable).
 *
 * The genre names below are literals on purpose. `fantasy`, `poetry` and the other single-word genres
 * render verbatim, while `science-fiction` reaches the DOM as "science fiction" (the panel replaces
 * hyphens) — so a hyphenated genre would silently never match. `mystery` is avoided for a second reason:
 * `hasText` is a case-insensitive substring match, and the "Mystery & thriller" super-group chip
 * contains it.
 *
 * @packageDocumentation
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	TOGGLEABLE_CHIP,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { vueUrl } from './vueBase.js';

/** Any chip in the filter panel, selected or not — the four `InSet` groups all render this class. */
const CHIP = '.fe-chip';

/** A single-word genre that renders verbatim and collides with no super-group label. */
const NARROWING_GENRE = 'fantasy';

/** A thin genre: selecting it alone leaves enough dead ends to prove predictive disable is running. */
const SPARSE_GENRE = 'poetry';

/**
 * Wait for the main-thread boot to replace the "Booting the books engine…" placeholder with the live
 * page.
 *
 * @remarks
 * Separate from {@link bootBooksApp} because it must be usable after a `page.reload()`, where navigating
 * again would be actively wrong: `bootBooksApp` goes to a bare `/books` and would discard the `?f` query
 * string the round-trip test exists to restore from.
 *
 * The signal is the header subtitle plus the result count — both in the results column, both OUTSIDE the
 * filter panel. On this route that is not merely a good habit: the panel is unmounted while the drawer is
 * closed, so a panel-based boot signal would time out on every mobile run for a page that had booted
 * perfectly.
 */
async function waitForBooksBoot(page: Page): Promise<void> {
	await expect(page.getByText(subtitle('Books', 'vue'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/** Navigate to the books route and wait for the main-thread boot. */
async function bootBooksApp(page: Page): Promise<void> {
	await page.goto(vueUrl('/books'));
	await waitForBooksBoot(page);
}

test.describe('Vue books app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootBooksApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling a genre chip narrows the results and shows an active-filter pill', async ({
		page,
	}, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(CHIP, { hasText: NARROWING_GENRE }).first().click();

		// One pill, not "at least one": a single genre toggle must commit exactly one `InSetRule`. Two
		// would mean the super-group group had co-committed its own rule off the same click.
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
		expect(await settledCount(page)).toBeLessThan(before);
	});

	test('removing the active-filter pill restores the full set', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(CHIP, { hasText: NARROWING_GENRE }).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBeLessThan(before);

		// Each active pill carries a "Remove <label> filter" × button.
		await page.locator('.fe-filter-chip__remove').first().click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);

		// Back to exactly the boot count. Anything else would mean the removal wrote an empty rule rather
		// than dropping the rule — an empty `InSetRule` still participates in the AND and matches nothing.
		expect(await settledCount(page)).toBe(before);
	});

	test('predictive-disable dims chips that would empty the results', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		// Narrow hard enough that some candidates become dead ends. Generous timeout on the assertion
		// that follows: the dimming needs a bundle round trip AFTER the commit, so the chips repaint one
		// tick behind the count.
		await page.locator(CHIP, { hasText: SPARSE_GENRE }).first().click();
		await settledCount(page);

		await expect(page.locator('.fe-chip--unavailable').first()).toBeVisible({ timeout: 10_000 });

		// And the invariant that makes the feature safe rather than merely clever: a SELECTED chip is
		// never disabled. Disable it and the zero-result corner it created becomes inescapable — the only
		// control that could undo the filter is the one the filter just switched off.
		const selected = page.locator('.fe-chip--selected', { hasText: SPARSE_GENRE }).first();

		await expect(selected).toBeEnabled();
	});

	test('shareable-URL round-trip: a filter writes ?f= and a reload restores it', async ({
		page,
	}, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(CHIP, { hasText: NARROWING_GENRE }).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		const narrowed = await settledCount(page);

		// The engine → URL sync writes the serialized config to `?f=` via `history.replaceState`,
		// debounced ~150ms — so no new history entry, and nothing to see before the debounce lands.
		await expect
			.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 })
			.not.toBeNull();

		// Wait, do NOT re-navigate: `bootBooksApp` goes to a bare `/books` and would discard the `?f`
		// this test exists to restore from — the test would then re-measure a neutral engine and pass or
		// fail for reasons that have nothing to do with serialization.
		await page.reload();
		await waitForBooksBoot(page);

		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);

		// Reopen the drawer — a reload closes it, and at phone width the panel is unmounted while closed
		// — then assert the CONTROL, which is the point of this test: the chip's selected state derives
		// from the hydrated engine's rule map, so a lit pill over an unselected chip would mean hydration
		// reached the engine and never reached the panel.
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());

		const restored = page.locator('.fe-chip--selected', { hasText: NARROWING_GENRE }).first();

		await expect(restored).toBeVisible();
	});

	test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
		test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

		// Without `fe-filter-panel__scroller` the panel stops scrolling and the PAGE scrolls instead,
		// which nothing else notices. See the helper.
		await expectPanelScrollsToLastControl(page, 'input[aria-label="Filter by ISBN-13 pattern (regular expression)"]');
	});

	test('has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan (reveal the panel on mobile; a no-op on desktop).
		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		// Scan the SETTLED visual state — reduced motion so axe evaluates final colors rather than a
		// transient card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast
		// fail).
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
