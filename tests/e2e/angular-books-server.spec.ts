/**
 * End-to-end coverage for the Angular app's SERVER-BACKED books route (`/books-server`).
 *
 * @remarks
 * **The browser runs no filtering here.** Every chip, slider and keystroke round-trips to the
 * `@filter-enginez/examples-server` Node process on `:5198` (started by Playwright's `webServer` list
 * and proxied at `/api` by `ng serve`'s `proxy.config.json`). What makes the route worth a spec is what
 * ISN'T different: `<fe-books-filter-panel>`, `<fe-results-header>` and `<fe-book-card>` are the exact
 * components `/books` mounts, imported unchanged, over an `RxJsEngine` built by
 * `createRxJsEngineFromAsync` instead of `createRxJsEngine`. So these tests are the proof that the
 * `FilterEngineAsync` seam is real and not signals-only.
 *
 * Each `test` below pins one contract that a green `ng build` would not:
 *
 *   - The route boots at all — `booksServerResolver` deliberately never rejects, so a dead server
 *     renders the offline panel rather than failing the navigation. A spec that only asserted "some
 *     page rendered" would pass against a server that was never running.
 *   - **Predictive-disable survives the async engine.** The sync `.core` shim THROWS on
 *     `applyFiltersAndQuery`, so the panel routes through `asyncEngine.applyFiltersAndQuery` instead.
 *     If that one branch regresses, chips silently stop dimming and nothing else looks wrong. This is
 *     the highest-value test in the file.
 *   - The busy indicator lights during a real round-trip and returns to idle. On `/books` the engine
 *     settles before paint, so the indicator only shows because of the count animation; here the
 *     latency is genuine, which makes this the one place the tracker's actual purpose is observable.
 *
 * Timeouts throughout are deliberately generous: unlike every other spec in this suite, each commit on
 * this route is an HTTP request.
 *
 * @packageDocumentation
 */

import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

import { angularUrl } from './angularBase.js';
import { openFilterPanel, settledCount, type SettledCountOptions } from './filterFlow.js';
import { subtitle } from './subtitles.js';

/** The engine's filter endpoint, as seen by the browser (proxied to `:5198` by `ng serve`). */
const QUERY_ENDPOINT = '**/api/query';

/** How long the artificial-latency test holds each round-trip open, in ms. */
const INJECTED_LATENCY_MS = 1_500;

/**
 * What "open" means in this vertical: Angular's mobile filter panel is an inline collapse, not a
 * `dialog`, so the panel element appearing IS the readiness signal. (The React verticals wait for
 * react-ui's named off-canvas drawer instead.)
 */
const BOOKS_PANEL = '.fe-books-panel';

/** The engine status pill — lit from `markUserAction()` until a `lastChange` snapshot resolves it. */
const COMPUTING_INDICATOR = '.fe-computing-indicator';

/**
 * Whether the status pill reads "Engine idle".
 *
 * @remarks
 * Handed to `settledCount` as its extra per-probe gate. See `SETTLED` below for why this route needs
 * one at all.
 *
 * @param page - The page under test.
 * @returns `true` when the pill is idle.
 */
async function isEngineIdle(page: Page): Promise<boolean> {
	const label = await page.locator(COMPUTING_INDICATOR).first().getAttribute('aria-label');

	return label === 'Engine idle';
}

/**
 * How this spec settles a count — stricter than `angular-books.spec.ts`, and it has to be.
 *
 * @remarks
 * There, "two equal reads" is enough because the recompute finishes before paint. Here a commit is an
 * HTTP request, so two equal reads can easily both land BEFORE the response does — the count would look
 * settled at its pre-commit value. Gating additionally on the status pill reading "Engine idle" closes
 * that window: the pill stays lit from `markUserAction()` until a `lastChange` snapshot resolves it,
 * which is exactly the interval the naive check can sample straight through.
 *
 * `requirePositive: false` lets a count of 0 settle like any other value. The 250ms / 45s
 * tempo and the generous timeouts throughout this file have the same cause: unlike every other spec in
 * the suite, each commit on this route is a network round-trip.
 */
const SETTLED: SettledCountOptions = {
	intervals: [250],
	isAlsoSettled: isEngineIdle,
	requirePositive: false,
	timeout: 45_000,
};

/**
 * Navigate to `/books-server` and wait for the resolver's corpus fetch + initial state pull to land.
 *
 * @remarks
 * Asserting the offline panel is absent is not padding: `booksServerResolver` reports an unreachable
 * server as route data rather than rejecting, so without this check a suite run against a dead `:5198`
 * would fail later, deeper, and for a much less obvious reason.
 *
 * @param page - The page under test.
 */
async function gotoBooksServer(page: Page, testInfo: TestInfo): Promise<void> {
	await page.goto(angularUrl('/books-server'));

	await expect(page.locator('.fe-server-offline')).toHaveCount(0);
	// The results header, NOT the filter panel: at phone width the panel sits behind the "Filters"
	// drawer, so waiting on it would conflate "the corpus fetch has not landed"
	// with "the drawer is closed" — and only one of those is a failure.
	await expect(page.locator('.fe-results-header')).toBeVisible({ timeout: 45_000 });
	await settledCount(page, SETTLED);
	await openFilterPanel(page, testInfo, page.locator(BOOKS_PANEL));
}

test.describe('Angular /books-server — boot', () => {
	test('the route boots against the Node engine and renders a non-empty result set', async ({ page }, testInfo) => {
		await gotoBooksServer(page, testInfo);

		expect(await settledCount(page, SETTLED)).toBeGreaterThan(0);
		expect(new URL(page.url()).pathname).toBe('/books-server');
	});

	test('the header and footer identify this as the server-backed route', async ({ page }, testInfo) => {
		// Not cosmetic: `/books` and `/books-server` mount identical components, so these two strings are
		// the only thing on screen that distinguishes a page filtering in the tab from one filtering in
		// another process. If the route ever silently fell back to the in-browser engine, this would be
		// the assertion that noticed.
		await gotoBooksServer(page, testInfo);

		await expect(page.locator('.fe-books-app__subtitle')).toHaveText(subtitle('Books', 'angular', 'server'));
		await expect(page.locator('.fe-books-app__footer')).toContainText(
			'every filter runs on the Node server',
		);
	});
});

test.describe('Angular /books-server — server-computed filtering', () => {
	test('a chip narrows the corpus over HTTP and "Clear all" restores it', async ({ page }, testInfo) => {
		await gotoBooksServer(page, testInfo);
		const total = await settledCount(page, SETTLED);

		await expect(page.locator('.fe-active-filters__empty')).toBeVisible();

		// The narrowed count is computed by the Node engine and returned as indices — the browser
		// never runs a rule.
		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		const filtered = await settledCount(page, SETTLED);

		expect(filtered).toBeLessThan(total);
		await expect(page.locator('.fe-filter-chip')).toHaveCount(1);

		// `clearRules` goes through the sync `.core` shim, which forwards to the async engine — one of
		// the few shim methods that is a pass-through rather than a throw.
		await page.getByRole('button', { name: 'Clear all' }).click();
		expect(await settledCount(page, SETTLED)).toBe(total);
		await expect(page.locator('.fe-active-filters__empty')).toBeVisible();
	});

	test('a removable pill drops just its own rule', async ({ page }, testInfo) => {
		await gotoBooksServer(page, testInfo);

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		await settledCount(page, SETTLED);
		await page.locator('.fe-chip', { hasText: 'paperback' }).first().click();
		await settledCount(page, SETTLED);
		await expect(page.locator('.fe-filter-chip')).toHaveCount(2);

		await page.locator('.fe-filter-chip__remove').first().click();
		await settledCount(page, SETTLED);

		await expect(page.locator('.fe-filter-chip')).toHaveCount(1);
	});

	test('predictive-disable is live over the async engine', async ({ page }, testInfo) => {
		// THE test in this file. `createRxJsEngineFromAsync`'s `.core` shim throws on
		// `applyFiltersAndQuery` and points the caller at `engine.asyncEngine` instead. The panel's
		// bundle honors that with a single branch; `safeApplyBundleFromCore` on the other branch would
		// swallow the throw and hand back `null`. The visible consequence of losing that branch is
		// nothing at all — chips just quietly stop dimming — so it gets an explicit assertion.
		await gotoBooksServer(page, testInfo);

		await page.locator('.fe-chip', { hasText: 'poetry' }).first().click();
		await settledCount(page, SETTLED);

		await expect(page.locator('.fe-chip--unavailable').first()).toBeVisible({ timeout: 30_000 });

		// And the invariant that keeps the UI escapable: a SELECTED chip is never disabled, or there is
		// no way back out of a dead end.
		const selected = page.locator('.fe-chip--selected').first();

		await expect(selected).toBeVisible();
		await expect(selected).toBeEnabled();
		await expect(selected).not.toHaveClass(/fe-chip--unavailable/u);
	});
});

test.describe('Angular /books-server — the engine status pill', () => {
	test('the pill lights while a round-trip is in flight, then returns to idle', async ({ page }, testInfo) => {
		// On `/books` the recompute is over before paint, so "computing" is really the count animation.
		// Here it tracks an actual request — but a localhost round-trip can still be quicker than a
		// polling assertion, which would make a bare "is it lit?" check flaky. So the latency is made
		// deterministic: hold every `POST /api/query` open for a fixed window, and the lit state becomes
		// a fact rather than a race. The route handler is never removed — Playwright gives each test its
		// own page, so it dies with the test.
		await page.route(QUERY_ENDPOINT, async (route) => {
			await delay(INJECTED_LATENCY_MS);
			await route.continue();
		});

		await page.goto(angularUrl('/books-server'));
		await expect(page.locator('.fe-results-header')).toBeVisible({ timeout: 60_000 });
		await openFilterPanel(page, testInfo, page.locator(BOOKS_PANEL));

		const indicator = page.locator('.fe-computing-indicator').first();

		await expect(indicator).toHaveAttribute('aria-label', 'Engine idle', { timeout: 60_000 });

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();

		// `markUserAction()` runs before the write, so the pill is lit from the click until the
		// response resolves the tracker's version — a window at least INJECTED_LATENCY_MS wide.
		await expect(indicator).toHaveAttribute('aria-label', 'Engine computing', { timeout: 10_000 });

		// The latch regression this guards: marking without ever resolving leaves the pill stuck on
		// "computing" for the rest of the session. That is far more likely here, where
		// resolution depends on a network response landing, than on the synchronous route.
		await expect(indicator).toHaveAttribute('aria-label', 'Engine idle', { timeout: 60_000 });
	});
});

test.describe('Angular /books-server — shareable URL state', () => {
	test('filter state round-trips through the URL', async ({ page }, testInfo) => {
		await gotoBooksServer(page, testInfo);

		await page.locator('.fe-chip', { hasText: 'fantasy' }).first().click();
		const filtered = await settledCount(page, SETTLED);

		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 15_000 }).not.toBeNull();
		const shared = page.url();

		// A fresh load re-runs `booksServerResolver`, which loads the shared config onto the TRANSPORT
		// before `createRxJsEngineFromAsync` pulls initial state — so the restored count must arrive on
		// the adapter's first round-trip, not a second corrective one. The chip assertion additionally
		// proves the panel derives its selection from engine state rather than a local mirror.
		await page.goto(shared);
		await expect(page.locator('.fe-server-offline')).toHaveCount(0);
		await expect(page.locator('.fe-results-header')).toBeVisible({ timeout: 45_000 });

		expect(await settledCount(page, SETTLED)).toBe(filtered);
		// A reload closes the drawer at phone width, and the chip assertion is the point of this test.
		await openFilterPanel(page, testInfo, page.locator(BOOKS_PANEL));
		await expect(page.locator('.fe-chip--selected', { hasText: 'fantasy' })).toBeVisible();
	});
});
