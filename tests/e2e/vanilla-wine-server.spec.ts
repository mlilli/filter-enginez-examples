/**
 * `/wine-server` on the framework-less app — the filter engine reached over HTTP.
 *
 * @remarks
 * One of two verticals serving a server-filtered wine route, and the one that does it across a process
 * boundary.
 *
 * ## Modelled on `svelte-wine-server.spec.ts`, NOT on the shared wine suite
 *
 * `wineFlow.ts` asserts positively that the footer reads `full corpus`, because on the worker tier a
 * silent fallback to the bundled 10k is a real failure mode. This route serves the
 * committed 10k **by design** — `examples-server`'s dataset registry imports `wines` from
 * `@filter-enginez/mock-data/wine`, the default tier — so pointing the shared suite here would fail
 * correctly against a route behaving exactly as designed. `svelte-wine-server.spec.ts` stands outside
 * the shared suite for the same reason: a different tier.
 *
 * ## What this vertical proves that SvelteKit's does not
 *
 * SvelteKit runs the isomorphic core **in its own Node tier**, in-process, and ships a zero-JS SSR
 * fallback — so its spec's second half drives the route with `javaScriptEnabled: false`. **None of
 * that is reproducible here and none of it is attempted**: vanilla is a static SPA with no server
 * tier, and its `/wine-server` talks to the standalone `examples-server` process through a Vite `/api`
 * proxy. With JavaScript off this route renders nothing at all, correctly and by construction.
 *
 * What the two specs jointly establish is the interesting claim: one engine, two server-tier
 * arrangements, identical filtering behavior through both.
 *
 * ## The offline state is not asserted here
 *
 * `playwright.config.ts` boots `examples-server` as its first `webServer`, so the API is always up
 * during this suite — which is right, since the route's job is to filter. The unreachable-server path
 * is the one a developer hits (`pnpm dev` does not start `serve:api`), and it is covered by the
 * route's own named offline state rather than by a spec that would have to tear down a shared server
 * every other spec depends on.
 *
 * @packageDocumentation
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { DATASET_PARAM } from '../../packages/examples-shared/src/compare/links.js';
import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	FACET_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { vanillaUrl } from './vanillaBase.js';

/**
 * A slower probe than the shared default, because every commit here is a network round trip.
 *
 * @remarks
 * The same tempo `svelte-wine-server.spec.ts` uses, and for the same reason — the count can sit
 * unchanged for longer than a tight probe pair without being settled. It is a touch more true here:
 * SvelteKit answers from its own process, while this crosses the Vite proxy to a second one.
 */
const SETTLED: SettledCountOptions = { intervals: [200], timeout: 25_000 };

/** Navigate to the server-backed route and wait for the engine to swap in the live page. */
async function bootWineServerApp(page: Page): Promise<void> {
	await page.goto(vanillaUrl('/wine-server'));
	// The boot screen paints first; the live view appears once the corpus fetch and the initial
	// `/query` round-trip settle. The header names the tier, so this doubles as proof the route did
	// not quietly fall back to the in-browser engine.
	await expect(page.getByText(subtitle('Wine', 'vanilla', 'server'))).toBeVisible({ timeout: 60_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('vanilla /wine-server — the engine across a process boundary', () => {
	test.beforeEach(async ({ page }) => {
		await bootWineServerApp(page);
	});

	test('boots the engine over HTTP and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page, SETTLED)).toBeGreaterThan(0);
	});

	test('reports the committed tier in its footer, not the worker route’s full corpus', async ({ page }) => {
		// **Asserted POSITIVELY and specifically**, for the same reason the worker route asserts the
		// opposite string: the two wine routes report different counts, and a footer that said nothing
		// would leave a visitor comparing them with no way to know why. `getByRole('contentinfo')`
		// rather than `locator('footer')` — the devtools surface renders its own `<footer>`, so the bare
		// tag selector resolves to two elements and dies on strict mode.
		await expect(page.getByRole('contentinfo')).toContainText('committed 10k tier');
	});

	test('its Compare button offers the wine-server comparison, not the browser-tier one', async ({ page }) => {
		// Both wine routes render the SAME shell, so the target is threaded in by the route. A shell that
		// hardcoded the browser-tier target would send this route's visitors to the six-way wine
		// comparison instead of the two-row server one it exists to demonstrate, and nothing would fail: a
		// wrong-but-valid target renders identically to a right one.
		//
		// This is the COMPOSITION half, and it is the half unit tests cannot supply: a unit case on
		// `/wine` stays green when the shell is hardcoded to `'wine'`, because `/wine`'s correct answer
		// IS `'wine'`. Only a route whose answer differs can tell a
		// threaded value from a coincidence, and only an e2e can tell that the ROUTE passed it.
		const href = await page.locator('a.fe-compare-link').getAttribute('href');

		expect(href, 'the wine-server header lost its Compare button').not.toBeNull();
		expect(new URL(href ?? '').searchParams.get(DATASET_PARAM)).toBe('wine-server');
	});

	test('toggling an InSet filter narrows the results server-side and writes ?f=', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		// The narrowed count was computed in a different process and came back over the proxy.
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);
		// The engine → URL sync writes `?f=` over the async engine too — `startEngineUrlSync`'s async
		// arm. Without it no `?f` is written at all, and the failure surfaces only as a console error
		// inside a debounced `setTimeout`.
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();
	});

	test('clear all resets every active filter back to the full set', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBe(before);
	});

	test('the booted page has no serious or critical accessibility violations', async ({ page }, testInfo) => {
		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
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
