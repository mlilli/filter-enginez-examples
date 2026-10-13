/**
 * End-to-end test for the SvelteKit About page (`/about`) — parity with the React `about.spec.ts`.
 *
 * @remarks
 * The page is the framework-agnostic-reuse thesis: it renders the shared `about-core` narrative + the
 * lifted `fe-about__*` / `fe-fig-*` / `fe-bench__*` classes, with the eight figures ported to `.svelte`
 * and the live benchmark widget over the same React-free engine workload. This spec verifies the route
 * serves and renders: the hero, one figure per section, the benchmark widget, and no serious/critical
 * a11y violations in the settled (reduced-motion) state.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { svelteUrl } from './svelteBase.js';

test.describe('SvelteKit About page', () => {
	test('renders the hero, every figure, and the live benchmark widget', async ({ page }) => {
		await page.goto(svelteUrl('/about'));

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
		await page.goto(svelteUrl('/about'));

		// Wait for a value only the CLIENT can produce, not for markup the server already sent.
		//
		// This is the one vertical that server-renders, and that breaks the obvious wait. `.fe-bench`
		// ships in the SSR HTML, so `toBeVisible()` resolves at ~0 ms — before SvelteKit's client app
		// has started, because `hooks.client.ts` awaits the MSW service-worker registration in its
		// `init` hook first. `AxeBuilder.analyze()` then begins a long `page.evaluate` into an execution
		// context that the starting client tears down underneath it: "Execution context was destroyed,
		// most likely because of a navigation".
		//
		// The corpus line is the honest signal. It renders "10,000 wines" from the server and flips to
		// "<n> results" only after `onMount` has loaded the corpus and `measure()` has run — and
		// `resultCount` is assigned on BOTH the live and reference-fallback paths, so this settles
		// however fast the machine is. It also guarantees what the scan below needs: the benchmark is
		// genuinely finished, not mid-"measuring".
		//
		// The other five verticals are pure SPAs, where `.fe-bench` cannot exist before the client
		// mounts, so their identical wait is sound. The other SvelteKit axe specs (books, wine, real
		// estate) are immune for a different reason: they click and assert first, and Playwright's
		// locator auto-retry rides through the reload. This spec is the only straight line from `goto`
		// to a long `page.evaluate`.
		await expect(page.locator('.fe-bench__corpus')).toContainText('results');

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
