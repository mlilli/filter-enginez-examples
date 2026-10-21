/**
 * The `/books-server` cases every app that serves the route must answer identically: React RTK,
 * React plain, SvelteKit and Angular.
 *
 * @remarks
 * ## What this guards
 *
 * The four apps render the same books page over an engine in another process, and the parity spec
 * holds them to one experience of that distance: the same connecting and offline screens
 * (`SERVER_ROUTE_SCREEN_COPY`), the same header controls as `/books`, chips that light the moment they
 * are clicked rather than when the server answers, and predictive disable computed over the server's
 * answers (the async bundle — the sync shim has no `applyFiltersAndQuery`).
 *
 * ## Holding the server's answer
 *
 * The connecting screen, the offline screen and the optimistic chip are each a state that exists only
 * while a request is outstanding or after one failed, so the cases hold or fail that request with
 * `page.route`. Every app registers a mock service worker in development, and requests a service
 * worker answers never reach `page.route`, so these cases run with service workers blocked. With no
 * worker the apps fetch from the real server directly, which is what this route does anyway. Each app
 * names its two endpoints in its spec: React and Angular query the examples server under `/api`,
 * SvelteKit serves both from its own `/books-server` route.
 *
 * @packageDocumentation
 */

import { expect, type Page, type Route, test } from '@playwright/test';

import { BOOKS_CHIP_SECTION_LABELS } from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { SERVER_ROUTE_SCREEN_COPY } from '../../packages/examples-shared/src/boot-caption/index.js';
import {
	appUrl,
	COMPUTING_INDICATOR,
	FACET_CHIP,
	openFilterPanel,
	panelSection,
	readCount,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
	SHARED_CONTROL_NAMES,
} from './filterFlow.js';
import { subtitle, type VerticalId } from './subtitles.js';

/** The server-backed books route. */
const BOOKS_SERVER_PATH = '/books-server';

/** A thin genre: selecting it alone leaves dead ends for predictive disable to show. */
const SPARSE_GENRE = /^poetry/u;

/** A genre that narrows the corpus without emptying it. */
const NARROWING_GENRE = /^fantasy/u;

/** What one app's `/books-server` spec hands the shared cases. */
export interface BooksServerParitySpec {
	/** The URL pattern of the corpus the page fetches at boot, e.g. `'**\/api/corpus/books.json'`. */
	readonly corpusEndpoint: string;
	/** The app's registry id. */
	readonly id: VerticalId;
	/** Human label for the suite title, e.g. `'Angular'`. */
	readonly label: string;
	/** The URL pattern of the filter query the page posts, e.g. `'**\/api/query'`. */
	readonly queryEndpoint: string;
	/** The command the offline screen tells a developer to run for this app's filter server. */
	readonly startCommand: string;
}

/**
 * Whether the computing indicator reads idle.
 *
 * @remarks
 * Two equal count reads can both land before a server round trip returns, so this route settles only
 * once the indicator, lit from the click until the answer is applied, has gone idle too.
 *
 * @param page - The page under test.
 * @returns `true` when no indicator on the page is computing.
 */
async function isIndicatorIdle(page: Page): Promise<boolean> {
	return (await page.locator(`${COMPUTING_INDICATOR}--computing`).count()) === 0;
}

/** Every commit here is an HTTP round trip, so the probes are slower and the ceiling higher. */
const SERVER_SETTLED: SettledCountOptions = { intervals: [250], isAlsoSettled: isIndicatorIdle, requirePositive: false, timeout: 45_000 };

/**
 * Wait for the route to swap its connecting screen for the live page.
 *
 * @param page - The page under test.
 * @param id - The app.
 */
async function waitForServerBoot(page: Page, id: VerticalId): Promise<void> {
	await expect(page.getByText(subtitle('Books', id, 'server'))).toBeVisible({ timeout: 60_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

/**
 * A route handler that holds every matching request until released.
 *
 * @returns The handler for `page.route`, and the function that lets the held requests through.
 */
function holdRequests(): { readonly handler: (route: Route) => Promise<void>; readonly release: () => void } {
	const gate = Promise.withResolvers<undefined>();

	return {
		handler: async (route) => {
			await gate.promise;
			await route.continue();
		},
		release: () => {
			gate.resolve(undefined);
		},
	};
}

/**
 * Register the shared `/books-server` cases for one app.
 *
 * @param spec - The app and its two endpoints.
 */
export function describeBooksServerParity(spec: BooksServerParitySpec): void {
	const { corpusEndpoint, id, label, queryEndpoint, startCommand } = spec;

	test.describe(`${label} /books-server — parity with the other server-backed apps`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(appUrl(id, BOOKS_SERVER_PATH));
			await waitForServerBoot(page, id);
		});

		test('the header has the same time-travel and devtools controls as /books, and the footer names the server tier', async ({ page }) => {
			for (const name of [SHARED_CONTROL_NAMES.undo, SHARED_CONTROL_NAMES.redo, SHARED_CONTROL_NAMES.devtoolsShow]) {
				await expect(page.getByRole('button', { exact: true, name }), `the header has no "${name}" button`).toBeVisible();
			}
			await expect(page.getByRole('contentinfo')).toContainText(/server/iu);
		});

		test('a narrowing genre disables the genre chips that would empty the results, over the server\'s answers', async ({ page }, testInfo) => {
			const genres = panelSection(page, BOOKS_CHIP_SECTION_LABELS.genre);

			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			await settledCount(page, SERVER_SETTLED);
			await genres.locator('.fe-chip').filter({ hasText: SPARSE_GENRE }).first().click();
			await settledCount(page, SERVER_SETTLED);

			await expect.poll(async () => page.locator('.fe-chip--unavailable').count(), { timeout: 15_000 }).toBeGreaterThan(0);
			await expect(genres.locator('.fe-chip--selected').first()).toBeEnabled();
		});
	});

	test.describe(`${label} /books-server — while the server is slow or away`, () => {
		// Requests a service worker answers never reach `page.route`; see the module docblock.
		test.use({ serviceWorkers: 'block' });

		test('a clicked genre chip lights before the server answers', async ({ page }, testInfo) => {
			await page.goto(appUrl(id, BOOKS_SERVER_PATH));
			await waitForServerBoot(page, id);
			await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
			const before = await settledCount(page, SERVER_SETTLED);
			const held = holdRequests();

			await page.route(queryEndpoint, held.handler);

			const chip = panelSection(page, BOOKS_CHIP_SECTION_LABELS.genre).locator('.fe-chip').filter({ hasText: NARROWING_GENRE }).first();

			await chip.click();
			// Lit while every query is still held, so the count cannot have moved yet.
			await expect(chip).toHaveAttribute('aria-pressed', 'true');
			expect(await readCount(page)).toBe(before);

			held.release();
			expect(await settledCount(page, SERVER_SETTLED)).toBeLessThan(before);
			await expect(chip).toHaveAttribute('aria-pressed', 'true');
		});

		test('the connecting screen shows the shared caption until the corpus arrives', async ({ page }) => {
			const held = holdRequests();

			await page.route(corpusEndpoint, held.handler);
			await page.goto(appUrl(id, BOOKS_SERVER_PATH));

			await expect(page.getByText(SERVER_ROUTE_SCREEN_COPY.connectingCaption)).toBeVisible();

			held.release();
			await waitForServerBoot(page, id);
		});

		test('an unreachable server shows the shared offline screen with this app\'s start command', async ({ page }) => {
			await page.route(corpusEndpoint, async (route) => route.abort('connectionrefused'));
			await page.goto(appUrl(id, BOOKS_SERVER_PATH));

			await expect(page.getByText(SERVER_ROUTE_SCREEN_COPY.offlineTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
			await expect(page.getByText(startCommand, { exact: true })).toBeVisible();
			await expect(page.getByRole('main')).toContainText(`${SERVER_ROUTE_SCREEN_COPY.offlineHintLead}${startCommand}${SERVER_ROUTE_SCREEN_COPY.offlineHintTail}`);
		});
	});
}
