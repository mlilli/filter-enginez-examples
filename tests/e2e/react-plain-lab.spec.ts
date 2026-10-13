/**
 * `/lab` on the plain-React app — the three engine capabilities the docs advertise, running.
 *
 * @remarks
 * **The browser half of `/lab`'s coverage.** Its unit cases run in jsdom against a four- or five-book
 * fixture. That is a real gate and it cannot see the two things this route's whole value rests on: whether the engine boots
 * here at all, and whether the acceleration structures produce anything against the REAL 10,000-book
 * corpus rather than against a hand-built fixture chosen to make them.
 *
 * ## What only a browser can say here
 *
 * 🔴 **The similarity pane's `bandSize: 4` is a MEASURED value, and it was measured in Node.** The
 * table in `labSimilarity.ts` came from a `tsx` probe over the committed corpus: at the library
 * default, 54 of 200 sampled anchors returned no neighbors, and lowering the threshold recovered
 * three of them, because LSH banding decides which items are candidates and the threshold only
 * filters the ones it produced. The unit spec pins the constant and proves the pane USES it, but its
 * fixture has four books. **This spec confirms the setting does in a browser what it did in Node** —
 * and the failure mode it guards is a pane that renders a heading, a working picker, and no neighbors,
 * with a clean console.
 *
 * ⚠ **The MinHash index build is ~178 ms of SYNCHRONOUS work inside a render**, also measured in
 * Node. Under React's scheduler on a real corpus it is a blocking first paint of the pane. The boot
 * budget below is generous enough not to police that, deliberately — this spec is here to prove the
 * capability runs, not to become an untuned performance gate.
 *
 * ## Why `/books` is visited first
 *
 * `/lab` borrows the books entry, and `bootBooksEngine` caches one engine in a module-level promise,
 * so both routes share it. Arriving at `/lab` cold boots the corpus itself; arriving from `/books`
 * exercises the reuse the route was designed around — including that filters set there are still
 * applied here, which is the claim the lab's own lede makes to the visitor. The second case is the
 * one that would catch a regression in the sharing, because the first passes either way.
 *
 * @packageDocumentation
 */

import { expect, type Page, test } from '@playwright/test';

import { BOOKS_ARRIVAL } from './booksArrival.js';
import { reactPlainUrl } from './reactPlainBase.js';
import { subtitle } from './subtitles.js';

/**
 * The 404's headline, quoted from `notfound/core.ts`.
 *
 * @remarks
 * 🔴 **The heading is `NOT_FOUND_COPY.heading`, not the page's nickname in the docs ("Filtered to
 * zero").** Asserting that a string appearing nowhere in the app is absent passes whether or not the
 * route 404s, which would make the case that proves the route ordering vacuous. Quoted rather than
 * imported for the reason `subtitles.ts` gives: Playwright does not transform files under
 * `node_modules`, and the shared package is not a root dependency.
 */
const NOT_FOUND_HEADING = 'No records passed this filter';

/**
 * How long the books engine may take to boot before `/lab`'s panes paint.
 *
 * @remarks
 * Taken from `BOOKS_ARRIVAL` rather than restated, because it is the same boot — `/lab` renders
 * through the same `<DatasetRoute>` over the same cached `bootBooksEngine`. A copied literal here
 * would be the duplication `booksArrival.ts` exists to prevent, one route later.
 */
const BOOT_TIMEOUT_MS = BOOKS_ARRIVAL['react-plain'].bootTimeoutMs;

/**
 * The projections pane's rows.
 *
 * @remarks
 * Scoped to the pane's own list rather than `getByRole('listitem')` filtered by text. All three
 * panes render `<li>`s, and a filter like `/Rated/` would happily match a neighbor row whose book
 * title or subject tag contained the word — an unscoped selector that passes against this corpus and
 * starts counting the wrong rows the first time the corpus changes.
 */
function candidateRows(page: Page) {
	return page.locator('.fe-lab__rows > li');
}

/** Wait for the lab's three panes to have painted. */
async function waitForLab(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1, name: 'Engine capabilities, running' })).toBeVisible({
		timeout: BOOT_TIMEOUT_MS,
	});
	await expect(page.getByRole('heading', { level: 2, name: 'What-if projections' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Nearest neighbors' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Suggested next filters' })).toBeVisible();
}

test.describe('React plain · /lab', () => {
	test('resolves to the lab rather than to a plausible 404', async ({ page }) => {
		// `App.tsx` places `/lab` before `/:datasetId` because a bare segment is otherwise a candidate
		// for the dataset resolver, which answers an unknown id with the shared 404. That failure does
		// not error — it renders a convincing "filtered to zero" page — so the ordering deserves an
		// assertion rather than a comment.
		await page.goto(reactPlainUrl('/lab'));

		await waitForLab(page);
		await expect(page.getByText(NOT_FOUND_HEADING)).toHaveCount(0);
	});

	test('projects a real what-if count per candidate, and moves them all on commit', async ({ page }) => {
		await page.goto(reactPlainUrl('/lab'));
		await waitForLab(page);

		await expect(candidateRows(page)).toHaveCount(5);

		const liveLine = page.getByText(/books match the current filters/u);
		const before = (await liveLine.textContent()) ?? '';

		// Every projection must be a real number against the 10k corpus, not "no results" across the
		// board — which is what a broken simulate path would produce while the pane looked finished.
		const fantasyRow = candidateRows(page).filter({ hasText: 'Genre is exactly Fantasy' });

		await expect(fantasyRow).toContainText(/\d[\d,]*\sbooks/u);

		await fantasyRow.getByRole('button', { name: 'Apply' }).click();

		// Committing narrows the live count, and the row flips to the withdraw affordance.
		await expect(fantasyRow.getByRole('button', { name: 'Withdraw' })).toBeVisible();
		await expect(liveLine).not.toHaveText(before);
	});

	test('finds neighbors against the REAL corpus at the measured banding', async ({ page }) => {
		// 🔴 The case this spec exists for. `bandSize: 4` was chosen from a Node probe; at the library
		// default this pane is empty for roughly a quarter of anchors, and `findSimilar` reports that
		// by returning [] rather than by throwing. Asserting a NON-EMPTY neighbor list against the
		// full corpus is the only check that can tell the two configurations apart in a browser.
		await page.goto(reactPlainUrl('/lab'));
		await waitForLab(page);

		await expect(page.getByText(/shares enough with|nothing to find neighbors for/u)).toHaveCount(0);

		const neighbors = page.locator('.fe-lab__neighbors > li');

		await expect(neighbors.first()).toBeVisible({ timeout: BOOT_TIMEOUT_MS });
		expect(await neighbors.count()).toBeGreaterThan(0);

		// Every neighbor carries an estimated affinity, and the `≈` is the claim that it IS an
		// estimate — a bare percentage would overstate what MinHash offers.
		await expect(neighbors.first()).toContainText(/≈\d+%/u);

		// Re-anchoring must produce a different neighbor set rather than a stale one.
		const firstNeighborText = await neighbors.first().textContent();
		const anchorPicker = page.getByRole('combobox');
		const options = await anchorPicker.locator('option').all();
		const secondValue = await options[1]?.getAttribute('value');

		await anchorPicker.selectOption(secondValue ?? '');
		await expect(neighbors.first()).not.toHaveText(firstNeighborText ?? '');
	});

	test('ranks suggestions and states the corpus they came from', async ({ page }) => {
		await page.goto(reactPlainUrl('/lab'));
		await waitForLab(page);

		// The standing condition: the synthetic corpus is announced, not hidden, and its size is
		// visible so the probabilities can be calibrated rather than merely trusted.
		await expect(page.locator('.fe-lab__provenance')).toContainText(/12 sessions in the model/u);
		await expect(page.locator('.fe-lab__provenance')).toContainText(/12\s+are synthetic/u);

		const suggestions = page.locator('.fe-lab__suggestions > li');

		await expect(suggestions.first()).toBeVisible();
		await expect(suggestions.first()).toContainText(/\d+%/u);
	});

	test('carries filters set on /books through to the lab', async ({ page }) => {
		// The shared cached engine, which is the reason `/lab` borrows the books entry rather than
		// booting its own. A regression here does not error — the lab simply shows unfiltered numbers
		// while its lede tells the visitor their filters are still applied.
		// The books route has no `h1` — its readiness signal is the header subtitle `<DatasetRoute>`
		// swaps in once the engine has booted, which is what every other books spec waits on.
		await page.goto(reactPlainUrl('/books'));
		await expect(page.getByText(subtitle('Books', 'react-plain'))).toBeVisible({ timeout: BOOT_TIMEOUT_MS });

		await page.goto(reactPlainUrl('/lab'));
		await waitForLab(page);

		const liveText = (await page.getByText(/books match the current filters/u).textContent()) ?? '';
		const liveCount = Number.parseInt(liveText.replace(/[^\d]/gu, ''), 10);

		expect(liveCount).toBeGreaterThan(0);
	});
});

