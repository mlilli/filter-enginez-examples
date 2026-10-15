/**
 * The comparison page — the cross-origin click-through, and the one test that actually proves the
 * portability claim.
 *
 * @remarks
 * Every vertical reads its filter state from the same `?f=` param, through a tagged serializer whose
 * `decode` sniffs the format tag rather than being told it. `compare/core.test.ts` unit-tests the link
 * construction; this file is what **navigates those links**. A serializer contract that holds in six
 * separate unit suites and fails across an origin boundary would look exactly like a passing suite.
 *
 * ### What this drives
 *
 * The comparison page is one page, on the landing site (`/compare` on :5197), and its markup lives in
 * `packages/site/src/compare/compareView.ts`. Its whole output is one link per vertical serving the
 * dataset; **all six verticals serve `/books` and hydrate `?f=` there**. So the click-through opens
 * the page's books view and follows every row into its app. That the rows point at the right origins
 * carrying the right state is `compare-page.spec.ts`'s claim, not this one's.
 *
 * ### The two assertions, and the failure each one alone would miss
 *
 * 1. **Per-vertical arrival.** Click the row, wait for that app's own boot signal, and require at
 *    least one active-filter pill. The pill is what separates "the app loaded" from "the app loaded
 *    the state" — without it, a `?f=` dropped on the floor by all six looks identical to success,
 *    because six unfiltered corpora agree with each other perfectly.
 * 2. **Count parity.** One settled count per vertical, and they must all be the same number. This is
 *    the product claim in the page's own lede ("reproduces the identical result set") stated as a
 *    test. It is deliberately a separate `test` rather than a running comparison inside the loop, so
 *    the report names the claim that broke instead of naming whichever vertical happened to be second.
 *
 * ### The link TABLE lives in `compare-page.spec.ts`
 *
 * **The two files prove different halves and neither implies the other.** This one proves the links
 * WORK: it boots six destinations and requires one settled result count across them. That one proves
 * the table is RIGHT — one row per serving vertical, in registry order, each carrying the state the
 * page shows. Six correct links that all 404 pass there; six working links into the wrong apps pass
 * here.
 *
 * ### Why the pills are asserted loosely, and what that leaves uncovered
 *
 * The preset carries two rules, so "exactly two pills" looks like the stronger assertion — and it is
 * not safe to make. The four non-React verticals summarize rules with the SHARED
 * `examples-shared/books-domain` `buildRuleSummaries`, but **both React books headers carry their own
 * private copy** (`BooksResultsHeader.tsx` in each app declares a local `buildRuleSummaries`). Two
 * private copies plus one shared implementation is past the three-strikes duplication line and is
 * worth collapsing, but it is not this spec's job, and a strict pill count would encode a
 * divergence rather than a contract. `.first()` visible is the part every vertical genuinely agrees
 * on. If those three summarizers are ever unified, tighten this to the rule count.
 *
 * ### Two things this spec deliberately does not do
 *
 * **It never opens a filter panel**, so it needs no `openFilterPanel` and no mobile branching: every
 * signal it reads — the header subtitle, the result count, the active-filter pills — lives in the
 * results column, which is the same at both project viewports. That is trap 1 from `filterFlow.ts`
 * observed by construction rather than by discipline.
 *
 * **It never asserts on markup that could have been server-rendered before the client started.** Two
 * pages here are served with content already in them: the comparison page itself, prerendered with
 * rows linked to the DEPLOYED apps (which is why `openComparePage` waits for the local re-render before
 * anything is clicked), and SvelteKit's books route, where an `expect(...).toBeVisible()` can resolve at
 * ~0 ms against SSR output. The waits below are on the boot subtitle and then on a SETTLED count, and a
 * settled count is by definition state only the client engine can produce.
 *
 * ### Why the `examples-shared` imports are relative
 *
 * The same reason `./subtitles.ts` gives at length: the package's subpaths point at TypeScript source
 * and Playwright does not transform files under `node_modules`. Both modules reached here —
 * `verticals/verticals.ts` and `compare/links.ts` — have zero external imports (links pulls only
 * `origins.ts` and the registry, both of which import nothing outside the package), so the boundary
 * stays where it is. Note that `compare/core.ts` is deliberately NOT the import: its barrel also pulls
 * `presets.ts`, which type-imports `@filter-enginez/core` and would widen the e2e program for values
 * this spec does not need — it takes the page's own default preset instead of naming one.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import {
	type CompareDataset,
	DATASET_PARAM,
	DATASET_ROUTES,
	verticalsServing,
} from '../../packages/examples-shared/src/compare/links.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import { COMPARE_LIST, openComparePage } from './comparePage.js';
import {
	ACTIVE_CHIP,
	isMobileProject,
	PLAYWRIGHT_POLL_INTERVALS,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
} from './filterFlow.js';
import { subtitle, type VerticalId } from './subtitles.js';

/**
 * The dataset the click-through runs on.
 *
 * @remarks
 * Books rather than real estate: it is the only dataset with a `/books` route in all six verticals AND
 * a main-thread engine in every one of them, so the six counts are comparable without a worker or a
 * server tier in the middle. Typed as {@link CompareDataset} so a renamed dataset fails here rather
 * than as a 404 in six browsers.
 */
const DATASET: CompareDataset = 'books';

/** The dataset label in the destination header — the half `subtitle()` takes rather than looks up. */
const DATASET_LABEL = 'Books';

/**
 * The comparison page's query: the dataset, with no preset named.
 *
 * @remarks
 * Deliberately no `&preset=`. The page falls back to its first preset, and taking whatever it chose —
 * read back off `.fe-compare__state-value` — means this spec transports the state the PAGE produced
 * rather than a state it re-derived. A preset id here would be a second copy of `presets.ts`, and the
 * choice is not load-bearing: `presets.test.ts` loads every preset into a real engine over the real
 * corpus and requires a non-empty result, which is the property this spec depends on.
 */
const COMPARE_SEARCH = `?${DATASET_PARAM}=${DATASET}`;

/** The toggle currently showing — one per group. */
const COMPARE_TOGGLE_SELECTED = '.fe-compare__toggle--selected';

/**
 * How every count in this spec settles.
 *
 * @remarks
 * Playwright's own cadence rather than {@link settledCount}'s tighter 150 ms default, and the reason is
 * specific to what this file asserts: the count animates over ~600 ms, and a probe pair landing inside
 * that roll can agree on a meaningless intermediate frame. Everywhere else that costs one flaky
 * comparison against a local `before`; here it would produce a **cross-vertical mismatch** — the one
 * failure this spec exists to report — for a reason that has nothing to do with serialization.
 * `angular-books` and `vanilla-books` adopted this cadence for the same reason.
 *
 * `requirePositive` keeps its `true` default: every preset is gated non-empty by `presets.test.ts`, so
 * a settled zero here is a real failure rather than a state that happens to match nothing.
 */
const SETTLED: SettledCountOptions = { intervals: PLAYWRIGHT_POLL_INTERVALS, timeout: 25_000 };

/**
 * Per-test ceiling.
 *
 * @remarks
 * Above the config's 90s, because one test here is a comparison-page load PLUS a full cross-origin boot of
 * a second app PLUS a settle — and on the two slowest verticals those three add up past the default
 * with no margin. Set per test rather than in the config so the other 24 spec files keep the tighter
 * ceiling, which is what makes a hang there legible.
 */
const CLICK_THROUGH_TIMEOUT_MS = 120_000;

/**
 * Every vertical's settled count for the transported state, filled in by the per-vertical tests and
 * read by the parity test.
 *
 * @remarks
 * Module state shared across tests is normally a smell; here it is the point, and `.serial` is what
 * makes it sound — the tests run in order in one worker, and a failure stops the rest rather than
 * letting the parity test compare a half-filled map. It is also why the parity assertion checks the
 * SIZE first: run alone (a `--grep` on its title), it fails naming the empty map instead of passing
 * vacuously over zero counts.
 */
const reproducedCounts = new Map<VerticalId, number>();

test.describe.serial('the comparison page — one filter state, six stacks', () => {
	// Module state outlives a worker's first project. Playwright normally spawns a fresh worker per
	// project, so this is belt-and-braces — but a parity test that could compare six counts left behind
	// by the DESKTOP run while claiming to describe the mobile one would be a silent pass, and one line
	// removes the possibility rather than reasoning about it.
	test.beforeAll(() => {
		reproducedCounts.clear();
	});

	// The link TABLE — one row per serving vertical, right origins, right state — is asserted in
	// `compare-page.spec.ts`. Nothing is lost as an early signal for the chain below: `openComparePage`
	// already requires a non-empty state readout and rows on the local origins, and each click resolves
	// a row by the vertical's registry name, so a broken table fails on the first locator with the name
	// it could not find.

	for (const descriptor of verticalsServing(DATASET)) {
		const arrival = BOOKS_ARRIVAL[descriptor.id];

		test(`the ${descriptor.name} link opens its ${DATASET_ROUTES[DATASET]} with the state applied`, async ({ page }) => {
			test.setTimeout(CLICK_THROUGH_TIMEOUT_MS);

			await openComparePage(page, COMPARE_SEARCH);
			await page
				.locator(COMPARE_LIST)
				// `exact` because accessible-name matching is substring-by-default: a bare `React RTK`
				// would be fine, but `Vue` is a substring of nothing here only by luck, and the next
				// vertical added could easily collide.
				.getByRole('link', { exact: true, name: descriptor.name })
				.click();

			// The destination's own boot signal, from the registry rather than a literal — see
			// `./subtitles.ts` for why the specs never restate it.
			await expect(page.getByText(subtitle(DATASET_LABEL, descriptor.id, arrival.tier))).toBeVisible({
				timeout: arrival.bootTimeoutMs,
			});
			await expect(page.locator(RESULT_COUNT)).toBeVisible();

			// Read AFTER the boot: the click navigates immediately, but asserting then would race the
			// engine-to-URL sync that rewrites `?f=` once the destination hydrates.
			const landed = new URL(page.url());

			expect(landed.origin, 'the link should have left the comparison page origin').toBe(descriptor.devOrigin);
			expect(landed.pathname).toBe(DATASET_ROUTES[DATASET]);

			// The assertion that separates "the app booted" from "the app booted the state". Six apps
			// that all dropped `?f=` would agree on their counts perfectly.
			await expect(
				page.locator(ACTIVE_CHIP).first(),
				'the destination booted with no active-filter pill — the transported state was not applied',
			).toBeVisible();

			reproducedCounts.set(descriptor.id, await settledCount(page, SETTLED));
		});
	}

	test('every vertical reproduced the identical result set', () => {
		// `verticalsServing(DATASET)`, not `VERTICALS`: identical while DATASET is `books`, since all six
		// serve it, but the loop above iterates the serving set and this vacuity guard has to
		// count the same thing the loop produced — or a narrower dataset would make it demand counts
		// from verticals that were never visited.
		expect(
			reproducedCounts.size,
			'each vertical contributes one count — this test only means anything after the whole describe has run',
		).toBe(verticalsServing(DATASET).length);

		const summary = [...reproducedCounts].map(([id, count]) => `${id}: ${count}`).join(', ');

		expect(new Set(reproducedCounts.values()).size, `the six counts disagree — ${summary}`).toBe(1);
	});
});

/**
 * The comparison page's own affordances — no navigation, no engine, no corpus.
 *
 * @remarks
 * Its OWN describe, outside the serial group above, and that placement is deliberate twice over.
 * Inside it, this would queue behind six cross-origin engine boots to assert something about a
 * stylesheet; and a failure here would abort the serial chain, so one CSS regression would take the
 * portability run down with it and report the wrong thing as broken.
 *
 * `.fe-compare__toggle*` lives only in `@filter-enginez/ui-styles`, which the landing site's comparison
 * page loads like every app does, so this asserts the shared rules where they are actually rendered.
 */
test.describe('the comparison page — its own affordances', () => {
	test('hovering the SELECTED toggle enhances it rather than replacing it', async ({ page }, testInfo) => {
	// Hover is a pointer affordance and the mobile project has no pointer. Skipped rather than
	// asserted-and-hoped: Chromium under device emulation reports `hover: none`, so a pass here
	// would be measuring the emulator rather than the stylesheet.
		test.skip(isMobileProject(testInfo), 'hover is a pointer affordance; the mobile project has none');

		await openComparePage(page, COMPARE_SEARCH);

		// The dataset group specifically: the preset group has a selected toggle too, and an unscoped
		// locator would resolve to two elements and fail strict mode for a reason unrelated to styling.
		const selected = page.getByRole('group', { name: 'Dataset' }).locator(COMPARE_TOGGLE_SELECTED);

		await expect(selected).toHaveCount(1);

		const atRest = await selected.evaluate((element) => {
			const computed = getComputedStyle(element);

			return { border: computed.borderTopColor, shadow: computed.boxShadow };
		});

		expect(atRest.shadow, 'the resting selected toggle should carry no halo').toBe('none');

		await selected.hover();

		// **Both conditions in one poll, and that is the load-bearing detail.** Asserting the border
		// separately would pass on its FIRST read even against the bug this covers: at hover t=0 the
		// border is still mid-transition at its resting color, so a poll that succeeds immediately
		// reports health for a rule that is on its way to repainting the toggle gray. Requiring the
		// halo in the same poll means the check cannot resolve until hover has actually taken effect.
		//
		// The expected border is read off the page rather than written as an rgb literal — the point is
		// that hover does not CHANGE it, and naming a color would restate a token this test has no
		// business owning.
		await expect
			.poll(async () =>
				selected.evaluate((element) => {
					const computed = getComputedStyle(element);

					return { border: computed.borderTopColor, hasHalo: computed.boxShadow !== 'none' };
				}),
			)
			.toEqual({ border: atRest.border, hasHalo: true });
	});
});
