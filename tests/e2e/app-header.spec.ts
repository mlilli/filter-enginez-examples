/**
 * The header brand every page of every app carries — its links home, to every demo, and back to the
 * app's own hub.
 *
 * @remarks
 * Six apps render one header contract in five framework idioms (`<AppHeaderBrand>` in React, a Svelte,
 * a Vue and an Angular component, and vanilla's `shell/appHeader.ts`), on every page: the hub, the
 * dataset routes, the 404, plain React's `/lab`, and the documentation. Each implementation is
 * unit-tested over its own markup; this file asks the browser what only a served page can answer —
 * that the brand is actually on each kind of page, that its cross-origin links resolve to the local
 * landing site in development, that the "All demos" link follows the `lg` breakpoint, and that the
 * hub link is a working in-app link.
 *
 * ### The contract, as asserted
 *
 * - A `<nav>` named `BRAND_NAV_LABEL`.
 * - Inside it, the logomark link named `SITE_HOME_LABEL`, pointing at the landing site's home page.
 * - "All demos", pointing at the landing page's list of demos: visible on the desktop project, and in
 *   the DOM but hidden on the phone project (412px, under the 1024px breakpoint) — where the home link
 *   stays visible, so the way home never depends on the viewport.
 * - In the six apps, the subtitle's app name is a link named `<App> dataset hub` to `/`, current
 *   (`aria-current="page"`) on the hub and on no other page. The documentation site belongs to no app
 *   and has no such link.
 *
 * ### Everything is derived
 *
 * The labels come from `app-header/core.ts`, the apps and their origins from the registry, so a
 * wording change or a seventh app moves this file with it rather than failing it. Importing `core.ts`
 * by relative path keeps the e2e program small: it reaches only `compare/origins.ts` and the registry,
 * neither of which imports anything outside the package (see `./subtitles.ts` for why the path is
 * relative at all).
 *
 * ### The landing site's own pages
 *
 * The site's pages carry the same logomark link, but on their own origin, so it is a root-relative
 * `/`. One check per page, with no JavaScript needed — the link is in the served HTML.
 *
 * @packageDocumentation
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import {
	ALL_DEMOS_LABEL,
	APP_HUB_PATH,
	appHubLabel,
	BRAND_NAV_LABEL,
	SITE_HOME_LABEL,
} from '../../packages/examples-shared/src/app-header/core.js';
import {
	COMPARE_PATH,
	DEMOS_SECTION_ID,
	HOW_IT_WORKS_PATH,
	type VerticalId,
	VERTICALS,
} from '../../packages/examples-shared/src/verticals/verticals.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import { docsUrl } from './docsBase.js';
import { isMobileProject, openFilterPanel } from './filterFlow.js';
import { reactPlainUrl } from './reactPlainBase.js';
import { siteUrl } from './siteBase.js';
import { subtitle } from './subtitles.js';

/** Where the logomark leads from any app in development: the local landing site's home page. */
const SITE_HOME_URL = siteUrl('/');

/** Where "All demos" leads from any app in development. */
const ALL_DEMOS_URL = siteUrl(`/#${DEMOS_SECTION_ID}`);

/** A path no app serves, for the 404. Single-segment, the shape a mistyped dataset link takes. */
const UNKNOWN_PATH = '/no-such-page';

/**
 * How long a page without a corpus may take to paint its header.
 *
 * @remarks
 * Above the config's 20s assertion default because the first request to `ng serve` runs the AOT
 * template compile, and plain React's `/lab` boots a corpus before its chrome paints.
 */
const HEADER_PAINT_TIMEOUT_MS = 45_000;

/**
 * Assert the header brand on the current page, and return it for the hub-link checks.
 *
 * @remarks
 * Every link is resolved by role and accessible name inside the named `<nav>`, so a second home link
 * elsewhere on the page (a 404's call to action, a docs sidebar) cannot satisfy it. "All demos" is
 * resolved with `includeHidden`, because on the phone project it is `display: none` and a default role
 * query would not find it at all — a hidden-check would then pass over a link that was never rendered.
 * `toBeAttached()` first rules that out.
 *
 * @param page - The page under test.
 * @param testInfo - The per-test info, for the project's viewport.
 * @returns The brand `<nav>`.
 */
async function expectHeaderBrand(page: Page, testInfo: TestInfo): Promise<Locator> {
	const brand = page.getByRole('navigation', { exact: true, name: BRAND_NAV_LABEL });

	await expect(brand, 'the page carries no header brand').toBeVisible({ timeout: HEADER_PAINT_TIMEOUT_MS });

	const home = brand.getByRole('link', { exact: true, name: SITE_HOME_LABEL });

	await expect(home, 'the way home must not depend on the viewport').toBeVisible();
	await expect(home).toHaveAttribute('href', SITE_HOME_URL);

	const allDemos = brand.getByRole('link', { exact: true, includeHidden: true, name: ALL_DEMOS_LABEL });

	await expect(allDemos).toBeAttached();
	await expect(allDemos).toHaveAttribute('href', ALL_DEMOS_URL);
	// Visible on the desktop project, hidden below the lg breakpoint on the phone one.
	await expect(allDemos).toBeVisible({ visible: !isMobileProject(testInfo) });

	return brand;
}

/**
 * Assert the subtitle's link back to the app's own hub.
 *
 * @remarks
 * `aria-current` is polled rather than asserted per branch: after a client-side navigation the router
 * updates it a frame after the URL, and one poll for "the value this page should have" covers both the
 * hub (`page`) and every other page (absent) without an assertion inside a conditional.
 *
 * @param brand - The brand `<nav>`, from {@link expectHeaderBrand}.
 * @param verticalId - The app whose hub the link opens.
 * @param isCurrent - Whether the page under test is the hub itself.
 */
async function expectHubLink(brand: Locator, verticalId: VerticalId, isCurrent: boolean): Promise<void> {
	const hubLink = brand.getByRole('link', { exact: true, name: appHubLabel(verticalId) });

	await expect(hubLink).toHaveAttribute('href', APP_HUB_PATH);
	await expect
		.poll(async () => hubLink.getAttribute('aria-current'), {
			message: isCurrent ? 'the hub link should be current on the hub' : 'the hub link should be current only on the hub',
		})
		.toBe(isCurrent ? 'page' : null);
}

test.describe('the header brand — every app', () => {
	for (const descriptor of VERTICALS) {
		const { devOrigin, id, name } = descriptor;
		const arrival = BOOKS_ARRIVAL[id];

		test(`${name}: the hub carries the brand, its hub link current, with no serious a11y violations`, async ({ page }, testInfo) => {
			// Before the navigation, so the header is scanned in its settled, motion-free state.
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto(`${devOrigin}${APP_HUB_PATH}`);

			await expectHubLink(await expectHeaderBrand(page, testInfo), id, true);

			const { violations } = await new AxeBuilder({ page })
				.include('.fe-books-app__header')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
				.analyze();
			const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
			const summary = blocking.map((violation) => `${violation.id} (${violation.impact ?? 'n/a'}, ${violation.nodes.length} node(s))`).join('\n');

			expect(blocking, `axe found blocking a11y violations in the header:\n${summary}`).toEqual([]);
		});

		test(`${name}: the 404 carries the brand, its hub link not current`, async ({ page }, testInfo) => {
			await page.goto(`${devOrigin}${UNKNOWN_PATH}`);
			await expect(page.locator('.fe-notfound')).toBeVisible({ timeout: HEADER_PAINT_TIMEOUT_MS });

			await expectHubLink(await expectHeaderBrand(page, testInfo), id, false);
		});

		test(`${name}: /books carries the brand, and its hub link returns to the hub`, async ({ page }, testInfo) => {
			await page.goto(`${devOrigin}/books`);
			// The route's own boot signal — the whole subtitle, of which the hub link is the middle.
			await expect(page.getByText(subtitle('Books', id, arrival.tier))).toBeVisible({ timeout: arrival.bootTimeoutMs });

			const brand = await expectHeaderBrand(page, testInfo);

			await expectHubLink(brand, id, false);
			await brand.getByRole('link', { exact: true, name: appHubLabel(id) }).click();

			// The hub link is an in-app link — client-side in five of the six — so the URL is waited on
			// rather than read, and the hub's own header must then mark the link current.
			await page.waitForURL(`${devOrigin}${APP_HUB_PATH}`);
			await expectHubLink(await expectHeaderBrand(page, testInfo), id, true);
		});
	}

	test('React plain: /lab carries the brand, its hub link not current', async ({ page }, testInfo) => {
		await page.goto(reactPlainUrl('/lab'));

		await expectHubLink(await expectHeaderBrand(page, testInfo), 'react-plain', false);
	});
});

test.describe('the header brand — the documentation site', () => {
	test('carries the brand, with no hub link — it belongs to no app', async ({ page }, testInfo) => {
		await page.goto(docsUrl('/'));

		const brand = await expectHeaderBrand(page, testInfo);

		// Matched on the label's tail rather than any one app's label: no app's hub link belongs here.
		await expect(brand.getByRole('link', { includeHidden: true, name: / dataset hub$/u })).toHaveCount(0);
	});
});

test.describe('the header brand — the landing site', () => {
	// The link is in the served HTML of all three pages; no script is involved in it.
	test.use({ javaScriptEnabled: false });

	for (const path of ['/', HOW_IT_WORKS_PATH, COMPARE_PATH]) {
		test(`${path}: the logomark links to the home page on its own origin`, async ({ page }) => {
			await page.goto(siteUrl(path));

			await expect(page.getByRole('link', { exact: true, name: SITE_HOME_LABEL })).toHaveAttribute('href', '/');
		});
	}
});

test.describe('text entry on a phone', () => {
	test('a dataset route\'s search field computes at least 16px, so focusing it never zooms the page', async ({ page }, testInfo) => {
		// The rule this guards (`ui-styles`, "Text entry never zooms the page") applies under
		// `(pointer: coarse)` or below 1024px — the phone project — and is pinned as CSS text by
		// `tests/tooling/touchInputZoom.test.ts`. What only a browser can say is that it WINS the cascade
		// against the panel's own field size, in a real app's stylesheet order.
		test.skip(!isMobileProject(testInfo), 'the floor applies to touch and sub-lg viewports; the desktop project is neither');

		await page.goto('/books');
		await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({
			timeout: BOOKS_ARRIVAL['react-rtk'].bootTimeoutMs,
		});
		// The field itself is the readiness signal: it is inside the collapse, so it is visible exactly
		// when the collapse is open, and it is the element measured.
		const searchField = page.getByLabel('Search descriptions');

		await openFilterPanel(page, testInfo, searchField);

		const fontSizePx = await searchField.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

		expect(fontSizePx, 'a text field under 16px makes iOS Safari zoom the page on focus').toBeGreaterThanOrEqual(16);
	});
});
