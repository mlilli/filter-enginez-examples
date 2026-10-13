/**
 * End-to-end tests for the SERVER-BACKED books app (`/books-server`).
 *
 * @remarks
 * This route renders the EXACT same `<BooksApp>` as
 * `/books`, so the selectors + the filter flow are identical to `books.spec.ts` — the difference is
 * entirely under the hood: there is no in-browser engine. The corpus + every filter decision come
 * from the Node `@filter-enginez/examples-server` (proxied at `/api`), which Playwright starts as a
 * second `webServer` (see `playwright.config.ts`). If that server isn't up, the route shows its
 * offline screen and the boot wait below fails fast — that's the intended signal.
 *
 * The count-ticking / drawer machinery is the shared `./filterFlow.ts`, whose docblocks carry the
 * `settledCount` + mobile-drawer rationale; only the probe tempo is tuned here (see `SETTLED` below).
 * The boot wait is more generous too, because boot pays a corpus fetch + an initial `POST /api/query`
 * round-trip before the first paint.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	closeFilterPanel,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
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

/**
 * A slower probe than the shared default, because every commit on this route is an HTTP request.
 *
 * @remarks
 * The in-browser routes settle in one animation frame's worth of recompute plus the ~600ms count roll,
 * so a 150ms probe over 20s is ample. Here each mutation round-trips to the Node engine, so the count
 * can sit unchanged for longer than a tight probe pair without being settled — 200ms probes over 25s
 * are the tempo this spec has always used.
 */
const SETTLED: SettledCountOptions = { intervals: [200], timeout: 25_000 };

/** Navigate to the server-backed route and wait for the server boot to swap in the live books page. */
async function bootBooksServerApp(page: Page): Promise<void> {
	await page.goto('/books-server');
	// Boot pays a corpus fetch + an initial POST /api/query before the first paint — give it room.
	await expect(page.getByText(subtitle('Books', 'react-rtk', 'server'))).toBeVisible({ timeout: 40_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('React RTK books app — server-backed filter flow', () => {
	test.beforeEach(async ({ page }) => {
		await bootBooksServerApp(page);
	});

	test('boots from the server and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page, SETTLED)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results (server-computed) and shows an active chip', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		// The narrowed count came back from the Node server via POST /api/query.
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);
	});

	test('clear all resets every active filter back to the full set', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, filterDrawer(page));
		await clickFirstFacetChip(page);
		await closeFilterPanel(page, testInfo, filterDrawer(page));
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBe(before);
	});

	test('the booted server-backed page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		// Include the filter controls in the scan: on mobile they live in the drawer, so open it (the
		// helper is a no-op on desktop, where the sidebar is already in the tree).
		await openFilterPanel(page, testInfo, filterDrawer(page));
		// Scan the SETTLED visual state — reduced motion so axe evaluates final colors, not a transient
		// card fade-in frame (opacity < 1 blends muted text toward the bg → false contrast fail).
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
