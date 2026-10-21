/**
 * The `/books` cases every app must answer identically, registered by each app's books spec.
 *
 * @remarks
 * ## What this guards
 *
 * Six books panels bind one set of shared cores: `clearAllFilters` for Clear all, the typeahead
 * controller for the three searches, `isToggleDisabled` for the four checkboxes, `RESULT_COPY` for
 * the results column. A panel that binds one differently passes its own unit suite and differs only
 * in a browser — a Clear all that removes rules one by one, a search that waits for a blur, a checked
 * box that greys out and traps the user in an empty result set. Each case pins one of those.
 *
 * ## Shared, not per app
 *
 * Each app's own books spec keeps what is particular to it (its boot quirks, its routing) and calls
 * {@link describeBooksParity} once, so a seventh app joins these cases by adding one line. The boot
 * budget and the subtitle's tier come from `BOOKS_ARRIVAL`, the table every books-reaching spec
 * already shares.
 *
 * @packageDocumentation
 */

import { expect, type Page, test } from '@playwright/test';

import {
	BOOKS_CHIP_SECTION_LABELS,
	BOOKS_ISBN_INVALID_MESSAGE,
	BOOKS_SEARCH_COPY,
	BOOKS_TOGGLE_LABELS,
} from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { TYPEAHEAD_DEBOUNCE_MS } from '../../packages/examples-shared/src/search/typeaheadController.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import {
	ACTION_LOG_LABELS,
	actionLogLabels,
	actionLogRowsAddedBy,
	ACTIVE_CHIP,
	appUrl,
	clickFirstFacetChip,
	expectEmptyResults,
	expectFilterCollapseKeepsState,
	expectResultsColumnCopy,
	FACET_CHIP,
	installBusyRecorder,
	isMobileProject,
	openActionLog,
	openFilterPanel,
	panelSection,
	readBusyRecord,
	RESULT_COUNT,
	revisitThroughHub,
	settledCount,
	SHARED_CONTROL_NAMES,
	TOGGLEABLE_CHIP,
	undoByKeyboardAndButton,
} from './filterFlow.js';
import { subtitle, type VerticalId } from './subtitles.js';

/** The books route. */
const BOOKS_PATH = '/books';

/**
 * The `title` a disabled checkbox's label carries in every app.
 *
 * @remarks
 * Spelled here because no shared module exports it: each app writes the same words into its own
 * checkbox markup, so this case is what holds the six to one wording.
 */
const DISABLED_CHECKBOX_TITLE = 'No matches given your other filters';

/** An ISBN-13 pattern no book can match: every ISBN-13 starts with 978 or 979. */
const UNMATCHABLE_ISBN = '^000';

/** What one app's books spec hands the shared cases. */
export interface BooksParitySpec {
	/** The app's registry id. */
	readonly id: VerticalId;
	/** Human label for the suite title, e.g. `'Vue'`. */
	readonly label: string;
}

/**
 * Wait for an app's `/books` to boot: its own header subtitle, then the result count.
 *
 * @param page - The page under test.
 * @param id - The app.
 */
async function waitForBooksBoot(page: Page, id: VerticalId): Promise<void> {
	const { bootTimeoutMs, tier } = BOOKS_ARRIVAL[id];

	await expect(page.getByText(subtitle('Books', id, tier))).toBeVisible({ timeout: bootTimeoutMs });
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
 * Register the shared books cases for one app.
 *
 * @param spec - The app.
 */
export function describeBooksParity(spec: BooksParitySpec): void {
	const { id, label } = spec;

	test.describe(`${label} books app — parity with the other five apps`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(appUrl(id, BOOKS_PATH));
			await waitForBooksBoot(page, id);
		});

		test('Clear all over two facets logs ONE clearRules, and ONE Undo restores every pill', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			const log = await openActionLog(page);

			await clickFirstFacetChip(page, panelSection(page, BOOKS_CHIP_SECTION_LABELS.genre).locator(TOGGLEABLE_CHIP));
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await clickFirstFacetChip(page, panelSection(page, BOOKS_CHIP_SECTION_LABELS.format).locator(TOGGLEABLE_CHIP));
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
			await clickFirstFacetChip(page);

			const marks = await undoByKeyboardAndButton(page, settle);

			expect(marks.keyboard.hasIndicatorComputed, 'the keyboard undo never lit the computing indicator').toBe(true);
			expect(marks.keyboard).toEqual(marks.button);
		});

		test('typing a description filters with no blur, and Enter then a blur logs ONE action', async ({ page }, testInfo) => {
			const description = page.getByRole('searchbox', { exact: true, name: BOOKS_SEARCH_COPY.description.ariaLabel });

			await openFilterPanel(page, testInfo, description);
			const log = await openActionLog(page);

			await description.click();
			await description.pressSequentially('adventure', { delay: 40 });
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await expect(description).toBeFocused();
			await settle(page);

			const added = await actionLogRowsAddedBy(log, async () => {
				await description.fill('voyage');
				await description.press('Enter');
				await description.blur();
				await settle(page);
			});

			expect(added).toHaveLength(1);
		});

		test('tabbing through an untouched search writes nothing and marks nothing busy', async ({ page }, testInfo) => {
			const author = page.getByRole('searchbox', { exact: true, name: BOOKS_SEARCH_COPY.author.ariaLabel });

			await openFilterPanel(page, testInfo, author);
			const log = await openActionLog(page);

			await settle(page);
			const rowsBefore = (await actionLogLabels(log)).length;

			await installBusyRecorder(page);
			await author.focus();
			await page.keyboard.press('Tab');
			await page.waitForTimeout(TYPEAHEAD_DEBOUNCE_MS * 4);

			expect(await readBusyRecord(page)).toEqual({ hasBodyBeenAriaBusy: false, hasBodyBeenBusyClass: false, hasIndicatorComputed: false });
			expect(await actionLogLabels(log)).toHaveLength(rowsBefore);
		});

		test('an ISBN pattern that matches nothing: the shared empty state, and a CHECKED box stays enabled', async ({ page }, testInfo) => {
			const isbn = page.getByRole('searchbox', { exact: true, name: BOOKS_SEARCH_COPY.isbn.ariaLabel });
			const inPrint = page.getByRole('checkbox', { exact: true, name: BOOKS_TOGGLE_LABELS.inPrint });
			const audiobook = page.getByRole('checkbox', { exact: true, name: BOOKS_TOGGLE_LABELS.audiobook });

			await openFilterPanel(page, testInfo, isbn);

			// A half-typed pattern is flagged, never committed.
			await isbn.fill('[');
			await isbn.press('Enter');
			await expect(page.getByRole('alert').filter({ hasText: BOOKS_ISBN_INVALID_MESSAGE })).toBeVisible();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);

			await inPrint.check();
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);
			await isbn.fill(UNMATCHABLE_ISBN);
			await isbn.press('Enter');
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(2);
			expect(await settle(page)).toBe(0);
			await expectEmptyResults(page, 'books');

			// The checked box is the way out of the empty set, so it is never disabled.
			await expect(inPrint).toBeChecked();
			await expect(inPrint).toBeEnabled();
			// An unchecked box that could only stay empty is disabled, and says why.
			await expect(audiobook).toBeDisabled();
			await expect(page.locator('label').filter({ has: audiobook })).toHaveAttribute('title', DISABLED_CHECKBOX_TITLE);
		});

		test('the results column reads the shared copy', async ({ page }) => {
			await expectResultsColumnCopy(page, 'books', await settle(page));
		});

		test('after the hub and back by in-app links, the panel still filters', async ({ page }, testInfo) => {
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await clickFirstFacetChip(page);
			await expect(page.locator(ACTIVE_CHIP)).toHaveCount(1);

			await revisitThroughHub(page, id, BOOKS_PATH, async (revisited) => waitForBooksBoot(revisited, id));
			const before = await settle(page);

			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await clickFirstFacetChip(page);

			await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
			expect(await settle(page)).not.toBe(before);
		});

		test('mobile: the "Filters" toggle shows and hides the panel, which keeps a half-typed search', async ({ page }, testInfo) => {
			test.skip(!isMobileProject(testInfo), 'The toggle only exists below the two-column breakpoint.');

			await expectFilterCollapseKeepsState(
				page,
				page.getByRole('searchbox', { exact: true, name: BOOKS_SEARCH_COPY.description.ariaLabel }),
				'seafaring',
			);
		});
	});
}
