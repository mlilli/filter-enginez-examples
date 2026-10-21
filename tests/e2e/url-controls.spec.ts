/**
 * The header's two link controls on every app's `/books`: "Copy link" and the shareable-URL format
 * toggle.
 *
 * @remarks
 * Six apps render both controls in their own idiom, and the parity spec holds them to one behavior:
 * "Copy link" reads "Copied!" for a moment after a successful copy and then reads "Copy link" again,
 * and the format toggle is named `Shareable-URL format: <format>. Activate to cycle formats.`, carries
 * a `title`, and names a different format after each activation. One loop over the registry covers
 * all six, so a seventh app joins it through `verticals.ts`.
 *
 * The clipboard write needs the page's permission, granted for the whole context below, and the
 * format choice persists in `localStorage`, which a fresh context starts without.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import { VERTICALS } from '../../packages/examples-shared/src/verticals/verticals.js';
import { BOOKS_ARRIVAL } from './booksArrival.js';
import { appUrl, RESULT_COUNT } from './filterFlow.js';
import { subtitle } from './subtitles.js';

/** The toggle's accessible name, with the format it names captured. */
const FORMAT_TOGGLE_NAME = /^Shareable-URL format: (.+)\. Activate to cycle formats\.$/u;

/** The copy button's label at rest. */
const COPY_LABEL = 'Copy link';

/** The copy button's label just after a successful copy. */
const COPIED_LABEL = 'Copied!';

test.describe('the header link controls', () => {
	test.use({ permissions: ['clipboard-read', 'clipboard-write']});

	for (const { id, name } of VERTICALS) {
		test(`${name}: "Copy link" confirms the copy, and the format toggle names each format it cycles to`, async ({ page }) => {
			const { bootTimeoutMs, tier } = BOOKS_ARRIVAL[id];

			await page.goto(appUrl(id, '/books'));
			await expect(page.getByText(subtitle('Books', id, tier))).toBeVisible({ timeout: bootTimeoutMs });
			await expect(page.locator(RESULT_COUNT)).toBeVisible();

			const copy = page.getByRole('button', { exact: true, name: COPY_LABEL });

			await copy.click();
			await expect(page.locator('.fe-copy-link')).toHaveText(COPIED_LABEL);
			await expect(page.locator('.fe-copy-link')).toHaveText(COPY_LABEL, { timeout: 5_000 });

			const toggle = page.locator('.fe-url-format-toggle');
			const firstName = (await toggle.getAttribute('aria-label')) ?? '';

			expect(firstName).toMatch(FORMAT_TOGGLE_NAME);
			await expect(toggle).toHaveAttribute('title', /\S/u);

			await toggle.click();
			await expect(toggle).toHaveAttribute('aria-label', FORMAT_TOGGLE_NAME);
			await expect(toggle).not.toHaveAttribute('aria-label', firstName);
		});
	}
});
