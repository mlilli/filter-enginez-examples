/**
 * The wine cases every app must answer identically: one Clear all in the action log, busy marks for
 * every write, search timing, typed slider bounds, the shared copy, and a route rebuilt after a trip
 * to the hub.
 *
 * @remarks
 * ## What this guards
 *
 * Six apps render the wine route in five idioms over one set of shared cores (`clearAllWineFilters`,
 * `createTypeaheadController`, `resolveTypedBound`, `RESULT_COPY`, `WINE_SLIDER_COPY`, …). A core
 * that one app binds differently passes that app's unit suite and differs only in a browser: a Clear
 * all that removes rules one by one (N log rows and N Undo steps instead of one), a keyboard undo that
 * skips the busy mark, a search that waits for a blur, a typed bound that commits junk. Each case
 * below pins one of those, against the real 150,000-wine worker tier, where every write lands a round
 * trip after the gesture.
 *
 * ## Words and ids
 *
 * The labels, names and option orders are the shared modules' own (`panelCopy.ts`, `filterConfig.ts`,
 * `ruleSummaries.ts`). Those modules import `@filter-enginez/core`, which Node resolves from
 * `examples-shared`'s own dependencies and Playwright loads as built JavaScript, so the cases read the
 * strings the apps render rather than a second copy of them. The rule ids (`color`, `points`) are the
 * `?f=` link contract, the same in every app.
 *
 * ## Why this module takes a harness instead of importing `wineFlow.ts`
 *
 * `describeWineVertical` registers these cases, so importing its helpers back from here would be an
 * import cycle — the same reason `wineOpenRange.ts` takes one.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';

import { TYPEAHEAD_DEBOUNCE_MS } from '../../packages/examples-shared/src/search/typeaheadController.js';
import { BODY_ORDER, COLOR_ORDER, WINE_SLIDER_TEXT } from '../../packages/examples-shared/src/wine/wine-domain/filterConfig.js';
import { WINE_ORIGIN_TREE, WINE_SEARCHES, WINE_SLIDER_COPY, wineSearchRule } from '../../packages/examples-shared/src/wine/wine-domain/panelCopy.js';
import { buildWineFilterSummaries } from '../../packages/examples-shared/src/wine/wine-domain/ruleSummaries.js';
import {
	ACTION_LOG_LABELS,
	actionLogLabels,
	actionLogRowsAddedBy,
	ACTIVE_CHIP,
	chipLabelWithoutCount,
	clickFirstFacetChip,
	expectEmptyResults,
	expectResultsColumnCopy,
	INERT_PANEL_BODY,
	installBusyRecorder,
	openActionLog,
	PANEL_BODY,
	panelSection,
	pillByLabel,
	rangeSliderByLabel,
	readBusyRecord,
	readSharedConfig,
	revisitThroughHub,
	settledCount,
	type SettledCountOptions,
	SHARED_CONTROL_NAMES,
	type SharedConfig,
	sharedRuleIds,
	TOGGLEABLE_CHIP,
	undoByKeyboardAndButton,
	urlWithSharedConfig,
} from './filterFlow.js';
import { type VerticalId } from './subtitles.js';

/** What the parity cases need from `describeWineVertical`. */
export interface WineParityHarness {
	/** Navigate to the vertical's `/wine` and wait for the worker boot. */
	readonly boot: (page: Page) => Promise<void>;
	/** The vertical's registry id, for its origin, hub link and hub card. */
	readonly id: VerticalId;
	/** Human label for the suite title, e.g. `'Vue'`. */
	readonly label: string;
	/** Reveal the filter controls; a no-op on desktop. */
	readonly openPanel: (page: Page, testInfo: TestInfo) => Promise<void>;
	/** The settle tempo of the worker tier. */
	readonly settled: SettledCountOptions;
	/** Wait for the worker boot after a reload or an in-app navigation. */
	readonly waitForBoot: (page: Page) => Promise<void>;
}

/** The wine route. */
const WINE_PATH = '/wine';

/** The two chip facets the Clear-all case sets, by section heading. */
const COLOR_HEADING = 'Color';

/** See {@link COLOR_HEADING}. */
const BODY_HEADING = 'Body';

/** The color chips' rule id in `?f=`. */
const COLOR_RULE_ID = 'color';

/** The points slider's rule id in `?f=`. */
const POINTS_RULE_ID = 'points';

/** The single-color menu's accessible name, the same in all six panels. */
const SINGLE_COLOR_MENU = 'Filter by exact wine color';

/** The varietal heading carries the vocabulary size: `Varietal (612)`. */
const VARIETAL_HEADING = /^Varietal \(\d+\)$/u;

/** The preset whose restored leaves, left behind, would match nothing. */
const OR_PRESET = 'Pinot';

/** The tasting-notes pill's label, from the shared summarizer applied to the rule the panel writes. */
const NOTES_PILL_LABEL = buildWineFilterSummaries(new Map([['notes', wineSearchRule('notes', 'cherry')]]), false)[0]?.label ?? '';

/**
 * The tasting-notes search field, by the accessible name every panel gives it.
 *
 * @param page - The page under test.
 * @returns The field.
 */
export function wineNotesField(page: Page): Locator {
	return page.getByRole('searchbox', { exact: true, name: WINE_SEARCHES.notes.ariaLabel });
}

/**
 * One slider's editable bound field.
 *
 * @param page - The page under test.
 * @param slider - Which slider's copy.
 * @param side - Which bound.
 * @returns The field, named `<label> lower bound (editable)` or `… upper bound (editable)`.
 */
function boundField(page: Page, slider: keyof typeof WINE_SLIDER_COPY, side: 'lower' | 'upper'): Locator {
	const { label } = WINE_SLIDER_COPY[slider];

	return rangeSliderByLabel(page, label).getByRole('textbox', { exact: true, name: `${label} ${side} bound (editable)` });
}

/**
 * One slider thumb.
 *
 * @param page - The page under test.
 * @param slider - Which slider's copy.
 * @param side - Which thumb.
 * @returns The thumb, named `<sliderLabel> lower bound` or `… upper bound`.
 */
function thumb(page: Page, slider: keyof typeof WINE_SLIDER_COPY, side: 'lower' | 'upper'): Locator {
	return page.getByRole('slider', { exact: true, name: `${WINE_SLIDER_COPY[slider].sliderLabel} ${side} bound` });
}

/**
 * The points rule's lower bound in `?f=`, or `null` when the link carries no points rule.
 *
 * @param page - The page under test.
 * @returns The committed minimum.
 */
function sharedPointsMin(page: Page): unknown {
	return readSharedConfig(page)?.rules.find((entry) => entry.id === POINTS_RULE_ID)?.rule.config?.['min'] ?? null;
}

/**
 * Register the wine parity cases for one vertical.
 *
 * @param harness - The vertical, and the helpers its suite already has.
 */
export function describeWineParity(harness: WineParityHarness): void {
	const { boot, id, label, openPanel, settled, waitForBoot } = harness;

	/** A settled count that may be any value, including zero and the full corpus. */
	const settle = async (page: Page): Promise<number> => settledCount(page, { ...settled, requirePositive: false });

	test.describe(`${label} wine app — parity with the other five apps`, () => {
		test.beforeEach(async ({ page }) => {
			await boot(page);
		});

		test('Clear all over two facets logs ONE clearRules, and ONE Undo restores every pill', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			const log = await openActionLog(page);

			await clickFirstFacetChip(page, panelSection(page, COLOR_HEADING).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await clickFirstFacetChip(page, panelSection(page, BODY_HEADING).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);
			const narrowed = await settle(page);

			const added = await actionLogRowsAddedBy(log, async () => {
				await page.getByRole('button', { exact: true, name: 'Clear all' }).click();
				await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
				await settle(page);
			});

			// One engine call, not one removal per rule: the shared `clearAllWineFilters`.
			expect(added).toEqual([ACTION_LOG_LABELS.cleared]);

			await page.getByRole('button', { exact: true, name: SHARED_CONTROL_NAMES.undo }).click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);
			expect(await settle(page)).toBe(narrowed);
		});

		test('Cmd/Ctrl+Z marks the engine busy exactly as the Undo button does', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);

			const marks = await undoByKeyboardAndButton(page, settle);

			expect(marks.keyboard.hasIndicatorComputed, 'the keyboard undo never lit the computing indicator').toBe(true);
			expect(marks.keyboard).toEqual(marks.button);
		});

		test('deselecting the only color chip removes the rule: no pill, no color in ?f=, a removal in the log', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			const log = await openActionLog(page);
			const colorSection = panelSection(page, COLOR_HEADING);
			// Read without its count badge, which the chip drops once selected.
			const chipName = await chipLabelWithoutCount(colorSection.locator(TOGGLEABLE_CHIP).first());

			await clickFirstFacetChip(page, colorSection.locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).toContain(COLOR_RULE_ID);

			await clickFirstFacetChip(page, colorSection.locator('.fe-chip--selected').filter({ hasText: chipName }));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			await settle(page);

			// Removed, never left behind as an empty set that matches nothing.
			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).not.toContain(COLOR_RULE_ID);
			expect((await actionLogLabels(log)).at(-1)).toBe(ACTION_LOG_LABELS.removed);
		});

		test('a preset restored from a link whose inline rules carry no marker clears back to the full corpus', async ({ page }, testInfo) => {
			// The engine marks an expression's inline rules `inline: true` in `?f=`; a link written before
			// that marker existed carries the same rules without it. Such a link is built here from a live
			// one, so it holds exactly what the current export holds minus the marker.
			const full = await settle(page);

			await openPanel(page, testInfo);
			await page.getByRole('button', { exact: true, name: OR_PRESET }).click();
			await expect(page.getByRole('button', { exact: true, name: OR_PRESET })).toHaveAttribute('aria-pressed', 'true');
			await expect.poll(() => readSharedConfig(page)?.expression ?? null, { timeout: 5_000 }).not.toBeNull();

			const config = readSharedConfig(page);

			if (config === null) {
				throw new Error('the preset wrote no ?f=');
			}
			expect(config.rules.some((entry) => entry.inline === true), 'the live link marks no inline rule, so there is nothing to strip').toBe(true);

			const unmarked: SharedConfig = { ...config, rules: config.rules.map(({ id: ruleId, rule }) => ({ id: ruleId, rule })) };

			await page.goto(urlWithSharedConfig(page, unmarked));
			await waitForBoot(page);
			await openPanel(page, testInfo);
			await expect(page.getByRole('button', { exact: true, name: OR_PRESET })).toHaveAttribute('aria-pressed', 'true');
			await page.getByRole('button', { exact: true, name: 'Clear smart filters' }).click();

			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await settle(page)).toBe(full);
		});

		test('typing tasting notes filters with no blur, and Enter then a blur logs ONE action', async ({ page }, testInfo) => {
			const notes = wineNotesField(page);

			await openPanel(page, testInfo);
			const log = await openActionLog(page);

			await notes.click();
			await notes.pressSequentially('cherry', { delay: 40 });
			// The debounced commit lands while the field still has focus.
			await expect(pillByLabel(page, NOTES_PILL_LABEL)).toHaveCount(1);
			await expect(notes).toBeFocused();
			await settle(page);

			const added = await actionLogRowsAddedBy(log, async () => {
				await notes.fill('oak');
				await notes.press('Enter');
				await notes.blur();
				await settle(page);
			});

			// Enter flushes the query; the blur that follows finds nothing new to write.
			expect(added).toHaveLength(1);
		});

		test('tabbing through an untouched search writes nothing and marks nothing busy', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			const log = await openActionLog(page);
			const winery = page.getByRole('searchbox', { exact: true, name: WINE_SEARCHES.winery.ariaLabel });

			await settle(page);
			const rowsBefore = (await actionLogLabels(log)).length;

			await installBusyRecorder(page);
			await winery.focus();
			await page.keyboard.press('Tab');
			// Long enough for a debounced commit to have landed, had the blur armed one.
			await page.waitForTimeout(TYPEAHEAD_DEBOUNCE_MS * 4);

			expect(await readBusyRecord(page)).toEqual({ hasBodyBeenAriaBusy: false, hasBodyBeenBusyClass: false, hasIndicatorComputed: false });
			expect(await actionLogLabels(log)).toHaveLength(rowsBefore);
		});

		test('slider thumbs and bound fields carry the shared names; junk and Escape write nothing; a typed bound snaps', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);

			for (const slider of Object.keys(WINE_SLIDER_COPY) as (keyof typeof WINE_SLIDER_COPY)[]) {
				await expect(thumb(page, slider, 'lower'), `${slider}: lower thumb name`).toHaveCount(1);
				await expect(thumb(page, slider, 'upper'), `${slider}: upper thumb name`).toHaveCount(1);
			}

			const lower = boundField(page, 'points', 'lower');
			const committed = await lower.inputValue();

			await lower.fill('not a number');
			await lower.blur();
			await expect(lower, 'junk must put the committed bound back').toHaveValue(committed);

			await lower.fill(WINE_SLIDER_TEXT.points.format(95));
			await lower.press('Escape');
			await expect(lower, 'Escape must put the committed bound back').toHaveValue(committed);
			await lower.blur();
			await settle(page);
			expect(sharedRuleIds(page), 'junk or Escape wrote a rule').toEqual([]);
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);

			// Points step by 1, so 90.5 snaps to 91 — the field shows it and the link carries it.
			await lower.fill('90.5');
			await lower.press('Enter');
			await expect(lower).toHaveValue(WINE_SLIDER_TEXT.points.format(91));
			await expect.poll(() => sharedPointsMin(page), { timeout: 5_000 }).toBe(91);
		});

		test('PageUp moves no thumb; Shift+ArrowRight moves exactly one step', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);

			const lowerThumb = thumb(page, 'points', 'lower');
			const start = Number.parseFloat((await lowerThumb.getAttribute('aria-valuetext')) ?? '');

			expect(Number.isFinite(start), 'the points thumb reports no value').toBe(true);

			await lowerThumb.focus();
			await lowerThumb.press('PageUp');
			await settle(page);
			await expect(lowerThumb).toHaveAttribute('aria-valuetext', WINE_SLIDER_TEXT.points.format(start));
			expect(sharedRuleIds(page), 'PageUp wrote a rule').toEqual([]);

			await lowerThumb.press('Shift+ArrowRight');
			await expect(lowerThumb).toHaveAttribute('aria-valuetext', WINE_SLIDER_TEXT.points.format(start + 1));
		});

		test('a chip click marks the panel body busy and lights the indicator until the engine settles', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			await expect(page.locator(INERT_PANEL_BODY)).toHaveCount(0);
			await installBusyRecorder(page);

			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await settle(page);

			expect(await readBusyRecord(page)).toEqual({ hasBodyBeenAriaBusy: true, hasBodyBeenBusyClass: true, hasIndicatorComputed: true });
			await expect(page.locator(PANEL_BODY).first()).not.toHaveAttribute('aria-busy', 'true');
			await expect(page.locator(INERT_PANEL_BODY)).toHaveCount(0);
		});

		test('the panel and the results column read the shared copy', async ({ page }, testInfo) => {
			const count = await settle(page);

			await openPanel(page, testInfo);

			await expect(page.getByRole('group', { exact: true, name: WINE_ORIGIN_TREE.groupLabel })).toBeVisible();

			// Varietal: chips under a counted heading — no checkboxes, no per-chip counts.
			const varietal = panelSection(page, VARIETAL_HEADING);

			await expect(varietal.locator('.fe-chip').first()).toBeVisible();
			await expect(varietal.locator('input[type="checkbox"]')).toHaveCount(0);
			await expect(varietal.locator('.fe-chip__count')).toHaveCount(0);

			// Body chips read the raw vocabulary values, in design order.
			const bodyLabels = (await panelSection(page, BODY_HEADING).locator('.fe-chip').allTextContents()).map((text) => text.trim());

			expect(bodyLabels.length).toBeGreaterThan(0);
			expect(bodyLabels).toEqual(BODY_ORDER.filter((value) => bodyLabels.includes(value)));

			// The color chips and the single-color menu list the same colors, in design order.
			const colorChips = panelSection(page, COLOR_HEADING).locator('.fe-chip');
			const colorLabels = await Promise.all((await colorChips.all()).map(async (chip) => chipLabelWithoutCount(chip)));
			const menuOptions = (await page.getByRole('combobox', { exact: true, name: SINGLE_COLOR_MENU }).locator('option').evaluateAll<string[], undefined, HTMLOptionElement>((options) => options.map((option) => option.value))).filter((value) => value !== '');

			expect(colorLabels).toEqual(COLOR_ORDER.filter((value) => colorLabels.includes(value)));
			expect(menuOptions).toEqual(colorLabels);

			await expectResultsColumnCopy(page, 'wine', count);
		});

		test('red AND exactly white matches nothing, and the results column says so in the shared words', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			await clickFirstFacetChip(page, panelSection(page, COLOR_HEADING).locator(TOGGLEABLE_CHIP).filter({ hasText: /^red/u }));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await page.getByRole('combobox', { exact: true, name: SINGLE_COLOR_MENU }).selectOption('white');
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);

			expect(await settle(page)).toBe(0);
			await expectEmptyResults(page, 'wine');
		});

		test('after the hub and back by in-app links, the panel still filters', async ({ page }, testInfo) => {
			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);

			await revisitThroughHub(page, id, WINE_PATH, waitForBoot);
			const before = await settle(page);

			await openPanel(page, testInfo);
			await clickFirstFacetChip(page);

			// The rebuilt route is wired to a live engine: the click reaches the count and the pills.
			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
			expect(await settle(page)).not.toBe(before);
		});
	});
}
