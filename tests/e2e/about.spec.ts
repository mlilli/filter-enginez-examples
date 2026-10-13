/**
 * End-to-end tests for the RTK app's `/about` page — the "How the engine works" showcase.
 *
 * @remarks
 * Covers the three things that matter for this page: the
 * four hero algorithm illustrations render (each a `role="img"` SVG figure), the live benchmark
 * widget's acceleration toggles actually flip their `aria-checked` state and the timing readout shows
 * a duration, and the page is reachable from the landing hub. A final axe scan runs against the
 * SETTLED, reduced-motion state — mirroring the dataset specs — so the illustrations are evaluated as
 * static frames (the `role="img"` wrappers keep their inner SVG captions out of contrast scoring, and
 * the HTML captions use AA-compliant grays).
 *
 * The page builds its own engine inside the widget (no dataset boot), so no corpus-load wait is
 * needed for the structural assertions; the widget's live measurement is best-effort and never
 * asserted numerically (in-browser timing is environment-dependent by design).
 *
 * **Selectors:**
 *   - `.fe-fig-roaring` / `.fe-fig-excl` / `.fe-fig-memo` / `.fe-fig-rtree` — the four figures.
 *   - `role="switch"` buttons named for each layer (`roaring` / `exclusionGraph` / `memoization`).
 *   - `.fe-bench__number` — the phosphor timing readout.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const HERO = { name: 'How the engine works' };

test.describe('About page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/about');
		await expect(page.getByRole('heading', HERO)).toBeVisible({ timeout: 30_000 });
	});

	test('renders all eight algorithm illustrations across both acts', async ({ page }) => {
		// Act one — the acceleration layers.
		await expect(page.locator('.fe-fig-roaring')).toBeVisible();
		await expect(page.locator('.fe-fig-excl')).toBeVisible();
		await expect(page.locator('.fe-fig-memo')).toBeVisible();
		await expect(page.locator('.fe-fig-rtree')).toBeVisible();
		// Act two — beyond filtering (scroll to bring the lazy in-view figures into the viewport).
		await expect(page.getByRole('heading', { name: 'Beyond filtering' })).toBeVisible();
		await page.locator('.fe-fig-text').scrollIntoViewIfNeeded();
		await expect(page.locator('.fe-fig-bayes')).toBeVisible();
		await expect(page.locator('.fe-fig-sim')).toBeVisible();
		await expect(page.locator('.fe-fig-bloom')).toBeVisible();
		await expect(page.locator('.fe-fig-text')).toBeVisible();
	});

	test('the benchmark widget flips an acceleration layer and shows a timing', async ({ page }) => {
		const roaring = page.getByRole('switch', { name: /roaring/i });

		await expect(roaring).toBeVisible();
		await expect(roaring).toHaveAttribute('aria-checked', 'true');
		await roaring.click();
		await expect(roaring).toHaveAttribute('aria-checked', 'false');

		// The timing readout always shows a duration (live or reference), never empty.
		await expect(page.locator('.fe-bench__number')).toContainText('ms');
	});

	test('is reachable from the landing hub', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: /how the engine works/i }).click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.getByRole('heading', HERO)).toBeVisible();
	});

	test('has no serious accessibility violations (settled, reduced motion)', async ({ page }) => {
		// Scan the settled visual state with motion disabled so the illustrations are evaluated as their
		// static frames, not a transient animation frame.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(page.locator('.fe-bench__status')).toBeVisible();

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
		const summary = blocking.map((violation) => `${violation.id} (${violation.impact ?? 'n/a'}, ${violation.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
