/**
 * An open-ended price keeps its result count across a reload and across Back / Forward, in every
 * vertical that serves `/wine`.
 *
 * @remarks
 * ## The failure this guards
 *
 * An open bound is `Infinity`, and JSON has no `Infinity`: `JSON.stringify` writes it as `null`, so
 * the `?f=` a filter writes carries `"max": null` for "no upper limit". If that `null` loads as `0`
 * (`75 <= null` is `false`), the route that decodes the link restores the filter, shows it as
 * applied, and matches nothing. Every unit gate can stay green over that: the engine's own suites
 * prove the revival, but only a browser proves that each vertical's reload path and Back / Forward
 * path decode through it. So both are driven here, against the real 150,000-wine worker tier.
 *
 * ## Two ways in, because the verticals reach an open bound differently
 *
 *   1. **The "Cellar picks" preset**, shared by all six (`examples-shared/src/wine/smartFilters.ts`):
 *      its expression holds `range('priceUsd', { min: 60, max: Infinity })`, so every vertical
 *      writes an open bound to `?f=`. Its count drops to the `>= 93 pts` subset if the bound loads as
 *      `0`, so the comparison is sharp.
 *   2. **Typing a lower price bound with the upper thumb at the top.** Every panel commits that
 *      through the shared `wineRangeRule`, which writes `max: Infinity` for a price thumb at the top
 *      of its track. The case asserts what the user sees as "$60 and up" survives the trip.
 *
 * ## Why this module takes a harness instead of importing `wineFlow.ts`
 *
 * `describeWineVertical` registers these cases, so importing its helpers back from here would be an
 * import cycle. The harness carries what the cases need from it, and nothing else.
 *
 * ## Cost
 *
 * Two cases per vertical and project, each booting the worker tier twice (navigation, then reload or
 * the Forward that reloads the document). Back / Forward between two DOCUMENTS reloads `/wine?f=…`
 * rather than restoring it from the back-forward cache, which Playwright's Chromium does not use, so
 * it is the decode path that runs, not a frozen page.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { APP_HUB_PATH, appHubLabel, BRAND_NAV_LABEL } from '../../packages/examples-shared/src/app-header/core.js';
import { ACTIVE_CHIP, rangeSliderByLabel, settledCount, type SettledCountOptions } from './filterFlow.js';
import { type VerticalId } from './subtitles.js';

/** What the open-range cases need from `describeWineVertical`. */
export interface OpenRangeHarness {
	/** The vertical's registry id, for its hub link's accessible name. */
	readonly id: VerticalId;
	/** Human label for the suite title, e.g. `'Vue'`. */
	readonly label: string;
	/** Reveal the filter controls; a no-op on desktop. */
	readonly openPanel: (page: Page, testInfo: TestInfo) => Promise<void>;
	/** The settle tempo of the worker tier. */
	readonly settled: SettledCountOptions;
	/** An absolute URL for a path in this vertical (the identity for the `baseURL` vertical). */
	readonly urlOf: (path: string) => string;
	/** Wait for the worker boot after a navigation, a reload or a history step. */
	readonly waitForBoot: (page: Page) => Promise<void>;
}

/** The preset whose expression holds an open price bound in every vertical. */
const OPEN_RANGE_PRESET = 'Cellar picks';

/** The price slider's visible label, matched exactly by `rangeSliderByLabel`. */
const PRICE_LABEL = 'Price (USD)';

/** A lower price bound inside every corpus tier's price range. */
const LOWER_PRICE = '60';

/**
 * The `?f=` the page carries right now, once the debounced engine → URL sync has written one.
 *
 * @param page - The page under test.
 * @returns The raw `f` parameter.
 */
async function writtenFilterParam(page: Page): Promise<string> {
	await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();

	return new URL(page.url()).searchParams.get('f') ?? '';
}

/**
 * Register the open-range round-trip cases for one vertical.
 *
 * @param harness - The vertical, and the helpers its suite already has.
 */
export function describeOpenRangeRoundTrips(harness: OpenRangeHarness): void {
	const { id, label, openPanel, settled, urlOf, waitForBoot } = harness;

	/**
	 * The count after a reload or a history step.
	 *
	 * `requirePositive: false` on purpose: the failure this suite exists for is a count of 0, and a
	 * positive-only settle would turn that into a timeout naming no number.
	 */
	const restoredCount = async (page: Page): Promise<number> => settledCount(page, { ...settled, requirePositive: false });

	/**
	 * Wait until the restored filter is on the engine: its one pill is showing.
	 *
	 * @remarks
	 * A route renders as soon as its engine boots and loads `?f=` into it alongside, and on the worker
	 * tier the load lands a round trip later. Until then the page shows the whole corpus with the
	 * engine idle, so a settled count read straight after the boot can be the unfiltered one. The pill
	 * and the count come from the same mirror refresh, so once the pill shows, the count that settles
	 * is the restored one. The same wait the URL round-trip case in `wineFlow.ts` makes.
	 */
	const expectRestored = async (page: Page): Promise<void> => {
		await expect(page.locator(ACTIVE_CHIP), 'the restored filter never reached the engine').toHaveCount(1);
	};

	/** The vertical's hub link, inside the header brand on every viewport. */
	const hubLink = (page: Page): Locator => page
		.getByRole('navigation', { exact: true, name: BRAND_NAV_LABEL })
		.getByRole('link', { exact: true, name: appHubLabel(id) });

	test.describe(`${label} wine app — an open-ended price survives the URL`, () => {
		test('"Cellar picks" keeps its count across a reload, then Back and Forward', async ({ page }, testInfo) => {
			// Two DOCUMENTS in the history, so Back leaves `/wine` and Forward loads `/wine?f=…` afresh:
			// the hub first, then the route, each by navigation.
			await page.goto(urlOf(APP_HUB_PATH));
			await page.goto(urlOf('/wine'));
			await waitForBoot(page);

			await openPanel(page, testInfo);
			const preset = page.getByRole('button', { name: OPEN_RANGE_PRESET });

			await preset.click();
			await expect(preset).toHaveAttribute('aria-pressed', 'true');
			const applied = await settledCount(page, settled);
			const written = await writtenFilterParam(page);

			await page.reload();
			await waitForBoot(page);
			await expectRestored(page);
			expect(await restoredCount(page), 'the reload restored the preset but not its matches').toBe(applied);

			await page.goBack();
			await page.waitForURL(urlOf(APP_HUB_PATH));
			await page.goForward();
			await waitForBoot(page);
			expect(new URL(page.url()).searchParams.get('f')).toBe(written);
			await expectRestored(page);
			expect(await restoredCount(page), 'Back then Forward restored the preset but not its matches').toBe(applied);

			// The preset chip must light from the restored expression too, not only the count.
			await openPanel(page, testInfo);
			await expect(page.getByRole('button', { name: OPEN_RANGE_PRESET })).toHaveAttribute('aria-pressed', 'true');
		});

		test('a typed lower price with the upper thumb at the top keeps its count across a reload and an in-app Back', async ({ page }, testInfo) => {
			await page.goto(urlOf('/wine'));
			await waitForBoot(page);
			const unfiltered = await settledCount(page, settled);

			await openPanel(page, testInfo);
			// The editable bound field by its accessible name, which all six panels build the same way
			// (`<label> lower bound (editable)`), scoped to the price slider. Typing then Enter commits in
			// every panel: React, SvelteKit, Vue and vanilla commit on the keydown, Angular blurs on it and
			// commits on the blur. The parser strips the `$` and `,` the readout adds, so plain digits
			// commit. The upper thumb is untouched, so it sits at the top and the rule's maximum is
			// `Infinity`.
			const lower = rangeSliderByLabel(page, PRICE_LABEL).getByRole('textbox', {
				exact: true,
				name: `${PRICE_LABEL} lower bound (editable)`,
			});

			await lower.fill(LOWER_PRICE);
			await lower.press('Enter');
			// The active-filter pill is the commit signal, as in the facet cases: it appears once the rule
			// is in the engine.
			await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();
			const applied = await settledCount(page, settled);

			expect(applied).toBeLessThan(unfiltered);
			const written = await writtenFilterParam(page);

			await page.reload();
			await waitForBoot(page);
			await expectRestored(page);
			expect(await restoredCount(page), 'the reload restored the price filter but not its matches').toBe(applied);

			// An in-app navigation and Back: a client-side route change in five of the six, then the
			// route's own decode on the way back.
			await hubLink(page).click();
			await page.waitForURL(urlOf(APP_HUB_PATH));
			await page.goBack();
			await waitForBoot(page);
			expect(new URL(page.url()).searchParams.get('f')).toBe(written);
			await expectRestored(page);
			expect(await restoredCount(page), 'Back restored the price filter but not its matches').toBe(applied);
		});
	});
}
