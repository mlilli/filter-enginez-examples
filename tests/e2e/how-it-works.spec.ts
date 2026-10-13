/**
 * End-to-end tests for the "How the engine works" page — `/how-it-works` on the landing site (:5181).
 *
 * @remarks
 * One page, rendered at build time and enhanced in the browser, so the spec checks both halves:
 *
 *   - **Without JavaScript** the whole narrative is in the HTML — all eight bands' titles, the act-two
 *     divider, the table of contents and the benchmark's reference numbers.
 *   - **With JavaScript** every band gets its animated figure (`role="img"`), the live benchmark widget
 *     replaces the reference sentence and its acceleration switches flip, and the demo links resolve to
 *     the local plain-React app's `/lab`.
 *   - **It is reachable** from the landing page and from every demo app's landing hub, whose "How the
 *     engine works" link resolves to this server in development.
 *   - **axe** finds nothing serious, scanned in the settled, reduced-motion state.
 *
 * The widget's live measurement is best-effort and never asserted numerically — in-browser timing is
 * environment-dependent by design, which is why the widget falls back to reference numbers.
 *
 * **Selectors:** `.fe-fig-*` (the eight figures), `.fe-about__toc` (the table of contents),
 * `role="switch"` (the three acceleration layers), `.fe-bench__number` (the timing readout),
 * `.fe-about__demo-link` (the links into `/lab`).
 */

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { angularUrl } from './angularBase.js';
import { reactPlainUrl } from './reactPlainBase.js';
import { siteUrl } from './siteBase.js';
import { svelteUrl } from './svelteBase.js';
import { vanillaUrl } from './vanillaBase.js';
import { vueUrl } from './vueBase.js';

/** The page's address on the landing site's dev server. */
const PAGE_URL = siteUrl('/how-it-works');

/** The page's `<h1>`. */
const HERO = { level: 1, name: 'How the engine works' } as const;

/** The eight bands' titles, in page order. */
const BAND_TITLES = [
	'Roaring bitmaps',
	'Mutual-exclusion graph',
	'Memoized simulation',
	'R-tree spatial index',
	'Bayesian suggestions',
	'MinHash + LSH similarity',
	'Bloom membership',
	'Inverted text index',
] as const;

/** Each band's figure class, in page order. */
const FIGURE_CLASSES = [
	'fe-fig-roaring',
	'fe-fig-excl',
	'fe-fig-memo',
	'fe-fig-rtree',
	'fe-fig-bayes',
	'fe-fig-sim',
	'fe-fig-bloom',
	'fe-fig-text',
] as const;

test.describe('how-it-works · without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('serves the whole narrative as HTML', async ({ page }) => {
		await page.goto(PAGE_URL);

		await expect(page.getByRole('heading', HERO)).toBeVisible();
		for (const title of BAND_TITLES) {
			await expect(page.getByRole('heading', { level: 2, name: title })).toBeAttached();
		}
		await expect(page.getByRole('heading', { name: 'Beyond filtering' })).toBeAttached();
		await expect(page.locator('.fe-about__toc a')).toHaveCount(BAND_TITLES.length + 1);
		// The benchmark's static frame: the committed reference numbers, as a sentence.
		await expect(page.locator('.fe-about__bench-reference')).toContainText('faster');
		// No script ran, so no figure was mounted and no widget replaced the sentence.
		await expect(page.locator('.fe-fig')).toHaveCount(0);
		await expect(page.locator('.fe-bench')).toHaveCount(0);
	});
});

test.describe('how-it-works · enhanced', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(PAGE_URL);
		await expect(page.getByRole('heading', HERO)).toBeVisible({ timeout: 30_000 });
	});

	test('mounts all eight algorithm figures across both acts', async ({ page }) => {
		await expect(page.locator('.fe-about__figure [role="img"]')).toHaveCount(FIGURE_CLASSES.length);
		for (const figureClass of FIGURE_CLASSES) {
			// Scrolled into view in turn, so each figure is checked where a reader would meet it.
			const figure = page.locator(`.${figureClass}`);

			await figure.scrollIntoViewIfNeeded();
			await expect(figure).toBeVisible();
		}
	});

	test('the benchmark widget replaces the reference sentence, flips a layer and shows a timing', async ({ page }) => {
		await expect(page.locator('.fe-bench')).toBeVisible();
		await expect(page.locator('.fe-about__bench-reference')).toHaveCount(0);
		await expect(page.getByRole('switch')).toHaveCount(3);

		const roaring = page.getByRole('switch', { name: /roaring/iu });

		await expect(roaring).toHaveAttribute('aria-checked', 'true');
		await roaring.click();
		await expect(roaring).toHaveAttribute('aria-checked', 'false');

		// The timing readout always shows a duration (live or reference), never empty.
		await expect(page.locator('.fe-bench__number')).toContainText('ms');
		await expect(page.getByText(/faster than naive scan/u)).toBeVisible();
	});

	test('links the three demonstrated capabilities to the local lab, and only those', async ({ page }) => {
		const demoLinks = page.locator('.fe-about__demo-link');

		await expect(demoLinks).toHaveCount(3);
		for (const section of ['memoization', 'similarity', 'bayesian']) {
			await expect(page.locator(`#${section} .fe-about__demo-link`)).toHaveAttribute('href', reactPlainUrl('/lab'));
		}
		// The acceleration internals have no pane, so a link there would claim a demo that does not exist.
		for (const section of ['roaring', 'exclusion', 'rtree', 'bloom', 'textindex']) {
			await expect(page.locator(`#${section} .fe-about__demo-link`)).toHaveCount(0);
		}
	});

	test('a demo link actually reaches the lab', async ({ page }) => {
		const link = page.locator('#similarity .fe-about__demo-link');

		await link.scrollIntoViewIfNeeded();
		await link.click();

		await expect(page).toHaveURL(reactPlainUrl('/lab'));
	});

	test('has a table of contents entry for every band and the benchmark', async ({ page }) => {
		const hrefs = await page.locator('.fe-about__toc a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));

		expect(hrefs).toHaveLength(BAND_TITLES.length + 1);
		expect(hrefs.at(-1)).toBe('#benchmark');
	});

	test('has no serious accessibility violations (settled, reduced motion)', async ({ page }) => {
		// Scan the settled visual state with motion disabled so the figures are evaluated as their static
		// frames, not a transient animation frame.
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

test.describe('how-it-works · reachable', () => {
	test('from the landing page', async ({ page }) => {
		await page.goto(siteUrl('/'));
		await page.locator('.hero__actions').getByRole('link', { name: 'How the engine works' }).click();

		await expect(page).toHaveURL(PAGE_URL);
		await expect(page.getByRole('heading', HERO)).toBeVisible();
	});

	// Every demo app's landing hub links here; in development each link resolves to this server.
	for (const [name, landingUrl] of [
		['React RTK', '/'],
		['React plain', reactPlainUrl('/')],
		['SvelteKit', svelteUrl('/')],
		['Vue', vueUrl('/')],
		['Angular', angularUrl('/')],
		['vanilla', vanillaUrl('/')],
	] as const) {
		test(`from the ${name} landing hub`, async ({ page }) => {
			await page.goto(landingUrl);

			const link = page.getByRole('link', { name: /how the engine works/iu });

			await expect(link).toHaveAttribute('href', PAGE_URL);
			await link.click();
			await expect(page.getByRole('heading', HERO)).toBeVisible();
		});
	}
});
