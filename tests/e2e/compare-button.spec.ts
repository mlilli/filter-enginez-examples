/**
 * The header **Compare** button — the inbound half of the comparison page.
 *
 * @remarks
 * `compare.spec.ts` and `compare-page.spec.ts` both start ON the comparison page, on the landing site,
 * and prove things about the links leaving it. This spec tests the way in: filter a dataset route,
 * press Compare, and require that the state you were looking at is the state the page receives. The
 * button links across origins — from the app's dev server to the site's (`SITE.devOrigin`) — so every
 * press here is a full cross-document navigation.
 *
 * ### The last assertion is the whole point
 *
 * `resolveCompareState`'s invariant is that an inbound `?f=` travels **byte-for-byte**, never decoded
 * and re-encoded, and `core.test.ts` pins that at the unit level. But the unit test hands the
 * function a string; it cannot see the two transport hops this button introduces — the address bar
 * into an `href`, and the `href` into the destination's query. Either could re-encode without
 * breaking anything visible, and the result would be a comparison page demonstrating that an
 * EQUIVALENT state arrives rather than the visitor's own bytes. So the final check reads the `f` the
 * browser actually navigated with and requires the page's own state readout to equal it exactly.
 *
 * ### Where byte-identity STOPS holding, and why that is not a bug
 *
 * It holds across the comparison page → the button → the comparison page. It does **not** survive a dataset route's
 * boot: the seed arrives as
 * `h~{"label":"fiction · published 2000–2025","rules":[…],"version":1}` and the address bar a moment
 * later reads `h~{"version":1,"rules":[…]}`.
 *
 * Nothing re-encoded it. The dataset route loaded the config into a real engine and its URL sync then
 * wrote that ENGINE's state back out — and `label` is not engine state. `exportConfig` emits a label
 * only when handed one in `options`, `loadConfig` never reads the field at all, and `gen-sample.ts`
 * spreads one on top of `exportConfig(engine)` precisely because the engine will not carry it. Key
 * order likewise follows `exportConfig`'s return literal. The URL on a dataset route is a **mirror of
 * engine state**, not an archive of the string that seeded it, so a config carrying anything the
 * engine does not model comes back changed by construction.
 *
 * So this spec asserts **quiescence**, not immutability: once the app stops changing `?f=`, the button
 * offers exactly what the address bar holds, and clicking it delivers that to the destination
 * unchanged.
 *
 * ### "Wait for them to agree" is not a wait
 *
 * Polling until the href and the address bar match is flaky, and the reason is worth keeping: **they
 * match at `t0`.** Arriving at `/books?f=…` seeds both from the same string, so such a poll returns on
 * its first probe having waited for precisely nothing, and the re-sync then lands partway through the
 * assertions below. Whether it lands before or after the click is a coin flip decided by render
 * timing — green on one run and red on the next, with no code change between them.
 *
 * A condition that is true before the thing you are waiting for begins is not a wait. The wait is
 * {@link settledStatePair}, which requires the same pair three probes running.
 *
 * ### And the last assertion does not straddle the click
 *
 * Comparing a value read BEFORE the click against the URL landed on AFTER it is a race by
 * construction — the button is live, so a write in that window changes the href and fails an assertion
 * about nothing. Both halves of the final check are read after the navigation, which closes the
 * window without weakening what is checked: a re-encode at either hop still fails it.
 *
 * ### Why the cold state is OBSERVED rather than asserted
 *
 * The obvious first test is "a freshly-loaded /books has no `?f=`, so the button is disabled". That
 * would be asserting a boot-time behavior no part of the product claims: `<FilterEngineUrlSync>`
 * writes only on an engine event, and whether one fires between mount and first paint is an
 * implementation detail no part of the product pins. Asserting it here would be inventing a contract
 * and then defending it.
 *
 * What IS a contract is the button's own rule: **enabled exactly when the URL carries state.** So the
 * cold test reads the URL, derives what the button should be, and requires agreement. That still
 * catches the two failures worth catching — a button permanently enabled, or permanently inert —
 * without pretending to know which side of the branch a cold load lands on.
 *
 * ### Two shapes, and the second is the one that scales
 *
 * The filter-driven test above runs on React, where the DEBOUNCED write path is what it uniquely
 * proves; applying a filter in each of the other five would add five boots for the same write path.
 *
 * The **inbound-link** test needs none of that. Arriving at `/books?f=…` publishes the state at
 * hydration with no interaction at all, so one loop covers every shell that ships the button —
 * needing only the boot subtitle, which `subtitles.ts` already derives from the registry. A new
 * vertical joins it through the registry, rather than by a copy of this file.
 *
 * It also closes a circle the other two specs each cover half of: `compare-page.spec.ts` proves the
 * outbound links are right, `compare.spec.ts` proves they work, and this takes the state the page
 * produced, carries it into a dataset route, and brings it back — through the store the four
 * non-React shells had to grow because `history.replaceState` fires no event.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, test } from '@playwright/test';

import { DATASET_PARAM, DATASET_ROUTES, URL_STATE_PARAM } from '../../packages/examples-shared/src/compare/links.js';
import { COMPARE_BUTTON_LABEL } from '../../packages/examples-shared/src/compare/target.js';
import { COMPARE_PATH, vertical, VERTICALS } from '../../packages/examples-shared/src/verticals/verticals.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import { COMPARE_STATE_VALUE, openComparePage } from './comparePage.js';
import {
	ACTIVE_CHIP,
	clickFirstFacetChip,
	FACET_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
} from './filterFlow.js';
import { SITE_BASE_URL } from './siteBase.js';
import { subtitle } from './subtitles.js';

/* `URL_STATE_PARAM` is imported rather than spelled out. Taking `DATASET_ROUTES` from `links.ts` puts
   that module in the Playwright program anyway, and once it is there, a local literal would be a
   second copy of a shared constant for no benefit. */

/**
 * Whether a URL is the comparison page on the landing site.
 *
 * @remarks
 * Origin AND path: the button leaves the app for the site's dev server, and a button that kept a
 * same-origin `/compare` href would land on the app's own `/compare` address, which serves no
 * comparison page — a path match alone would not tell the two apart.
 *
 * @param url - The URL to test.
 * @returns `true` for the site's comparison page, whatever its query.
 */
function isSiteComparePage(url: URL): boolean {
	return url.origin === SITE_BASE_URL && url.pathname === COMPARE_PATH;
}

/** The button under test. Resolved by role + accessible name, never by class. */
function compareButton(page: Page): Locator {
	return page.getByRole('link', { name: /compare this filter state|apply a filter first/i });
}

/**
 * The state in the button's `href` and the state in the address bar, sampled in the same frame.
 *
 * @remarks
 * Atomicity is the point. The app re-syncs `?f` shortly after hydration, so two separate reads can
 * straddle that write and disagree for a reason that has nothing to do with the button — a flake
 * that would look exactly like the bug this assertion is for. The class selector is DOM plumbing
 * here rather than an assertion locator; the assertions above resolve the control by role.
 *
 * @param page - The page under test.
 * @returns `[hrefState, urlState]`, either of which may be `null`.
 */
async function readStatePair(page: Page): Promise<readonly [string | null, string | null]> {
	return page.evaluate((param) => {
		const href = document.querySelector('a.fe-compare-link')?.getAttribute('href') ?? null;
		const fromHref = href === null ? null : new URL(href, window.location.origin).searchParams.get(param);

		return [fromHref, new URL(window.location.href).searchParams.get(param)] as const;
	}, URL_STATE_PARAM);
}

/**
 * Probe cadence for {@link settledStatePair}. Flat, and deliberately coarser than the 150ms URL-write
 * debounce so a pair of consecutive probes cannot both land inside one write window.
 */
const STATE_SETTLE_INTERVALS = [300];

/**
 * How many consecutive identical samples count as quiescent.
 *
 * @remarks
 * Three, not `settledCount`'s two, and the extra one is the whole point. Two is enough there because
 * a result count is already moving when the poll starts. Here the interesting value does not move
 * until the re-sync fires, so at `t0` the href and the address bar are BOTH the inbound seed and any
 * check for "have they agreed" is satisfied instantly — before the thing being waited for has begun.
 * Three samples at {@link STATE_SETTLE_INTERVALS} observe stability across a 600ms window opening
 * 300ms after boot, which is comfortably past the debounce plus its async config read.
 */
const REQUIRED_STABLE_SAMPLES = 3;

/**
 * The href and the address bar, once they have stopped changing and agree.
 *
 * @remarks
 * **Agreement alone is not a wait, and treating it as one makes this spec flaky.** Arriving at
 * `/books?f=…` puts the seed in the address bar and in the button's href simultaneously, so they agree
 * at `t0`; a poll for agreement returns on its first probe having waited for nothing, and the re-sync
 * then lands somewhere in the middle of the assertions below. What makes this a real wait is
 * QUIESCENCE — the same pair observed {@link REQUIRED_STABLE_SAMPLES} times running.
 *
 * This deliberately does not wait for the re-sync to have HAPPENED, which would be the easier check
 * and the wrong one: nothing in the product promises a dataset route rewrites `?f=` on boot, and a
 * shell whose engine emits no load event would hang on an invented contract rather than pass. Waiting
 * for "nothing is changing any more" is true either way.
 *
 * `intervals` is spread because `expect.poll` MUTATES the array it is handed (`pollIntervals.shift()`
 * in `playwright-core`), which silently drains a module-level constant for every caller after the
 * first — the trap `resultCount.ts` records against its own cadence constants.
 *
 * @param page - The page under test.
 * @returns The agreed `[hrefState, urlState]`, both non-null.
 */
async function settledStatePair(page: Page): Promise<readonly [string | null, string | null]> {
	let previous: readonly [string | null, string | null] = [null, null];
	let stableSamples = 0;

	await expect
		.poll(
			async () => {
				const current = await readStatePair(page);
				const isUnchanged = current[0] === previous[0] && current[1] === previous[1];

				stableSamples = isUnchanged ? stableSamples + 1 : 0;
				previous = current;

				return stableSamples >= REQUIRED_STABLE_SAMPLES && current[0] !== null && current[0] === current[1];
			},
			{
				intervals: [...STATE_SETTLE_INTERVALS],
				message:
					'the button href and the address bar never settled on one agreed state — either a write is still in flight, or the button is not observing the URL',
				timeout: 20_000,
			},
		)
		.toBe(true);

	return previous;
}

/** Navigate to the books route and wait for the corpus boot to swap in the live books page. */
async function bootBooksApp(page: Page): Promise<void> {
	await page.goto('/books');
	await expect(page.getByText(subtitle('Books', 'react-rtk'))).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('the header Compare button', () => {
	test('is enabled exactly when the URL carries state', async ({ page }) => {
		await bootBooksApp(page);

		const button = compareButton(page);

		await expect(button, 'the books header renders no Compare control').toBeVisible();
		await expect(button).toHaveText(new RegExp(COMPARE_BUTTON_LABEL, 'i'));

		// Derived, not assumed — see the docblock. Whichever way a cold load lands, the button must
		// agree with it.
		const hasState = new URL(page.url()).searchParams.get(URL_STATE_PARAM) !== null;

		// Read the attribute and compare, rather than branching into two `expect`s: the house rule
		// forbids an assertion inside a conditional, and `toHaveAttribute` cannot express "absent" — it
		// fails when the attribute is missing, which is exactly what the enabled state looks like.
		expect(
			await button.getAttribute('aria-disabled'),
			hasState
				? 'the URL carries state but the button refuses it'
				: 'the URL carries no state but the button offers itself as ready',
		).toBe(hasState ? null : 'true');
	});

	test('carries the filtered state to the comparison page byte-for-byte', async ({ page }, testInfo) => {
		await bootBooksApp(page);
		const full = await settledCount(page);

		await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
		await clickFirstFacetChip(page);
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		expect(await settledCount(page), 'the facet click did not narrow anything').toBeLessThan(full);

		// The engine → URL write is debounced, so the button cannot enable synchronously with the
		// click. Poll the URL rather than the button: this waits on the CAUSE, so a failure here
		// reports "the state never reached the address bar" instead of blaming the button for it.
		await expect
			.poll(() => new URL(page.url()).searchParams.get(URL_STATE_PARAM), { timeout: 5_000 })
			.not.toBeNull();

		const button = compareButton(page);

		await expect(button, 'state is in the URL but the button stayed inert').not.toHaveAttribute(
			'aria-disabled',
			'true',
		);

		// Captured BEFORE the click: landing on the comparison page replaces the URL being measured.
		const carried = new URL(page.url()).searchParams.get(URL_STATE_PARAM);

		await button.click();
		// A cross-origin navigation to the landing site; see the loop below for why the URL is waited on
		// rather than read straight after the click.
		await page.waitForURL(isSiteComparePage, { timeout: 15_000 });

		const landed = new URL(page.url());

		expect(landed.searchParams.get(DATASET_PARAM), 'the button lost the dataset on the way').toBe('books');
		expect(
			landed.searchParams.get(URL_STATE_PARAM),
			'the state changed between the address bar and the href — something re-encoded it',
		).toBe(carried);

		// And the page received what the URL delivered. Two hops, one string, unchanged throughout.
		await expect(page.locator(COMPARE_STATE_VALUE)).toHaveText(carried ?? '');
	});
});

/**
 * Every vertical that serves `/books` — which is every vertical.
 *
 * @remarks
 * Derived from the registry. The registry records which routes a vertical SERVES, not which of them
 * carry this control; the two sets coincide because every shell renders the button on its dataset
 * routes, and the guard test below fails if the derivation ever returns fewer shells than the
 * registry holds. Derived, a seventh vertical joins this loop the day it joins the registry, rather
 * than the day someone remembers this file.
 */
const SHELLS_WITH_BUTTON = VERTICALS.filter((descriptor) =>
	descriptor.routes.includes(DATASET_ROUTES.books),
);

test.describe('the Compare button — an inbound link, in every shell that has one', () => {
	// A registry filter can quietly return fewer shells than it should — a dropped route reads as a
	// shorter green suite, not as a failure. `compareLinks`' own six-link assertion exists for the same
	// reason, one level up.
	test('every vertical in the registry serves the books route this loop drives', () => {
		expect(SHELLS_WITH_BUTTON.map((descriptor) => descriptor.id)).toEqual(
			VERTICALS.map((descriptor) => descriptor.id),
		);
	});

	for (const descriptor of SHELLS_WITH_BUTTON) {
		const shell = { ...BOOKS_ARRIVAL[descriptor.id], id: descriptor.id };

		test(`${shell.id}: arriving with a state offers to compare exactly that state`, async ({ page }) => {
			// Take the state from the comparison page's own preset rather than hand-rolling one: a
			// literal here would be a second copy of `presets.ts`, and `presets.test.ts` already loads
			// every preset into a real engine over the real corpus. `openComparePage` requires the
			// readout non-empty.
			const seed = await openComparePage(page, `?${DATASET_PARAM}=books`);

			// The origin comes from the registry, which `tests/tooling/devServerPorts.test.ts` already
			// pins against `playwright.config.ts` — so a port change cannot drift out from under this.
			const target = new URL(`${vertical(shell.id).devOrigin}/books`);

			target.searchParams.set(URL_STATE_PARAM, seed);
			await page.goto(target.toString());
			await expect(page.getByText(subtitle('Books', shell.id, shell.tier))).toBeVisible({
				timeout: shell.bootTimeoutMs,
			});

			const button = compareButton(page);

			// The whole reason the four non-React shells grew a store: nothing filtered, nothing
			// clicked, and the button still knows there is state — because hydration published the
			// inbound `?f`, which `history.replaceState` could never have told it about.
			await expect(
				button,
				'arrived carrying state and the button is still inert — the inbound ?f was never published',
			).not.toHaveAttribute('aria-disabled', 'true');

			const [hrefState, urlState] = await settledStatePair(page);

			expect(
				hrefState,
				'the button href and the address bar disagree about the current state',
			).toBe(urlState);

			await button.click();

			// `page.url()` immediately after the click is not safe to read. The click returns once the
			// navigation has STARTED, and the comparison page is on another origin — the landing site's
			// dev server — so the address bar can still read `/books` while that document loads. Reading
			// it then would be luck rather than a guarantee.
			//
			// `waitForURL` on the site's origin and path settles once the comparison page is the page,
			// and it fails naming the URL actually reached if the button pointed anywhere else.
			await page.waitForURL(isSiteComparePage, { timeout: 15_000 });

			const landed = new URL(page.url());
			const landedState = landed.searchParams.get(URL_STATE_PARAM);

			// Deliberately NOT compared against `hrefState`. That reads two values either side of a
			// navigation and requires them equal, which is a race by construction: the button is live,
			// so a re-sync landing between the read and the click changes the href out from under the
			// captured value and fails an assertion about nothing. It failed exactly that way.
			//
			// What is actually contractual here is that nothing re-encodes on the way: the state the
			// browser navigated with is the state the destination received. Both halves of that are
			// read AFTER the navigation, so there is no window for them to drift apart, and a re-encode
			// at either hop still fails. That the button offered the CURRENT state is asserted above,
			// at quiescence, where it can be asserted honestly.
			expect(landedState, 'the button carried no state — it landed on a preset').not.toBeNull();
			await expect(page.locator(COMPARE_STATE_VALUE)).toHaveText(landedState ?? '');
		});
	}
});
