/**
 * The `/real-estate` cases every app must answer identically, registered by each app's real-estate
 * spec.
 *
 * @remarks
 * ## What this guards
 *
 * Six real-estate panels bind the same shared cores as the other datasets — `clearAllFilters`, the
 * typeahead controller, `RESULT_COPY` — plus two rules of their own: deselecting the last chip or
 * checkbox value REMOVES the rule (an empty set would match nothing), and the location tree and the
 * listed-date presets carry the accessible group names `REAL_ESTATE_*` declares. A panel that binds
 * one of those differently passes its own unit suite and differs only here.
 *
 * ## Shared, not per app
 *
 * Each app's own real-estate spec keeps what is particular to it and calls
 * {@link describeRealEstateParity} once.
 *
 * @packageDocumentation
 */

import { expect, type Locator, type Page, test } from '@playwright/test';

import {
	REAL_ESTATE_DESCRIPTION_SEARCH,
	REAL_ESTATE_LISTED_DATE_LABEL,
	REAL_ESTATE_LOCATION_TREE,
} from '../../packages/examples-shared/src/real-estate/real-estate-domain/panelCopy.js';
import { TYPEAHEAD_DEBOUNCE_MS } from '../../packages/examples-shared/src/search/typeaheadController.js';
import {
	ACTION_LOG_LABELS,
	actionLogLabels,
	actionLogRowsAddedBy,
	ACTIVE_CHIP,
	appUrl,
	chipLabelWithoutCount,
	clickFirstFacetChip,
	expectFilterCollapseKeepsState,
	expectResultsColumnCopy,
	FACET_CHIP,
	installBusyRecorder,
	isMobileProject,
	literalPattern,
	openActionLog,
	openFilterPanel,
	panelSection,
	readBusyRecord,
	RESULT_COUNT,
	revisitThroughHub,
	settledCount,
	SHARED_CONTROL_NAMES,
	sharedRuleIds,
	TOGGLEABLE_CHIP,
	undoByKeyboardAndButton,
} from './filterFlow.js';
import { subtitle, type VerticalId } from './subtitles.js';

/** The real-estate route. */
const REAL_ESTATE_PATH = '/real-estate';

/**
 * The longest any app's real-estate boot may take: Angular's resolver pulls the corpus over HTTP
 * before the page exists, so it sets the budget for all six.
 */
const BOOT_TIMEOUT_MS = 45_000;

/** The property-type chips' section heading and rule id in `?f=`. */
const PROPERTY_TYPE = { heading: 'Property type', ruleId: 'property-type' } as const;

/** The school-district checkbox list's section heading and rule id in `?f=`. */
const SCHOOL_DISTRICT = { heading: 'School district', ruleId: 'school-district' } as const;

/** What one app's real-estate spec hands the shared cases. */
export interface RealEstateParitySpec {
	/** The app's registry id. */
	readonly id: VerticalId;
	/** Human label for the suite title, e.g. `'Vue'`. */
	readonly label: string;
}

/**
 * Wait for an app's `/real-estate` to boot: its own header subtitle, then the result count.
 *
 * @param page - The page under test.
 * @param id - The app.
 */
async function waitForRealEstateBoot(page: Page, id: VerticalId): Promise<void> {
	await expect(page.getByText(subtitle('Real estate', id))).toBeVisible({ timeout: BOOT_TIMEOUT_MS });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/**
 * A settled count that may be any value, including zero.
 *
 * @param page - The page under test.
 * @returns The settled count.
 */
async function settle(page: Page): Promise<number> {
	return settledCount(page, { requirePositive: false });
}

/**
 * The description search field, by the accessible name every panel gives it.
 *
 * @param page - The page under test.
 * @returns The field.
 */
function descriptionField(page: Page): Locator {
	return page.getByRole('searchbox', { exact: true, name: REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel });
}

/**
 * Register the shared real-estate cases for one app.
 *
 * @param spec - The app.
 */
export function describeRealEstateParity(spec: RealEstateParitySpec): void {
	const { id, label } = spec;

	test.describe(`${label} real-estate app — parity with the other five apps`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(appUrl(id, REAL_ESTATE_PATH));
			await waitForRealEstateBoot(page, id);
		});

		test('Clear all over two facets logs ONE clearRules, and ONE Undo restores every pill', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			const log = await openActionLog(page);

			await clickFirstFacetChip(page, panelSection(page, PROPERTY_TYPE.heading).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await clickFirstFacetChip(page, page.getByRole('group', { exact: true, name: REAL_ESTATE_LISTED_DATE_LABEL }).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);
			const narrowed = await settle(page);

			const added = await actionLogRowsAddedBy(log, async () => {
				await page.getByRole('button', { exact: true, name: 'Clear all' }).click();
				await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
				await settle(page);
			});

			expect(added).toEqual([ACTION_LOG_LABELS.cleared]);

			await page.getByRole('button', { exact: true, name: SHARED_CONTROL_NAMES.undo }).click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);
			expect(await settle(page)).toBe(narrowed);
		});

		test('Cmd/Ctrl+Z marks the engine busy exactly as the Undo button does', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await clickFirstFacetChip(page, panelSection(page, PROPERTY_TYPE.heading).locator(TOGGLEABLE_CHIP));

			const marks = await undoByKeyboardAndButton(page, settle);

			expect(marks.keyboard.hasIndicatorComputed, 'the keyboard undo never lit the computing indicator').toBe(true);
			expect(marks.keyboard).toEqual(marks.button);
		});

		test('deselecting the only property type removes the rule: no pill, nothing in ?f=, a removal in the log', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			const log = await openActionLog(page);
			const section = panelSection(page, PROPERTY_TYPE.heading);
			const chipName = await chipLabelWithoutCount(section.locator(TOGGLEABLE_CHIP).first());

			await clickFirstFacetChip(page, section.locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).toContain(PROPERTY_TYPE.ruleId);

			await clickFirstFacetChip(page, section.locator('.fe-chip--selected').filter({ hasText: chipName }));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			await settle(page);

			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).not.toContain(PROPERTY_TYPE.ruleId);
			expect((await actionLogLabels(log)).at(-1)).toBe(ACTION_LOG_LABELS.removed);
		});

		test('unchecking the only school district removes the rule: no pill, nothing in ?f=, a removal in the log', async ({ page }, testInfo) => {
			const section = panelSection(page, SCHOOL_DISTRICT.heading);

			await openFilterPanel(page, testInfo, section.locator('input[type="checkbox"]').first());
			const log = await openActionLog(page);
			// Addressed by its label text, which the count beside it does not change.
			const districtName = (await section.locator('.fe-checkbox-list__label').first().textContent())?.trim() ?? '';
			const district = section.locator('.fe-checkbox-list__row').filter({
				has: page.locator('.fe-checkbox-list__label', { hasText: new RegExp(`^${literalPattern(districtName)}$`, 'u') }),
			}).locator('input[type="checkbox"]');

			expect(districtName, 'the school-district list rendered no rows').not.toBe('');

			await district.check();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).toContain(SCHOOL_DISTRICT.ruleId);

			await district.uncheck();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			await settle(page);

			await expect.poll(() => sharedRuleIds(page), { timeout: 5_000 }).not.toContain(SCHOOL_DISTRICT.ruleId);
			expect((await actionLogLabels(log)).at(-1)).toBe(ACTION_LOG_LABELS.removed);
		});

		test('typing a description filters with no blur, and Enter then a blur logs ONE action', async ({ page }, testInfo) => {
			const description = descriptionField(page);

			await openFilterPanel(page, testInfo, description);
			const log = await openActionLog(page);

			await description.click();
			await description.pressSequentially('waterfront', { delay: 40 });
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect(description).toBeFocused();
			await settle(page);

			const added = await actionLogRowsAddedBy(log, async () => {
				await description.fill('remodeled');
				await description.press('Enter');
				await description.blur();
				await settle(page);
			});

			expect(added).toHaveLength(1);
		});

		test('tabbing through an untouched search writes nothing and marks nothing busy', async ({ page }, testInfo) => {
			const description = descriptionField(page);

			await openFilterPanel(page, testInfo, description);
			const log = await openActionLog(page);

			await settle(page);
			const rowsBefore = (await actionLogLabels(log)).length;

			await installBusyRecorder(page);
			await description.focus();
			await page.keyboard.press('Tab');
			await page.waitForTimeout(TYPEAHEAD_DEBOUNCE_MS * 4);

			expect(await readBusyRecord(page)).toEqual({ hasBodyBeenAriaBusy: false, hasBodyBeenBusyClass: false, hasIndicatorComputed: false });
			expect(await actionLogLabels(log)).toHaveLength(rowsBefore);
		});

		test('the location tree, the listed-date presets and the results column read the shared copy', async ({ page }, testInfo) => {
			const count = await settle(page);

			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());

			await expect(page.getByRole('group', { exact: true, name: REAL_ESTATE_LOCATION_TREE.groupLabel })).toBeVisible();

			const presets = page.getByRole('group', { exact: true, name: REAL_ESTATE_LISTED_DATE_LABEL }).getByRole('button');

			expect(await presets.count()).toBeGreaterThan(1);
			// Every preset is a toggle, and exactly one ("Any time") is pressed with no date rule set.
			for (const preset of await presets.all()) {
				await expect(preset).toHaveAttribute('aria-pressed', /^(?:true|false)$/u);
			}
			await expect(page.getByRole('group', { exact: true, name: REAL_ESTATE_LISTED_DATE_LABEL }).locator('[aria-pressed="true"]')).toHaveCount(1);

			await expectResultsColumnCopy(page, 'real-estate', count);
		});

		test('after the hub and back by in-app links, the panel still filters', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await clickFirstFacetChip(page, panelSection(page, PROPERTY_TYPE.heading).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);

			await revisitThroughHub(page, id, REAL_ESTATE_PATH, async (revisited) => waitForRealEstateBoot(revisited, id));
			const before = await settle(page);

			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await clickFirstFacetChip(page, panelSection(page, PROPERTY_TYPE.heading).locator(TOGGLEABLE_CHIP));

			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
			expect(await settle(page)).not.toBe(before);
		});

		test('mobile: the "Filters" toggle shows and hides the panel, which keeps a half-typed search', async ({ page }, testInfo) => {
			test.skip(!isMobileProject(testInfo), 'The toggle only exists below the two-column breakpoint.');

			await expectFilterCollapseKeepsState(page, descriptionField(page), 'cul-de-sac');
		});
	});
}
