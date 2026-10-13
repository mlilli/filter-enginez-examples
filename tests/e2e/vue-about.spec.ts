/**
 * End-to-end test for the Vue About page (`/about`) — parity with the SvelteKit `svelte-about.spec.ts`
 * and the React `about.spec.ts`.
 *
 * @remarks
 * The page is the framework-agnostic-reuse thesis: it renders the shared `about-core` narrative + the
 * lifted `fe-about__*` / `fe-fig-*` / `fe-bench__*` classes, with the eight figures ported to `.vue`
 * and the live benchmark widget over the same framework-free engine workload. This spec verifies the
 * route serves and renders: the hero, one figure per section, the benchmark widget, and no
 * serious/critical a11y violations in the settled (reduced-motion) state.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { vueUrl } from './vueBase.js';

test.describe('Vue About page', () => {
	test('renders the hero, every figure, and the live benchmark widget', async ({ page }) => {
		await page.goto(vueUrl('/about'));

		await expect(page.getByRole('heading', { level: 1, name: 'How the engine works' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Beyond filtering' })).toBeVisible();

		// One animated figure (role=img) per algorithm band — the eight-section narrative.
		await expect(page.locator('.fe-about__figure [role="img"]')).toHaveCount(8);

		// The live benchmark widget mounts (its three acceleration toggles + a timing headline).
		await expect(page.locator('.fe-bench')).toBeVisible();
		await expect(page.getByRole('switch')).toHaveCount(3);
		await expect(page.getByText(/faster than naive scan/u)).toBeVisible();
	});

	test('has no serious or critical accessibility violations', async ({ page }) => {
		await page.goto(vueUrl('/about'));
		await expect(page.locator('.fe-bench')).toBeVisible();
		// Scan the settled visual state — reduced motion so axe evaluates final colors, not a transient
		// figure keyframe or the benchmark's "measuring" opacity dip.
		await page.emulateMedia({ reducedMotion: 'reduce' });

		const { violations } = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		const summary = blocking.map((v) => `${v.id} (${v.impact ?? 'n/a'}, ${v.nodes.length} node(s))`).join('\n');

		expect(blocking, `axe found blocking a11y violations:\n${summary}`).toEqual([]);
	});
});
