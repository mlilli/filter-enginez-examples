/**
 * The comparison page's table — one row per vertical serving the dataset, each carrying the state the
 * page shows.
 *
 * @remarks
 * The comparison page is one page, on the landing site (`/compare` on :5197), rendered from
 * `packages/site/src/compare/compareView.ts`. That module is unit-tested over strings; this file asks
 * the questions only a served page can answer: does the dev server serve it with a real table, does
 * the browser render it again for the query and the host, and does a dataset toggle — a plain link,
 * so a full navigation — land on the table for that dataset.
 *
 * ### Expectations are DERIVED from the registry, never listed
 *
 * Every row expectation comes from `verticalsServing`, the same filter `compareLinks` applies, and
 * every string from `copy.ts`. Deriving is safe here, unlike in `core.test.ts`, because this compares
 * a RENDERED page against the registry — a different pair — and that is exactly how a page that
 * dropped, reordered or pointed a row at the wrong app gets caught. The one roster that IS spelled out is
 * `wine-server`'s two, for the reason given at that test.
 *
 * ### What this deliberately does NOT do
 *
 * It never follows a row. `compare.spec.ts` owns the cross-origin click-through — the part that proves
 * the links WORK, by booting each destination and requiring one settled result count across all six.
 * This file proves the table is RIGHT. Neither implies the other: six correct links that all 404 would
 * pass here, and six working links into the wrong apps would pass there.
 *
 * ### Two renders, and the test for each
 *
 * The served HTML carries a cold visit prerendered at build (and dev-server) time, linked to the
 * DEPLOYED apps, so the page reads in full with JavaScript off. Its module script then renders the
 * view for the page's own query and host. The JavaScript-enabled tests wait for that second render
 * (`openComparePage`, which requires the rows on the local dev origins); the last describe turns
 * JavaScript off, which removes the second render entirely and leaves only what the server sent.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import {
	compareHeading,
	compareListLabel,
} from '../../packages/examples-shared/src/compare/copy.js';
import {
	COMPARE_DATASETS,
	type CompareDataset,
	DATASET_LABELS,
	DATASET_PARAM,
	DATASET_ROUTES,
	URL_STATE_PARAM,
	verticalsServing,
} from '../../packages/examples-shared/src/compare/links.js';
import {
	COMPARE_LIST,
	COMPARE_STATE_LABEL,
	COMPARE_STATE_VALUE,
	comparePageUrl,
	compareRowUrls,
	openComparePage,
} from './comparePage.js';

/**
 * The dataset a cold visit lands on.
 *
 * @remarks
 * The first toggle, which is what `readCompareDataset` falls back to and what the build prerenders —
 * taken from the same list rather than restated as `'books'`, so reordering the toggles moves this too.
 */
const COLD_DATASET: CompareDataset = COMPARE_DATASETS[0];

/** The one dataset NOT served by all six verticals. */
const WINE_SERVER_DATASET: CompareDataset = 'wine-server';

/**
 * The dataset the toggle test switches TO.
 *
 * @remarks
 * Annotated against {@link CompareDataset}, so renaming a dataset fails to COMPILE here instead of
 * failing as a toggle that silently matches nothing. The visible label and the route are then derived
 * from the id through the shared maps.
 */
const OTHER_DATASET: CompareDataset = 'real-estate';

/**
 * A state the visitor arrived with, deliberately in a form the page would never produce itself.
 *
 * @remarks
 * Three things a decode-and-re-encode would change, so a page that "normalized" the inbound state
 * cannot pass by producing an equivalent one: the `label` key first (the engine's export puts
 * `version` first and drops `label` entirely), a non-ASCII character, and a space. It is not a preset
 * — no preset has an empty rule list — so a page that fell back to a preset cannot pass either.
 */
const INBOUND_STATE = 'h~{"label":"inbound · 2000–2025","rules":[],"version":1}';

/** The provenance line every preset-driven render starts with. */
const PRESET_LABEL_PATTERN = /^preset · /u;

test.describe('the comparison page — its table', () => {
	test('a cold visit renders one row per serving vertical, in registry order, carrying the readout', async ({ page }) => {
		// No query at all, so this keeps exercising the cold URL: `readCompareDataset(null)`'s fallback is
		// its own contract, and a spec that always spelled `?dataset=` would have quietly stopped testing it.
		const serialized = await openComparePage(page);
		const urls = await compareRowUrls(page);
		const serving = verticalsServing(COLD_DATASET);

		expect(urls).toHaveLength(serving.length);
		expect(urls.map((url) => url.origin)).toEqual(serving.map((descriptor) => descriptor.devOrigin));
		expect(urls.map((url) => url.pathname)).toEqual(serving.map(() => DATASET_ROUTES[COLD_DATASET]));
		expect(urls.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(serving.map(() => serialized));

		// The rows are named for their verticals, in the same order — the names `compare.spec.ts` clicks by.
		await expect(page.locator(COMPARE_LIST).getByRole('link')).toHaveText(
			serving.map((descriptor) => descriptor.name),
		);

		// A cold visit falls back to a preset, never to the empty state.
		await expect(page.locator(COMPARE_STATE_LABEL)).toHaveText(PRESET_LABEL_PATTERN);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(compareHeading(COLD_DATASET));
		await expect(page.getByRole('list', { name: compareListLabel(COLD_DATASET) })).toBeVisible();
	});

	test('?dataset=wine-server renders exactly the two serving rows, and says "both"', async ({ page }) => {
		const serving = verticalsServing(WINE_SERVER_DATASET);

		// Not derived: the roster is spelled out so this fails if the registry loses a server route,
		// rather than agreeing with whatever it now says. `core.test.ts` makes the same argument.
		expect(serving.map((descriptor) => descriptor.id)).toEqual(['sveltekit', 'vanilla']);
		// The copy, checked before the page is: a heading that read "all 2" would be the page faithfully
		// rendering wrong copy, and this names the module to fix.
		expect(compareHeading(WINE_SERVER_DATASET)).toContain('both');

		const serialized = await openComparePage(page, `?${DATASET_PARAM}=${WINE_SERVER_DATASET}`);
		const urls = await compareRowUrls(page);

		expect(urls.map((url) => url.origin)).toEqual(serving.map((descriptor) => descriptor.devOrigin));
		expect(urls.map((url) => url.pathname)).toEqual(serving.map(() => DATASET_ROUTES[WINE_SERVER_DATASET]));
		expect(urls.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(serving.map(() => serialized));

		// The assistive-tech half, which no visual assertion reaches. `getByRole('list', { name })`
		// resolves the `<ul>` BY its accessible name, so a stale "six" label fails to match rather than
		// matching something else.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(compareHeading(WINE_SERVER_DATASET));
		await expect(page.getByRole('list', { name: compareListLabel(WINE_SERVER_DATASET) })).toBeVisible();
	});

	test('a dataset toggle navigates to the table for that dataset', async ({ page }) => {
		await openComparePage(page, `?${DATASET_PARAM}=${COLD_DATASET}`);

		const toggle = page.getByRole('group', { name: 'Dataset' }).getByRole('link', {
			exact: true,
			name: DATASET_LABELS[OTHER_DATASET],
		});

		await expect(toggle).not.toHaveAttribute('aria-current', 'true');
		await toggle.click();

		// A full navigation: the toggles are plain links back to the page, so the new table is a new
		// document's render. Waiting on the URL first keeps a failure here from blaming the table for a
		// click that went nowhere.
		await page.waitForURL((url) => url.searchParams.get(DATASET_PARAM) === OTHER_DATASET);

		const serving = verticalsServing(OTHER_DATASET);

		// Polled: the new document arrives with the prerendered cold table, and the browser render
		// replaces it — reading straight after the navigation could sample the former.
		await expect
			.poll(async () => (await compareRowUrls(page)).map((url) => `${url.origin}${url.pathname}`))
			.toEqual(serving.map((descriptor) => `${descriptor.devOrigin}${DATASET_ROUTES[OTHER_DATASET]}`));
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(compareHeading(OTHER_DATASET));
		await expect(
			page.getByRole('group', { name: 'Dataset' }).getByRole('link', { exact: true, name: DATASET_LABELS[OTHER_DATASET] }),
		).toHaveAttribute('aria-current', 'true');
	});

	test('an inbound ?f= is shown and carried verbatim, with no preset offered', async ({ page }) => {
		const search = `?${new URLSearchParams([
			[DATASET_PARAM, COLD_DATASET],
			[URL_STATE_PARAM, INBOUND_STATE],
		]).toString()}`;

		expect(await openComparePage(page, search), 'the readout is not the state the link carried').toBe(INBOUND_STATE);

		const urls = await compareRowUrls(page);

		expect(urls.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(
			verticalsServing(COLD_DATASET).map(() => INBOUND_STATE),
		);

		// Offering a preset to someone who arrived with their own state would replace the very thing they
		// followed the link to see, so the group is not rendered at all.
		await expect(page.getByRole('group', { name: 'Dataset' })).toBeVisible();
		await expect(page.getByRole('group', { name: 'Example state' })).toHaveCount(0);
		await expect(page.locator(COMPARE_STATE_LABEL)).not.toHaveText(PRESET_LABEL_PATTERN);
	});
});

test.describe('the comparison page — without JavaScript', () => {
	// The whole point of this describe. Scoped rather than set per test so it cannot be lost in a later
	// edit that adds a sibling test and forgets the annotation.
	test.use({ javaScriptEnabled: false });

	test('the served page already holds the cold-visit table, linked to the deployed apps', async ({ page }) => {
		await page.goto(comparePageUrl());

		// No render wait, and none is possible: with JavaScript off there is no client to wait FOR. If
		// this markup is not in the response body, nothing will ever put it on the page.
		const serialized = await page.locator(COMPARE_STATE_VALUE).textContent();

		expect(serialized, 'the served HTML carried no state to compare').toBeTruthy();

		const urls = await compareRowUrls(page);
		const serving = verticalsServing(COLD_DATASET);

		// PRODUCTION origins, on a page served from a loopback host: the prerender links to the deployed
		// apps, and only the module script — which did not run — relinks the rows for the host.
		expect(urls.map((url) => url.origin)).toEqual(serving.map((descriptor) => descriptor.productionOrigin));
		expect(urls.map((url) => url.pathname)).toEqual(serving.map(() => DATASET_ROUTES[COLD_DATASET]));
		expect(urls.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(serving.map(() => serialized));

		await expect(page.locator(COMPARE_STATE_LABEL)).toHaveText(PRESET_LABEL_PATTERN);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(compareHeading(COLD_DATASET));
	});
});
