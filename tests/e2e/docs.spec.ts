/**
 * End-to-end tests for the RTK app's `/docs` documentation section.
 *
 * @remarks
 * Covers the docs shell + navigation, that a rule page and
 * an algorithm page render their content + figure, that the in-browser playground actually runs the
 * engine and reports a count, and that a content page has no serious accessibility violations under
 * reduced motion (the rule figures are evaluated as their static frames; the `role="img"` wrappers
 * keep inner SVG captions out of contrast scoring, and the HTML text uses AA-compliant grays).
 *
 * **Selectors:** `.fe-docs__nav-link` (sidebar), `.fe-doc-title` (page H1), `.fe-rulefig` /
 * `.fe-fig` (figures), `.fe-pg__run` / `.fe-pg__count` (playground).
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Docs site', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/docs');
		await expect(page.getByRole('heading', { name: 'Filter EngineZ' })).toBeVisible({ timeout: 30_000 });
	});

	test('navigates from the sidebar to a rule page', async ({ page }, testInfo) => {
		// Below the lg breakpoint the sidebar is an off-canvas drawer — open it first.
		if (testInfo.project.name === 'mobile-chrome') {
			await page.getByRole('button', { name: 'Menu' }).click();
		}
		await page.getByRole('link', { name: 'InSetRule' }).first().click();
		await expect(page).toHaveURL(/\/docs\/rules\/in-set$/);
		await expect(page.getByRole('heading', { name: 'InSetRule' })).toBeVisible();
		await expect(page.locator('.fe-rulefig')).toBeVisible();
	});

	test('renders an algorithm page with its illustration', async ({ page }) => {
		await page.goto('/docs/algorithms/roaring-bitmaps');
		await expect(page.getByRole('heading', { name: 'Roaring bitmaps' })).toBeVisible();
		await expect(page.locator('.fe-fig-roaring')).toBeVisible();
	});

	test('the playground runs the engine and reports a count', async ({ page }) => {
		await page.goto('/docs/playground');
		await page.getByRole('button', { name: /run/i }).click();
		await expect(page.locator('.fe-pg__count')).toContainText('match', { timeout: 30_000 });
		await expect(page.locator('.fe-pg__count-num')).not.toBeEmpty();
	});

	test('a rule page has no serious accessibility violations (reduced motion)', async ({ page }) => {
		await page.goto('/docs/rules/range');
		await expect(page.getByRole('heading', { name: 'RangeRule' })).toBeVisible();
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
		const summary = blocking.map((violation) => `${violation.id} (${violation.impact ?? 'n/a'}, ${violation.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
