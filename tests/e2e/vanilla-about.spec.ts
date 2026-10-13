/**
 * End-to-end test for the framework-less About page (`/about`) — parity with `about.spec.ts`,
 * `svelte-about.spec.ts`, and `vue-about.spec.ts`.
 *
 * @remarks
 * This is the fourth rendering of one shared narrative: the section copy and figure ids come from
 * `about-core`, the classes from `ui-styles`, and here the eight figures are hand-built SVG with no
 * framework at all. The assertions are deliberately the same ones the other verticals use, so the
 * suite proves the pages are equivalent rather than merely similar.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { vanillaUrl } from './vanillaBase.js';

test.describe('vanilla About page', () => {
	test('renders the hero, every figure, and the live benchmark widget', async ({ page }) => {
		await page.goto(vanillaUrl('/about'));

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
		await page.goto(vanillaUrl('/about'));
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
