/**
 * `/compare` on the SvelteKit vertical — the two things that are true only here.
 *
 * @remarks
 * `compare.spec.ts` drives the comparison page end to end: it clicks every row and proves all six
 * verticals reproduce one result set, and `compare-shells.spec.ts` proves every shell produces the
 * same six links. **So this file deliberately does not re-assert any of that.** Everything below is
 * specific to SvelteKit, because neither behavior exists on the other five verticals.
 *
 * ### 1. It server-renders, links and all
 *
 * The React shell reads `window.location`, so its link list cannot exist until after mount. This one
 * takes SvelteKit's `page.url`, which satisfies the shared `CompareLocation` structurally, so the six
 * links are in the served HTML. With `javaScriptEnabled: false` the page is therefore fully usable —
 * the same zero-JS property `/books-server` and `/wine-server` carry, reached here for free
 * rather than by writing a fallback component.
 *
 * **This is also the assertion that cannot pass by accident**, which is the reason it is worth a
 * browser at all. A `toBeVisible()` on a hydrated page proves nothing about SSR — the client would
 * have produced the same DOM a frame later, which is the shape of the `svelte-about` axe race.
 * Turning JavaScript off removes the alternative explanation entirely.
 *
 * ### 2. Its dataset toggle still works once the client has taken over
 *
 * Hydration is the step that can break a server-rendered page while leaving it looking perfect, and
 * this is the only test in the repo that clicks a `/compare` control with JavaScript enabled — the
 * zero-JS pair above run with it off, and `compare-shells.spec.ts` loads the page without touching
 * anything. Route-level either way, so the component test cannot cover it: `CompareView.test.ts`
 * mounts the view with its props already resolved and never navigates.
 *
 * **It does NOT assert that the navigation is client-side, and that omission is deliberate.** Two full
 * e2e runs were spent asserting exactly that, and the claim was never the product's: nothing in the app
 * or its docs says these toggles avoid a document load, the page is stateless, and a reload renders
 * the identical result. What the assertion actually measured was whether Playwright reached the click
 * before SvelteKit finished booting — desktop and mobile disagreed on that, which is the tell. See the
 * wait below for the ordering that makes it unwinnable as written.
 *
 * Note what is NOT asserted: that the ROW links are full navigations. Five of the six are
 * cross-origin, so SvelteKit could not intercept them regardless, and the sixth is guarded by
 * `data-sveltekit-reload` rather than by a test — a wrong answer there is a link that silently does
 * nothing, which `compare.spec.ts` would catch the moment this shell joins the parameterized run.
 *
 * @packageDocumentation
 */

import { expect, type Page, test } from '@playwright/test';

import {
	type CompareDataset,
	DATASET_LABELS,
	DATASET_PARAM,
	DATASET_ROUTES,
	URL_STATE_PARAM,
	verticalsServing,
} from '../../packages/examples-shared/src/compare/links.js';
import { svelteUrl } from './svelteBase.js';

/** The dataset a cold visit lands on. */
const DEFAULT_DATASET: CompareDataset = 'books';

/**
 * The dataset the toggle switches TO.
 *
 * @remarks
 * Both are annotated against {@link CompareDataset} rather than written inline, so renaming a dataset
 * fails to COMPILE here instead of failing as a toggle that silently does nothing. The visible label
 * and the route are then derived from the id through the shared maps, which is the whole reason those
 * maps are exported — a spec that spelled out "Real estate" would be a restated literal of the kind
 * `subtitles.ts` exists to avoid.
 */
const OTHER_DATASET: CompareDataset = 'real-estate';

/** The `<ul>` of vertical rows — scoped so the toggles and the footer link cannot match by accident. */
const COMPARE_LIST = '.fe-compare__list';

/** One row's anchor. */
const COMPARE_ROW_LINK = '.fe-compare__row-name';

/** The serialized state, exactly as the six links carry it. */
const COMPARE_STATE_VALUE = '.fe-compare__state-value';

/** Read every row link's `href`, parsed. */
async function rowUrls(page: Page): Promise<readonly URL[]> {
	const hrefs = await page
		.locator(`${COMPARE_LIST} ${COMPARE_ROW_LINK}`)
		// The element generic is named explicitly for the reason `histogramSignature` names its own:
		// `evaluateAll` defaults it to a union whose `className` is `any` in TS 6's lib.dom, and the
		// union degrades the whole expression to `any` under typed lint.
		//
		// ⚠ THREE type arguments — see the note in `compare-shells.spec.ts`. Playwright 1.63 removed
		// the no-arg two-generic overload, so a two-argument call binds the element type to `Arg`.
		.evaluateAll<string[], undefined, HTMLAnchorElement>((anchors) => anchors.map((anchor) => anchor.href));

	return hrefs.map((href) => new URL(href));
}

test.describe('SvelteKit /compare — server-rendered', () => {
	// The whole point of this describe. Scoped rather than set per test so it cannot be lost in a
	// later edit that adds a sibling test and forgets the annotation.
	test.use({ javaScriptEnabled: false });

	test('serves all six links, with their state, before any client code runs', async ({ page }) => {
		await page.goto(svelteUrl('/compare'));

		// No boot wait, and none is possible: with JavaScript off there is no client to wait FOR. If
		// this markup is not in the response body, nothing will ever put it on the page.
		const serialized = await page.locator(COMPARE_STATE_VALUE).textContent();

		expect(serialized, 'the served HTML carried no state to compare').toBeTruthy();

		const urls = await rowUrls(page);

		// Derived rather than `VERTICALS.length` — see the note in `compare-shells.spec.ts`. Same
		// answer for `books`, and still right if this spec is ever pointed at a narrower dataset.
		const serving = verticalsServing(DEFAULT_DATASET);

		expect(urls).toHaveLength(serving.length);
		expect(urls.map((url) => url.origin)).toEqual(serving.map((descriptor) => descriptor.devOrigin));
		expect(urls.map((url) => url.pathname)).toEqual(serving.map(() => DATASET_ROUTES[DEFAULT_DATASET]));
		expect(urls.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(serving.map(() => serialized));
	});

	test('switches dataset through a plain link, with no client code at all', async ({ page }) => {
		// The zero-JS half of the toggle: same anchors, resolved by a document load instead of by
		// SvelteKit. A shell that drove its toggles from an onclick handler would pass every
		// JavaScript-enabled test and fail exactly here.
		await page.goto(svelteUrl(`/compare?${DATASET_PARAM}=${OTHER_DATASET}`));

		const urls = await rowUrls(page);

		expect(urls.map((url) => url.pathname)).toEqual(
			verticalsServing(OTHER_DATASET).map(() => DATASET_ROUTES[OTHER_DATASET]),
		);
	});
});

test.describe('SvelteKit /compare — hydrated', () => {
	test('re-derives the table when the dataset toggle is clicked', async ({ page }) => {
		await page.goto(svelteUrl('/compare'));

		// **Wait for the ROUTER, which is neither "the markup is there" nor "the client has started".**
		//
		// Two earlier versions of this line were wrong, in ways worth keeping written down because both
		// look correct:
		//
		//   1. Polling for `.fe-compare__list` — but that list is SERVER-RENDERED, so it is in the first
		//      response byte, and `waitForFunction` runs in Playwright's injected context rather than the
		//      app's. It proved the BROWSER had JavaScript, not that SvelteKit had started.
		//   2. Polling for `history.state !== null` — closer, and still too early. `start()` seeds the
		//      history entry, then `await _hydrate(...)`, and only afterwards calls `_start_router()`,
		//      which is what attaches the click listener. Desktop reached the click inside that await;
		//      mobile did not. A test that two viewports disagree about is measuring the interleaving.
		//
		// `scrollRestoration` is the signal because of WHERE it is set: `_start_router()`'s first
		// statement, in the same synchronous block that ends by adding the click listener. Nothing else
		// sets it on a fresh visit — `restore_scroll()` only does so when a saved scroll position exists,
		// and there is none on a cold `goto`. Since `waitForFunction` can only observe it from a later
		// task, seeing `'manual'` means that whole block, listener included, has already run. That is an
		// ordering guarantee rather than a hope about speed, which is the difference from both attempts
		// above. Verified against `@sveltejs/kit/src/runtime/client/client.js`, not inferred.
		await page.waitForFunction(() => window.history.scrollRestoration === 'manual');

		const before = await rowUrls(page);

		expect(before.map((url) => url.pathname)).toEqual(
			verticalsServing(DEFAULT_DATASET).map(() => DATASET_ROUTES[DEFAULT_DATASET]),
		);

		await page.getByRole('link', { exact: true, name: DATASET_LABELS[OTHER_DATASET] }).click();

		// `expect.poll` rather than a bare read: the navigation resolves asynchronously either way, so
		// reading straight after the click samples the pre-navigation table and passes for the wrong
		// reason on a fast machine.
		await expect
			.poll(async () => (await rowUrls(page)).map((url) => url.pathname))
			.toEqual(verticalsServing(OTHER_DATASET).map(() => DATASET_ROUTES[OTHER_DATASET]));

		expect(new URL(page.url()).searchParams.get(DATASET_PARAM)).toBe(OTHER_DATASET);
	});
});
