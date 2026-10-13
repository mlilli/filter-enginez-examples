/**
 * End-to-end tests for the shared "filtered to zero" 404 — the routing integration on both stacks.
 *
 * @remarks
 * The 404 markup + behavior are unit-tested per stack (`examples-shared/src/notfound`,
 * `examples-vue/src/pages/NotFoundPage.test.ts`, `examples-vanilla/src/pages/pages.test.ts`); these
 * specs verify the *wiring*: that an unmatched path actually reaches the shared page. Four stacks:
 *
 *   - **React** — two paths reach the same 404: the `notFoundRoute` (`path: '*'`) catch-all for deep
 *     unmatched paths, and the `/:datasetId` resolver rendering `<NotFoundPage>` for an unknown single-
 *     segment id (see `wine.spec.ts` for that id case). This spec exercises the deep-path catch-all.
 *   - **SvelteKit** — a root `+error.svelte` renders for any unmatched route (a genuine 404 status).
 *   - **Vue** — the `/:pathMatch(.*)*` router catch-all renders the shared page client-side (SPA 200,
 *     hydrated + interactive like React).
 *   - **Vanilla** — the hand-written router's `'*'` catch-all, likewise a hydrated SPA 200.
 *
 * All four render the same `fe-notfound__*` markup from `@filter-enginez/ui-styles`.
 */

import { expect, type Page, test } from '@playwright/test';

import { svelteUrl } from './svelteBase.js';
import { vanillaUrl } from './vanillaBase.js';
import { vueUrl } from './vueBase.js';

/**
 * Assert the shared 404 page rendered: the reimagined zero count, the heading, a dead-end chip, and a
 * CTA home. When `interactive`, also toggle a chip and confirm it presses without moving the count off
 * zero — only for hydrated SPA routes (React). SvelteKit serves `+error.svelte` for an unmatched 404
 * SERVER-SIDE only, so its chips are decorative there (the CSS loader still animates, the CTA works).
 */
async function expectNotFoundPage(page: Page, options: { readonly interactive: boolean }): Promise<void> {
	await expect(page.locator('.fe-notfound')).toBeVisible();
	await expect(page.getByText('No records passed this filter')).toBeVisible();
	// The reimagined count is a literal zero.
	await expect(page.locator('.fe-notfound__count')).toHaveText('0');
	await expect(page.locator('.fe-notfound__chip').first()).toBeVisible();
	// The CTA points back to the dataset hub.
	await expect(page.locator('.fe-notfound__cta')).toHaveAttribute('href', '/');

	if (options.interactive) {
		// Toggling a dead-end chip marks it pressed but never moves the count off zero.
		const chip = page.locator('.fe-notfound__chip').first();

		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.fe-notfound__count')).toHaveText('0');
	}
}

test.describe('shared 404 — filtered to zero', () => {
	test('React: a multi-segment unknown path renders the catch-all 404', async ({ page }) => {
		await page.goto('/no/such/route');
		await expectNotFoundPage(page, { interactive: true });
	});

	test('SvelteKit: an unknown route renders +error.svelte as a 404', async ({ page }) => {
		const response = await page.goto(svelteUrl('/no/such/route'));

		expect(response?.status()).toBe(404);
		await expectNotFoundPage(page, { interactive: false });
	});

	test('Vue: an unknown route renders the catch-all 404', async ({ page }) => {
		// The Vue SPA serves index.html for any path (200) and resolves the `/:pathMatch(.*)*` catch-all
		// client-side, so the page is fully hydrated + interactive (like React, unlike SvelteKit's SSR
		// `+error`).
		await page.goto(vueUrl('/no/such/route'));
		await expectNotFoundPage(page, { interactive: true });
	});

	test('Vanilla: an unknown route renders the catch-all 404', async ({ page }) => {
		// Same SPA shape, but the catch-all is the hand-written router's `'*'` route — no framework
		// router involved, and the chips are wired with plain listeners.
		await page.goto(vanillaUrl('/no/such/route'));
		await expectNotFoundPage(page, { interactive: true });
	});
});
