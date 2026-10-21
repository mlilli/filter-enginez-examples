/**
 * End-to-end tests for the RTK books app — the critical filter flow.
 *
 * @remarks
 * The books sibling of `wine.spec.ts`: boot the (bundled, main-thread) corpus, narrow with a filter,
 * watch the result count re-compute through the redux-bridge mirror, then clear. A dedicated test types
 * into the description search and asserts the (debounced) engine commit lands as an active
 * "Description" filter chip. It asserts on the deterministic chip, not a corpus-dependent count, since
 * the procedural descriptions carry no guaranteed vocabulary.
 *
 * The cases every app shares — the action log, time travel, search timing, predictive disable on the
 * checkboxes, the results-column copy, the mobile collapse — are registered from `./booksParity.ts`
 * at the bottom, as every app's books spec does.
 *
 * The count-ticking machinery is shared: it lives in `./filterFlow.ts`, whose docblocks carry the
 * `settledCount` rationale. At phone width the panel sits in react-ui's `<FilterCollapse>`, hidden
 * behind the "Filters" toggle and kept mounted, so a case opens it by waiting for a facet chip to turn
 * visible and never has to close it to reach the results.
 *
 * **Selectors:**
 *   - `subtitle('Books', 'react-rtk')` — the header subtitle, present once `<DatasetRoute>` swaps in
 *     `<BooksApp>`. Derived from the vertical registry rather than spelled out; see `./subtitles.ts`.
 *   - `.fe-result-count__number` / `.fe-chip` / `.fe-filter-chip` / "Clear all" — shared react-ui.
 *   - The description search by its accessible name, `BOOKS_SEARCH_COPY.description.ariaLabel`.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { BOOKS_SEARCH_COPY } from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { describeBooksParity } from './booksParity.js';
import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	FACET_CHIP,
	FILTER_COLLAPSE,
	FILTERS_TOGGLE,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/** Navigate to the books route and wait for the corpus boot to swap in the live books page. */
async function bootBooksApp(page: Page): Promise<void> {
	// `/` is the dataset landing hub; the books app lives at `/books`.
	await page.goto('/books');
	// Main-thread boot over the bundled tier (+ bitmap-accel init) behind the inline boot caption.
	await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('React RTK books app — filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootBooksApp(page);
	});

	test('boots and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results and shows an active-filter chip', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		expect(await settledCount(page)).toBeLessThan(before);
	});

	test('typeahead description search commits a filter chip after debounce', async ({ page }, testInfo) => {
		const description = page.getByRole('searchbox', { exact: true, name: BOOKS_SEARCH_COPY.description.ariaLabel });

		await openFilterPanel(page, testInfo, description);
		// A single `fill` fires one input event → the controller's trailing-edge debounce commits
		// ~250ms later, with the field still focused.
		await description.fill('adventure');

		// The active "Description" chip is the deterministic proof the debounced query reached the
		// engine — asserted instead of a count delta, since the procedural descriptions carry no
		// guaranteed vocabulary to narrow against.
		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Description' })).toBeVisible();

		// Clearing removes it again.
		await page.getByRole('button', { exact: true, name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
	});

	test('clear all resets every active filter', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page)).toBeLessThan(before);

		await page.getByRole('button', { exact: true, name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('mobile: the "Filters" toggle names the region it shows and hides', async ({ page }, testInfo) => {
		test.skip(!isMobileProject(testInfo), 'The toggle only exists below the two-column breakpoint.');

		// react-ui's `<FilterCollapse>` points `aria-controls` at the region; the shared parity case
		// covers the labels, `aria-expanded` and the kept state in all six apps.
		const toggle = page.locator(FILTERS_TOGGLE);
		const regionId = await toggle.getAttribute('aria-controls');

		expect(regionId, 'the toggle names no region').not.toBeNull();
		await expect(page.locator(FILTER_COLLAPSE)).toHaveAttribute('id', regionId ?? '');
		await expect(page.locator(FILTER_COLLAPSE)).toHaveAttribute('hidden');
		await toggle.click();
		await expect(page.locator(FILTER_COLLAPSE)).not.toHaveAttribute('hidden');
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan: on mobile they sit behind the "Filters" toggle, so
		// open it (the helper is a no-op on desktop, where the sidebar is already in the tree).
		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());

		// Scan the SETTLED visual state — emulate reduced motion so axe evaluates final colors, not a
		// transient card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast fail).
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});

describeBooksParity({ id: 'react-rtk', label: 'React RTK' });
