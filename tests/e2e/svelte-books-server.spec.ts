/**
 * End-to-end tests for the SvelteKit SERVER-BACKED books app (`/books-server`).
 *
 * @remarks
 * This route's SvelteKit server tier runs the isomorphic
 * engine IN-PROCESS (no separate `serve:api`, no proxy — unlike the React `/books-server`). It has two
 * distinct layers, and this spec exercises both:
 *
 *   1. **JS-on (live engine).** The client boots a server-backed engine and renders the exact same
 *      `<BooksView>` as `/books`; every filter round-trips to `/books-server/query`. Same `fe-*`
 *      selectors as `svelte-books.spec.ts`.
 *   2. **JS-off (progressive enhancement).** With JavaScript disabled, the server-rendered
 *      `<BooksServerFallback>` GET `<form>` is the whole experience: submitting it reloads the route so
 *      the SvelteKit server re-filters the corpus in-process. This is the distinctive SvelteKit story,
 *      and it's tested with a `javaScriptEnabled: false` context.
 */

import { expect, type Page, test } from '@playwright/test';

import { describeBooksServerParity } from './booksServerParity.js';
import {
	ACTIVE_CHIP,
	openFilterPanel,
	RESULT_COUNT,
	settledCount,
	type SettledCountOptions,
	TOGGLEABLE_CHIP,
} from './filterFlow.js';
import { subtitle } from './subtitles.js';
import { svelteUrl } from './svelteBase.js';

/**
 * A slower probe than the shared default, because every commit on this route is a server round-trip.
 *
 * @remarks
 * The client engine forwards each mutation to SvelteKit's own server tier and waits for the response,
 * so the count can sit unchanged for longer than a tight probe pair without being settled. 200ms probes
 * over 25s are the tempo this spec has always used; the in-browser routes get away with 150ms over 20s.
 */
const SETTLED: SettledCountOptions = { intervals: [200], timeout: 25_000 };

/** Navigate to the server-backed route and wait for the client engine to swap in the live page. */
async function bootBooksServerApp(page: Page): Promise<void> {
	await page.goto(svelteUrl('/books-server'));
	// The SSR fallback paints first; the live `<BooksView>` (its header) appears once the
	// client engine boots (corpus fetch + initial /query round-trip) — give it room.
	await expect(page.getByText(subtitle('Books', 'sveltekit', 'server'))).toBeVisible({ timeout: 60_000 });
	await expect(page.locator(RESULT_COUNT)).toBeVisible();
}

test.describe('SvelteKit /books-server — live (JS-on) server-backed flow', () => {
	// Each boot fires a few concurrent sub-requests (the corpus fetch + the initial /query + module
	// chunks). Against the Vite DEV server those on-demand SSR transforms can occasionally race and
	// return a transient 500 for the navigation — a dev-only infra hiccup (a built adapter-node server
	// pre-compiles, so it can't happen there). Retry these boot-heavy tests so that transient re-runs
	// cleanly rather than failing the suite. (The underlying server logic is concurrency-safe.)
	test.describe.configure({ retries: 2 });

	test.beforeEach(async ({ page }) => {
		await bootBooksServerApp(page);
	});

	test('boots the live engine from the server and renders a non-empty result set', async ({ page }) => {
		expect(await settledCount(page, SETTLED)).toBeGreaterThan(0);
	});

	test('toggling an InSet filter narrows the results (server-computed) and updates ?f=', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP).first()).toBeVisible();

		// The narrowed count came back from the SvelteKit server via POST /books-server/query.
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);
		// The engine → URL sync writes ?f= even over the async (server-backed) engine.
		await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();
	});

	test('clear all resets every active filter back to the full set', async ({ page }, testInfo) => {
		const before = await settledCount(page, SETTLED);

		await openFilterPanel(page, testInfo, page.locator(TOGGLEABLE_CHIP).first());
		await page.locator(TOGGLEABLE_CHIP).first().click();
		await expect(page.locator(ACTIVE_CHIP)).not.toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBeLessThan(before);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await expect(page.locator(ACTIVE_CHIP)).toHaveCount(0);
		expect(await settledCount(page, SETTLED)).toBe(before);
	});
});

test.describe('SvelteKit /books-server — no-JS progressive enhancement', () => {
	// The whole point: filtering works with JavaScript disabled, entirely server-rendered.
	test.use({ javaScriptEnabled: false });

	/** Parse the fallback's "<matched> of <total> books match" count (the bold `<strong>`). */
	async function readFallbackCount(page: Page): Promise<number> {
		const text = (await page.locator('.fe-server-fallback__count strong').first().textContent()) ?? '';

		return Number.parseInt(text.replace(/\D/gu, ''), 10);
	}

	test('renders the server-filtered fallback form + count with JavaScript disabled', async ({ page }) => {
		await page.goto(svelteUrl('/books-server'));

		// No client engine boots — the SSR fallback is the whole page.
		await expect(page.locator('.fe-server-fallback__form')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Filter on the server' })).toBeVisible();
		// The neutral request matches the whole corpus.
		expect(await readFallbackCount(page)).toBeGreaterThan(0);
	});

	test('submitting the GET form re-filters on the server and narrows the count', async ({ page }) => {
		await page.goto(svelteUrl('/books-server'));
		const before = await readFallbackCount(page);

		// Pick a genre + submit — a full-page GET navigation; the server re-filters in-process.
		await page.locator('input[name="genre"]').first().check();
		await page.getByRole('button', { name: 'Filter on the server' }).click();

		// The genre is now in the URL and the server-rendered count reflects the narrowed set.
		await expect.poll(() => new URL(page.url()).searchParams.getAll('genre').length).toBeGreaterThan(0);
		const after = await readFallbackCount(page);

		expect(after).toBeGreaterThan(0);
		expect(after).toBeLessThan(before);
	});
});

describeBooksServerParity({
	corpusEndpoint: '**/books-server/corpus/books.json',
	id: 'sveltekit',
	label: 'SvelteKit',
	queryEndpoint: '**/books-server/query',
	// SvelteKit filters in its own server tier, so the server to start is the app's dev server.
	startCommand: 'pnpm --filter @filter-enginez/examples-sveltekit dev',
});
