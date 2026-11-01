/**
 * End-to-end test for the shareable-URL round-trip on the React books app (`/books`).
 *
 * @remarks
 * `@filter-enginez/url-state-router` is wired into the main-thread routes (`FilterEngineUrlSync` +
 * the format toggle + copy-link), so a filter change serializes to `?f=` and a fresh page load
 * re-hydrates the engine from it. This proves that contract end-to-end: filter → the URL carries the
 * state → a reload restores the same active filter + narrowed count. Selectors mirror `books.spec.ts`
 * (shared `ui-styles` `fe-*` classes; at phone width the filters sit behind the "Filters" toggle).
 *
 * In all six apps the URL layer also follows `?f=` while the route stays mounted, so Back and Forward
 * between two filter states load each one into the route's existing engine, the state the app itself
 * wrote earlier included: `<FilterEngineUrlSync>` in the two React apps, and
 * `examples-shared/url-state-follower` in the other four. The second suite drives that on `/books` in
 * every app, on both projects, and checks it happens in place: a marker set on `window` before the
 * navigations survives them (a reload would drop it), and the boot caption never appears again (a
 * re-mounted route would boot again).
 */

import { expect, type Page, test } from '@playwright/test';

import { VERTICALS } from '../../packages/examples-shared/src/verticals/verticals.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import {
	ACTIVE_CHIP,
	appUrl,
	clickFirstFacetChip,
	FACET_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/**
 * A selected chip in the books panel's body: one per value the filters hold. Both body classes, as
 * `FACET_CHIP` lists them: the React books panel's and the other four's.
 */
const SELECTED_FACET_CHIP = '.fe-filter-panel__body .fe-chip--selected, .fe-books-panel__body .fe-chip--selected';

/** What the in-place checks leave on `window`: a reload clears both, a re-mount sets the second. */
interface InPlaceProbe {
	/** Set before the navigations; still `1` after them only if the page never reloaded. */
	__noReloadMarker?: number;
	/** Set by an observer when a boot caption is added to the page. */
	hasSeenBootCaption?: boolean;
}

/**
 * Mark the page so a reload or a re-mount during the navigations that follow can be told afterwards.
 *
 * @remarks
 * Installed once the route has booted and its caption is gone: from then on, any `.fe-boot-caption`
 * added anywhere in the document means the route booted again.
 *
 * @param page - The page under test.
 */
async function markInPlace(page: Page): Promise<void> {
	await expect(page.locator('.fe-boot-caption')).toHaveCount(0);
	await page.evaluate(() => {
		const probe = window as InPlaceProbe & Window;

		probe.__noReloadMarker = 1;
		probe.hasSeenBootCaption = false;
		new MutationObserver(() => {
			if (document.querySelector('.fe-boot-caption') !== null) {
				probe.hasSeenBootCaption = true;
			}
		}).observe(document.documentElement, { childList: true, subtree: true });
	});
}

/**
 * Assert the page neither reloaded nor showed a boot caption since {@link markInPlace}.
 *
 * @param page - The page under test.
 * @param step - Which navigation is being checked, for the message.
 */
async function expectInPlace(page: Page, step: string): Promise<void> {
	const probe = await page.evaluate(() => {
		const { __noReloadMarker, hasSeenBootCaption } = window as InPlaceProbe & Window;

		return { __noReloadMarker, hasSeenBootCaption };
	});

	expect(probe.__noReloadMarker, `${step} reloaded the page`).toBe(1);
	expect(probe.hasSeenBootCaption, `${step} booted the route again: its boot caption appeared`).toBe(false);
	await expect(page.locator('.fe-boot-caption')).toHaveCount(0);
}

/**
 * The current `?f=` value, once the debounced write has put one there that differs from `previous`.
 *
 * @param page - The page under test.
 * @param previous - The value to move past, or `null` for "any value".
 * @returns The new value.
 */
async function nextFilterParam(page: Page, previous: string | null): Promise<string> {
	const read = (): string | null => new URL(page.url()).searchParams.get('f');

	await expect.poll(read, { timeout: 5_000 }).not.toBeNull();
	await expect.poll(read, { timeout: 5_000 }).not.toBe(previous);

	return read() ?? '';
}

/** Navigate to the books route and wait for the corpus boot to swap in the live books page. */
async function bootBooksApp(page: Page): Promise<void> {
	await page.goto('/books');
	await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('React books app — shareable-URL round-trip', () => {
	test('a filter serializes to ?f= and a fresh load restores it', async ({ page }, testInfo) => {
		await bootBooksApp(page);
		const full = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		const narrowed = await settledCount(page);

		expect(narrowed).toBeLessThan(full);

		// The engine → URL sync writes the serialized config to `?f=` (debounced).
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();
		const shared = page.url();

		// A brand-new navigation to the shared URL re-hydrates the engine from `?f=`.
		await page.goto('about:blank');
		await page.goto(shared);
		await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
		expect(await settledCount(page)).toBe(narrowed);
	});
});

test.describe('Every app — Back and Forward between two filter states on one route, in place', () => {
	for (const { id, name } of VERTICALS) {
		test(`${name}: Back to a state the app wrote loads it, and Forward loads the newer one, with no reload`, async ({ page }, testInfo) => {
			const { bootTimeoutMs, tier } = BOOKS_ARRIVAL[id];

			await page.goto(appUrl(id, '/books'));
			await expect(page.getByText(subtitle('Books', id, tier))).toBeVisible({ timeout: bootTimeoutMs });
			await expect(page.locator(RESULT_COUNT)).toBeVisible();
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());

			await clickFirstFacetChip(page);
			await expect(page.locator(SELECTED_FACET_CHIP)).toHaveCount(1);
			const earlierCount = await settledCount(page);
			const earlier = await nextFilterParam(page, null);
			const earlierPills = await page.locator(ACTIVE_CHIP).allInnerTexts();

			// Every filter write replaces the current history entry, so no control in the app leaves an
			// earlier filter state behind in history. Duplicating the entry here (outside the router, as
			// any script on the page could) makes the next write land in an entry of its own.
			await page.evaluate(() => {
				window.history.pushState(window.history.state, '', window.location.href);
			});

			await clickFirstFacetChip(page);
			await expect(page.locator(SELECTED_FACET_CHIP)).toHaveCount(2);
			const newerCount = await settledCount(page);
			const newer = await nextFilterParam(page, earlier);
			const newerPills = await page.locator(ACTIVE_CHIP).allInnerTexts();

			expect(newerPills, 'the second filter left the pills as they were').not.toEqual(earlierPills);
			await markInPlace(page);

			await page.goBack();
			expect(new URL(page.url()).searchParams.get('f')).toBe(earlier);
			await expect(page.locator(SELECTED_FACET_CHIP), 'Back reached the earlier link but the engine kept the newer state').toHaveCount(1);
			await expect.poll(async () => page.locator(ACTIVE_CHIP).allInnerTexts(), { message: 'Back loaded the earlier state but the pills kept the newer one' }).toEqual(earlierPills);
			expect(await settledCount(page)).toBe(earlierCount);
			await expectInPlace(page, 'Back');

			await page.goForward();
			expect(new URL(page.url()).searchParams.get('f')).toBe(newer);
			await expect(page.locator(SELECTED_FACET_CHIP), 'Forward reached the newer link but the engine kept the earlier state').toHaveCount(2);
			await expect.poll(async () => page.locator(ACTIVE_CHIP).allInnerTexts(), { message: 'Forward loaded the newer state but the pills kept the earlier one' }).toEqual(newerPills);
			expect(await settledCount(page)).toBe(newerCount);
			await expectInPlace(page, 'Forward');
		});
	}
});
