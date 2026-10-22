/**
 * End-to-end smoke for the standalone documentation site (`@filter-enginez/examples-docs`, :24616).
 *
 * @remarks
 * The site is the shared documentation route mounted at its own root, so this is a thin smoke rather
 * than a re-test of the docs content (that lives in the shared component tests): the root is the docs
 * home, a rule page renders with a cross-link that stays on the site's root paths, the in-browser
 * playground runs the real engine, and any other path is the shared not-found page. Absolute URLs via
 * `docsUrl(...)`, since Playwright's `baseURL` points at the React app. (The deployed host's `/docs`
 * redirects and its 404 status are not the dev server's: `tests/tooling/cloudflareDeploy.test.ts` and
 * `tests/tooling/routeShells.test.ts` cover them.)
 */

import { expect, test } from '@playwright/test';

import { docsUrl } from './docsBase.js';

test.describe('standalone documentation site', () => {
	test('/ is the docs home and shows the rule-catalog nav', async ({ page }) => {
		await page.goto(docsUrl('/'));

		await expect(page).toHaveURL(docsUrl('/'));
		await expect(page.getByRole('heading', { level: 1, name: 'Filter EngineZ' })).toBeVisible();
		// The sidebar nav (`<DocsLayout>`) carries a "Filter rules" heading in every docs view.
		await expect(page.getByText('Filter rules').first()).toBeVisible();
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://docs.filterenginez.com/');
	});

	test('a rule page renders the class name + a resolving "See also" cross-link at the site’s root', async ({ page }) => {
		await page.goto(docsUrl('/rules/in-set'));

		await expect(page.getByRole('heading', { name: 'InSetRule' })).toBeVisible();

		// The cross-link section links to a related rule — clicking one lands on another rule page,
		// proving both the content and the standalone router resolve internal links, without `/docs`.
		const related = page.locator('.fe-doc-see-also a').first();

		await expect(related).toBeVisible();
		await related.click();
		await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:24616\/rules\/[a-z-]+$/u);
	});

	test('the in-browser playground runs the real engine and reports a match count', async ({ page }) => {
		await page.goto(docsUrl('/playground'));

		await page.getByRole('button', { name: /Run/ }).click();

		// The default config filters a real dataset to a non-empty set — the output reports the count.
		await expect(page.locator('.fe-pg__output')).toContainText(/\d/, { timeout: 15_000 });
	});

	test('an unknown path renders the shared not-found page', async ({ page }) => {
		await page.goto(docsUrl('/this-page-does-not-exist'));

		await expect(page.locator('.fe-notfound')).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	});
});
