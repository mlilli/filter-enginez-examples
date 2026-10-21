/**
 * A smart-filter preset REPLACES the manual filters, and leaving it lands in a neutral panel, in every
 * vertical that serves `/wine`.
 *
 * @remarks
 * ## The failure this guards
 *
 * The engine ignores flat rules while an expression is set, so a preset applied on top of a manual
 * filter shows the preset's own count whether or not the manual rule was removed. What differs is
 * what happens around it: a manual rule left in place stays lit in its (locked) section, rides along
 * in `?f=`, and starts filtering again the moment the preset is cleared. Every vertical's preset row
 * writes through the shared `commitSmartFilterSelection`, which removes the flat rules first; this
 * suite asserts the consequence of that in the browser, against the real 150,000-wine worker tier,
 * where the removal and the expression land a round trip after the click.
 *
 * ## The second case: a RESTORED preset
 *
 * Restoring an expression from `?f=` registers its leaves as flat rules under minted ids. Left in
 * place, they would start filtering the moment the preset is cleared, with no pill and no control on
 * screen to explain it; "Pinot" is an OR of two varietals, so its leaves ANDed together match nothing.
 * Leaving a preset goes through the shared `exitExpressionMode`, which drops them, and the case pins
 * that across a real reload.
 *
 * ## Why this module takes a harness instead of importing `wineFlow.ts`
 *
 * `describeWineVertical` registers these cases, so importing its helpers back from here would be an
 * import cycle — the same reason `wineOpenRange.ts` takes one.
 *
 * Every click here is a PANEL control. At phone width the panel is an inline collapse above the
 * results, so the count and the pills below it are read without closing anything.
 *
 * @packageDocumentation
 */

import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { ACTIVE_CHIP, chipLabelWithoutCount, clickFirstFacetChip, FACET_CHIP, settledCount, type SettledCountOptions } from './filterFlow.js';

/** What the preset-takeover cases need from `describeWineVertical`. */
export interface PresetTakeoverHarness {
	/** Navigate to the vertical's `/wine` and wait for the worker boot. */
	readonly boot: (page: Page) => Promise<void>;
	/** Human label for the suite title, e.g. `'Vue'`. */
	readonly label: string;
	/** Reveal the filter controls; a no-op on desktop. */
	readonly openPanel: (page: Page, testInfo: TestInfo) => Promise<void>;
	/** The settle tempo of the worker tier. */
	readonly settled: SettledCountOptions;
	/** Wait for the worker boot after a reload. */
	readonly waitForBoot: (page: Page) => Promise<void>;
}

/** A lit facet chip in the panel body, as opposed to a lit preset above it. */
const SELECTED_FACET_CHIP = '.fe-filter-panel__body .fe-chip--selected';

/** The label of the synthetic results-header pill a preset shows instead of the flat-rule pills. */
const SMART_FILTER_PILL_LABEL = 'Smart filter';

/**
 * Register the preset-takeover cases for one vertical.
 *
 * @param harness - The vertical, and the helpers its suite already has.
 */
export function describePresetTakeover(harness: PresetTakeoverHarness): void {
	const { boot, label, openPanel, settled, waitForBoot } = harness;

	/** A count that may legitimately be any value, including the full corpus. */
	const countNow = async (page: Page): Promise<number> => settledCount(page, { ...settled, requirePositive: false });

	test.describe(`${label} wine app — a smart-filter preset replaces the manual filters`, () => {
		test.beforeEach(async ({ page }) => {
			await boot(page);
		});

		test('a preset applied over a manual filter leaves only the preset, and clearing it leaves nothing', async ({ page }, testInfo) => {
			const full = await countNow(page);

			await openPanel(page, testInfo);

			// The preset's count on its own, from a clean panel: what the takeover must match.
			const preset = page.getByRole('button', { exact: true, name: 'Bold reds' });
			const clearSmartFilters = page.getByRole('button', { exact: true, name: 'Clear smart filters' });

			await preset.click();
			await expect(preset).toHaveAttribute('aria-pressed', 'true');
			const presetAlone = await settledCount(page, settled);

			expect(presetAlone).toBeLessThan(full);
			await clearSmartFilters.click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await countNow(page)).toBe(full);

			// A manual filter first, then the preset on top of it.
			const facetLabel = await chipLabelWithoutCount(page.locator(FACET_CHIP).first());

			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect(page.locator(SELECTED_FACET_CHIP).filter({ hasText: facetLabel }).first()).toBeVisible();
			expect(await settledCount(page, settled)).toBeLessThan(full);

			await preset.click();
			await expect(preset).toHaveAttribute('aria-pressed', 'true');

			// The manual filter's pill is gone; the one pill left is the preset's.
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect(page.locator(ACTIVE_CHIP).first()).toContainText(SMART_FILTER_PILL_LABEL);
			// Its section let go of it too, rather than holding it lit behind the lock.
			await expect(page.locator(SELECTED_FACET_CHIP)).toHaveCount(0);
			expect(await settledCount(page, settled)).toBe(presetAlone);

			// And it does not come back: the manual filter was replaced, not paused.
			await clearSmartFilters.click();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await countNow(page)).toBe(full);
		});

		test('clearing a preset restored from ?f= returns the full corpus', async ({ page }, testInfo) => {
			const full = await countNow(page);

			await openPanel(page, testInfo);
			const preset = page.getByRole('button', { exact: true, name: 'Pinot' });

			await preset.click();
			await expect(preset).toHaveAttribute('aria-pressed', 'true');
			const applied = await settledCount(page, settled);

			await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();
			await page.reload();
			await waitForBoot(page);
			// The preset's pill first: on the worker tier the restored expression lands a round trip after
			// the boot, and until it does the page shows the whole corpus with the engine idle. The pill
			// and the count come from the same mirror refresh, so the count that settles after it is the
			// restored one.
			await expect(page.locator(ACTIVE_CHIP), 'the restored preset never reached the engine').toHaveCount(1);
			expect(await settledCount(page, settled)).toBe(applied);

			await openPanel(page, testInfo);
			await expect(page.getByRole('button', { exact: true, name: 'Pinot' })).toHaveAttribute('aria-pressed', 'true');
			await page.getByRole('button', { exact: true, name: 'Clear smart filters' }).click();

			// No pill and the whole corpus: nothing the restore registered is left filtering.
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
			expect(await countNow(page)).toBe(full);
		});
	});
}
