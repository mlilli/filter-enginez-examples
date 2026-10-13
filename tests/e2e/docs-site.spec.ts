/**
 * End-to-end smoke for the standalone documentation site (`@filter-enginez/examples-docs`, :5180).
 *
 * @remarks
 * The site is the shared `docsRoute` mounted as its own Vite app, so this is a thin smoke rather than
 * a re-test of the docs content (that lives in the shared component tests): the root redirect resolves
 * to the docs home, a rule page renders with a working cross-link, and the in-browser playground runs
 * the real engine. Absolute URLs via `docsUrl(...)`, since Playwright's `baseURL` points at the React
 * app.
 */

import { expect, test } from '@playwright/test';

import { docsUrl } from './docsBase.js';

test.describe('standalone documentation site', () => {
	test('/ redirects to the docs home and shows the rule-catalog nav', async ({ page }) => {
		await page.goto(docsUrl('/'));

		await expect(page).toHaveURL(/\/docs$/);
		// The sidebar nav (`<DocsLayout>`) carries a "Filter rules" heading in every docs view.
		await expect(page.getByText('Filter rules').first()).toBeVisible();
	});

	test('a rule page renders the class name + a resolving "See also" cross-link', async ({ page }) => {
		await page.goto(docsUrl('/docs/rules/in-set'));

		await expect(page.getByRole('heading', { name: 'InSetRule' })).toBeVisible();

		// The cross-link section (added in the polish pass) links to a related rule — clicking one lands
		// on another rule page, proving both the content and the standalone router resolve internal links.
		const related = page.locator('.fe-doc-see-also a').first();

		await expect(related).toBeVisible();
		await related.click();
		await expect(page).toHaveURL(/\/docs\/rules\/[a-z-]+$/);
	});

	test('the in-browser playground runs the real engine and reports a match count', async ({ page }) => {
		await page.goto(docsUrl('/docs/playground'));

		await page.getByRole('button', { name: /Run/ }).click();

		// The default config filters a real dataset to a non-empty set — the output reports the count.
		await expect(page.locator('.fe-pg__output')).toContainText(/\d/, { timeout: 15_000 });
	});
});
