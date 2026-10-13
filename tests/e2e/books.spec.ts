/**
 * End-to-end tests for the RTK books app — the critical filter flow.
 *
 * @remarks
 * The books sibling of `wine.spec.ts`: boot the (bundled,
 * main-thread) corpus, narrow with a filter, watch the result count re-compute through the
 * redux-bridge mirror, then clear. Two deliberate differences from the wine spec:
 *
 *   - **No undo/redo.** The books shell omits the devtools panel + undo/redo header controls (it's
 *     the leaner second vertical), so there's no keyboard time-travel test here.
 *   - **Typeahead search.** Books surfaces the debounced `<SearchInput>` path — a dedicated test
 *     types into the description search and asserts the (debounced) engine commit lands as an active
 *     "Description" filter chip. It asserts on the deterministic chip, not a corpus-dependent count,
 *     since the procedural descriptions carry no guaranteed vocabulary.
 *
 * The count-ticking + mobile-drawer machinery is shared: it lives in `./filterFlow.ts`, whose docblocks
 * carry the `settledCount` / drawer rationale. Books boots on the main thread, so its boot wait is
 * shorter than wine's worker-streamed 130k corpus — but still generous to cover the bitmap-accel init.
 *
 * **Selectors (mirror the wine app; books drawer is `dialog[name="Book filters"]`):**
 *   - `subtitle('Books', 'react-rtk')` — the header subtitle, present once `<DatasetRoute>` swaps in
 *     `<BooksApp>`. Derived from the vertical registry rather than spelled out; see `./subtitles.ts`.
 *   - `.fe-result-count__number` / `.fe-chip` / `.fe-filter-chip` / "Clear all" — shared react-ui.
 *   - `getByLabel('Search descriptions')` — the description `<SearchInput>` (its `aria-label`).
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	closeFilterPanel,
	isMobileProject,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';

/**
 * What "open" means in this vertical: react-ui renders the mobile filter panel as an off-canvas
 * `dialog` named for the dataset, so the drawer itself is the readiness signal — and, once dismissed,
 * the absence signal. (The non-React verticals expand an inline collapse and wait for a chip instead.)
 */
function filterDrawer(page: Page): Locator {
	return page.getByRole('dialog', { name: 'Book filters' });
}

/** Navigate to the books route and wait for the corpus boot to swap in the live books page. */
async function bootBooksApp(page: Page): Promise<void> {
	// `/` is the dataset landing hub; the books app lives at `/books`.
	await page.goto('/books');
	// Main-thread boot over the bundled tier (+ bitmap-accel init) behind the BrainSynapse loader.
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

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		expect(await settledCount(page)).toBeLessThan(before);
	});

	test('typeahead description search commits a filter chip after debounce', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, filterDrawer(page));
		// A single `fill` fires one input event → the hook's trailing-edge debounce commits ~250ms
		// later (or immediately on the blur that closing the drawer triggers on mobile).
		await page.getByLabel('Search descriptions').fill('adventure');
		await closeFilterPanel(page, testInfo, filterDrawer(page));

		// The active "Description" chip is the deterministic proof the debounced query reached the
		// engine — asserted instead of a count delta, since the procedural descriptions carry no
		// guaranteed vocabulary to narrow against.
		await expect(page.locator(ACTIVE_CHIP).filter({ hasText: 'Description' })).toBeVisible();

		// Clearing removes it again.
		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
	});

	test('clear all resets every active filter', async ({ page }, testInfo) => {
		const before = await settledCount(page);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page)).toBe(before);
	});

	test('mobile: the filter drawer opens from the trigger and closes via its × button', async ({ page }, testInfo) => {
		test.skip(!isMobileProject(testInfo), 'The off-canvas drawer only exists below the lg breakpoint.');

		const drawer = page.getByRole('dialog', { name: 'Book filters' });

		await expect(drawer).toHaveCount(0);
		await page.getByRole('button', { name: 'Filters' }).click();
		await expect(drawer).toBeVisible();

		await page.getByRole('button', { name: 'Close filters' }).click();
		await expect(drawer).toHaveCount(0);
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan: on mobile they live in the drawer, so open it (the
		// helper is a no-op on desktop, where the sidebar is already in the tree).
		await openFilterPanel(page, testInfo, filterDrawer(page));

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
