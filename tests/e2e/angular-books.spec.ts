/**
 * End-to-end coverage for the Angular app.
 *
 * @remarks
 * **These specs are shaped by failure modes a build cannot see**, not by a coverage target. Every one
 * of the following gets through `ng build`, `ngc` with full template type-checking, and eslint — and
 * shows in a browser within seconds:
 *
 *   - A missing `<base href="/">` makes every deep link render the landing page.
 *   - An engine-busy tracker marked but never resolved latches the status pill on "computing" forever
 *     after the first filter commit.
 *   - The async `.core` shim throws on `applyFiltersAndQuery`, so routing predictive-disable through
 *     it would silently disable it on `/books-server` while looking entirely healthy.
 *
 * The through-line: a green build says the code compiles, not that the app works. Each `test` below
 * pins one of those, plus the ordinary journey.
 *
 * @packageDocumentation
 */

import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { BOOKS_SEARCH_COPY } from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { angularUrl } from './angularBase.js';
import { describeBooksParity } from './booksParity.js';
import {
	expectPanelScrollsToLastControl,
	isMobileProject,
	openFilterPanel,
	PLAYWRIGHT_POLL_INTERVALS,
	settledCount,
	type SettledCountOptions,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/**
 * What "open" means in this vertical: Angular's mobile filter panel sits in an inline collapse with no
 * role and no accessible name, kept mounted under `hidden` — the panel element turning visible IS the
 * readiness signal.
 *
 * @remarks
 * Never a boot signal: at phone width the panel sits behind the "Filters" collapse, so asserting
 * `.fe-books-panel` visible straight after navigation would fail on mobile for a route that booted fine.
 */
const BOOKS_PANEL = '.fe-books-panel';

/**
 * How this spec settles a count: any stable value, at Playwright's own probe cadence.
 *
 * @remarks
 * Both departures from the shared defaults are deliberate. `requirePositive: false` because two equal reads are all this route needs — the
 * recompute finishes before paint here, so "computing" is really just the count animation. Playwright's
 * cadence because coarser probes straddle the ~600ms count roll instead of sampling inside it, which
 * makes a false "two equal reads" settle less likely.
 */
const SETTLED: SettledCountOptions = {
	intervals: PLAYWRIGHT_POLL_INTERVALS,
	requirePositive: false,
	timeout: 15_000,
};

/**
 * Wait for the books route to finish booting.
 *
 * @remarks
 * The boot signal is the results header, NOT the filter panel: the panel is hidden behind the
 * "Filters" toggle at phone width, so waiting on it would conflate "the route has not booted" with
 * "the collapse is shut" — and only one of those is a failure.
 */
async function gotoBooks(page: Page, testInfo: TestInfo): Promise<void> {
	await page.goto(angularUrl('/books'));
	await expect(page.locator('.fe-results-header')).toBeVisible();
	await settledCount(page, SETTLED);
	await openFilterPanel(page, testInfo, page.locator(BOOKS_PANEL));
}

test.describe('Angular app — routing', () => {
	test('a DIRECT deep link to /books renders books, not the landing page', async ({ page }) => {
		// The regression this exists for: with no `<base href="/">`, Angular's PathLocationStrategy
		// falls back to `location.pathname`, so the base href BECOMES "/books", the router strips it,
		// matches the empty path, and silently renders the landing hub instead.
		await page.goto(angularUrl('/books'));

		// The subtitle, not the filter panel: at phone width the panel is behind the "Filters"
		// toggle, and this test is about WHICH ROUTE rendered rather than about the panel.
		await expect(page.locator('.fe-books-app__subtitle')).toHaveText(subtitle('Books', 'angular'));
		await expect(page.locator('.fe-landing__grid')).toHaveCount(0);
		expect(new URL(page.url()).pathname).toBe('/books');
	});

	test('an unknown path renders the 404, not a redirect home', async ({ page }) => {
		await page.goto(angularUrl('/no-such-route'));

		await expect(page.locator('.fe-notfound')).toBeVisible();
		await expect(page.locator('.fe-landing__grid')).toHaveCount(0);
	});

	test('the landing hub links through to books', async ({ page }) => {
		await page.goto(angularUrl('/'));

		// `exact: true` matters: accessible-name matching is substring-by-default and
		// case-insensitive, so a bare 'Books' also matches the amber "Try the server-backed BOOKS
		// demo →" CTA sitting right above the grid. Two matches is a strict-mode violation.
		await page.getByRole('link', { exact: true, name: 'Books' }).click();

		await expect(page.locator('.fe-books-app__subtitle')).toHaveText(subtitle('Books', 'angular'));
		expect(new URL(page.url()).pathname).toBe('/books');
	});
});

test.describe('Angular app — books journey', () => {
	test('filters narrow the corpus and clear back to it', async ({ page }, testInfo) => {
		await gotoBooks(page, testInfo);
		const total = await settledCount(page, SETTLED);

		await expect(page.locator('.fe-active-filters__empty')).toBeVisible();

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		const filtered = await settledCount(page, SETTLED);

		expect(filtered).toBeLessThan(total);
		await expect(page.locator('.fe-filter-chip')).toHaveCount(1);

		await page.getByRole('button', { name: 'Clear all' }).click();
		expect(await settledCount(page, SETTLED)).toBe(total);
		await expect(page.locator('.fe-active-filters__empty')).toBeVisible();
	});

	test('the engine status pill returns to idle after a commit', async ({ page }, testInfo) => {
		// The latch bug: `markUserAction()` was wired without ever resolving the tracker, so
		// `isBusy` (a monotonic version comparison, not a boolean) stayed true forever and the pill
		// stuck on "computing" for the rest of the session.
		await gotoBooks(page, testInfo);

		const indicator = page.locator('.fe-computing-indicator');

		await expect(indicator).toHaveAttribute('aria-label', 'Engine idle');

		await page.locator('.fe-chip', { hasText: 'mystery' }).first().click();
		await settledCount(page, SETTLED);

		await expect(indicator).toHaveAttribute('aria-label', 'Engine idle', { timeout: 10_000 });
	});

	test('predictive-disable dims chips that would empty the results', async ({ page }, testInfo) => {
		await gotoBooks(page, testInfo);

		// Narrow hard enough that some chips become dead ends, then assert at least one went
		// unavailable — this is what silently dies if the projection bundle stops recomputing.
		await page.locator('.fe-chip', { hasText: 'poetry' }).first().click();
		await settledCount(page, SETTLED);

		await expect(page.locator('.fe-chip--unavailable').first()).toBeVisible({ timeout: 10_000 });

		// And the invariant: a SELECTED chip is never disabled, or there's no way back out.
		const selected = page.locator('.fe-chip--selected').first();

		await expect(selected).toBeEnabled();
	});

	test('a removable pill drops just its own rule', async ({ page }, testInfo) => {
		await gotoBooks(page, testInfo);

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		await page.locator('.fe-chip', { hasText: 'paperback' }).first().click();
		await settledCount(page, SETTLED);
		await expect(page.locator('.fe-filter-chip')).toHaveCount(2);

		await page.locator('.fe-filter-chip__remove').first().click();
		await settledCount(page, SETTLED);

		await expect(page.locator('.fe-filter-chip')).toHaveCount(1);
	});
});

test.describe('Angular app — shareable URL state', () => {
	test('filter state round-trips through the URL', async ({ page }, testInfo) => {
		await gotoBooks(page, testInfo);

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		const filtered = await settledCount(page, SETTLED);

		await expect.poll(() => new URL(page.url()).searchParams.get('f')).not.toBeNull();
		const shared = page.url();

		// A fresh load of the shared link must reproduce both the count AND the panel's selection —
		// the latter is what proves controls derive from engine state rather than local mirrors.
		await page.goto(shared);
		await expect(page.locator('.fe-results-header')).toBeVisible();

		expect(await settledCount(page, SETTLED)).toBe(filtered);
		// Reopen the collapse: a reload shuts it at phone width, and the chip assertion below is the
		// whole point of this test — it proves controls derive from engine state, not local mirrors.
		await openFilterPanel(page, testInfo, page.locator(BOOKS_PANEL));
		await expect(page.locator('.fe-chip--selected', { hasText: 'fantasy' })).toBeVisible();
	});

	test('the filter panel overflows its card and actually scrolls to the last section', async ({ page }, testInfo) => {
		test.skip(isMobileProject(testInfo), 'The sticky, height-capped sidebar card only exists at the lg breakpoint.');

		await gotoBooks(page, testInfo);
		// Without `fe-filter-panel__scroller` the panel stops scrolling and the PAGE scrolls instead,
		// which nothing else notices. See the helper.
		await expectPanelScrollsToLastControl(page, `input[aria-label="${BOOKS_SEARCH_COPY.isbn.ariaLabel}"]`);
	});

	test('cycling the URL format keeps the link working', async ({ page }, testInfo) => {
		await gotoBooks(page, testInfo);
		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		const filtered = await settledCount(page, SETTLED);

		await expect.poll(() => new URL(page.url()).searchParams.get('f')).not.toBeNull();
		const before = new URL(page.url()).searchParams.get('f');

		await page.locator('.fe-url-format-toggle').click();

		// The payload must actually change encoding...
		await expect.poll(() => new URL(page.url()).searchParams.get('f')).not.toBe(before);

		// ...and the re-encoded link must still resolve to the same filter state.
		await page.goto(page.url());
		await expect(page.locator('.fe-results-header')).toBeVisible();
		expect(await settledCount(page, SETTLED)).toBe(filtered);
	});
});

describeBooksParity({ id: 'angular', label: 'Angular' });
