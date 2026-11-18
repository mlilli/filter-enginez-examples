/**
 * The prerendered dataset pages, in all six apps' production builds (`playwright.prerender.config.ts`).
 *
 * @remarks
 * Every dataset route's HTML holds a snapshot of its booted, unfiltered page (`scripts/prerender-routes.mjs`).
 * Per app and route, at both widths (the two projects):
 *
 * 1. **Before any of the app's code runs** the count and the first card are on screen: the scripts are
 *    blocked and the page still shows them.
 * 2. **The app takes over without a visible change**: from navigation on, the result count is never
 *    missing from the page, never shows another number, and nothing shifts while the app boots and
 *    replaces the snapshot.
 * 3. **The takeover paints nothing larger than the snapshot did.** With the webfonts held back until the
 *    snapshot has painted in its fallback faces, as on a slow connection, every largest-contentful-paint
 *    entry is the snapshot's: the app's page, revealed once the count's webfont is in, adds none.
 * 4. **A filtered deep link never shows a wrong count.** A client-booted route shows no snapshot for an
 *    address with a query; a server-backed route's Worker writes the filtered count into it. Either way,
 *    every count painted from navigation on is the filtered one.
 *
 * The observers are installed with `addInitScript`, so they run before the page's own first byte of
 * script, and they record every count text the document ever holds.
 *
 * @packageDocumentation
 */

import { expect, type Page, test } from '@playwright/test';

import { PRERENDER } from '../../packages/examples-shared/src/prerender/index.js';
import { clickFirstFacetChip, FACET_CHIP, openFilterPanel } from './filterFlow.js';

/** One app's production build and its prerendered routes. */
interface BuiltApp {
	readonly name: string;
	readonly origin: string;
	/** Routes whose engine boots in the browser. */
	readonly clientRoutes: readonly string[];
	/** Routes whose engine is the examples server's, served behind the Worker. */
	readonly serverRoutes: readonly string[];
}

/** The six builds (`scripts/serve-builds.mjs`), each route the build prerenders. */
const APPS: readonly BuiltApp[] = [
	{ clientRoutes: ['/books', '/real-estate', '/wine'], name: 'Angular', origin: 'http://127.0.0.1:24620', serverRoutes: ['/books-server']},
	{ clientRoutes: ['/books', '/books-config', '/real-estate', '/wine'], name: 'React RTK', origin: 'http://127.0.0.1:24621', serverRoutes: ['/books-server']},
	{ clientRoutes: ['/books', '/real-estate', '/wine'], name: 'SvelteKit', origin: 'http://127.0.0.1:24622', serverRoutes: []},
	{ clientRoutes: ['/books', '/books-config', '/real-estate', '/wine'], name: 'React plain', origin: 'http://127.0.0.1:24623', serverRoutes: ['/books-server']},
	{ clientRoutes: ['/books', '/real-estate', '/wine'], name: 'Vue', origin: 'http://127.0.0.1:24624', serverRoutes: []},
	{ clientRoutes: ['/books', '/books-raw', '/real-estate', '/wine'], name: 'vanilla', origin: 'http://127.0.0.1:24625', serverRoutes: ['/wine-server']},
];

/** The routes a filter link is made on: a facet chip is in their panel, and their boot is quick. */
const FILTERABLE_ROUTES = new Set(['/books', '/books-server', '/real-estate', '/wine-server']);

/** A query no app reads: an address carrying it boots exactly as a plain one, with no snapshot. */
const WITHOUT_SNAPSHOT = 'baseline';

/** The result count's number. */
const COUNT = '.fe-result-count__number';

/** What the init script records, read back with {@link readProbe}. */
interface PrerenderProbe {
	/** Every distinct count a visitor could see (the topmost one), in order. */
	readonly counts: string[];
	/** Whether the count went missing after it first appeared. */
	readonly hasCountGap: boolean;
	/** Whether a snapshot was ever shown. */
	readonly hasSeenPrerender: boolean;
	/** Every largest-contentful-paint entry, and whether its element was in the snapshot's layer. */
	readonly largestPaints: { readonly isInSnapshot: boolean; readonly size: number }[];
	/** The summed layout-shift score, as CLS counts it (no recent input). */
	readonly layoutShift: number;
}

/**
 * Record, from navigation on, every count the page shows, whether it ever went missing, whether a
 * snapshot was shown, and every layout shift.
 *
 * @param page - The page, before it navigates.
 */
async function installProbe(page: Page): Promise<void> {
	await page.addInitScript(({ countSelector, hostId }) => {
		const probe = {
			counts: [] as string[],
			hasCountGap: false,
			hasSeenPrerender: false,
			largestPaints: [] as { isInSnapshot: boolean; size: number }[],
			layoutShift: 0,
		};
		let hasSeenCount = false;
		const check = (): void => {
			const layer = document.getElementById(hostId);

			if (layer !== null) {
				probe.hasSeenPrerender = true;
			}

			// The count a visitor sees: the snapshot's while its opaque layer is up, the app's after. What the app
			// renders underneath the layer meanwhile is covered.
			const visible = layer === null ? document.querySelector(countSelector) : layer.querySelector(countSelector);

			if (visible === null) {
				probe.hasCountGap ||= hasSeenCount;

				return;
			}
			hasSeenCount = true;

			// Trimmed: Angular's template keeps whitespace around the number, which no one sees. Empty is a
			// count not yet bound, never a wrong number, so it is not recorded.
			const text = visible.textContent.trim();

			if (text !== '' && probe.counts.at(-1) !== text) {
				probe.counts.push(text);
			}
		};

		Object.assign(window, { __prerenderProbe: probe });
		new MutationObserver(check).observe(document, { characterData: true, childList: true, subtree: true });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as ({ hadRecentInput: boolean; value: number } & PerformanceEntry)[]) {
				if (!entry.hadRecentInput) {
					probe.layoutShift += entry.value;
				}
			}
		}).observe({ buffered: true, type: 'layout-shift' });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as ({ element: Element | null; size: number } & PerformanceEntry)[]) {
				// A snapshot element keeps its layer as an ancestor even after the layer is removed.
				const isInSnapshot = entry.element !== null && entry.element.closest(`#${hostId}`) !== null;

				probe.largestPaints.push({ isInSnapshot, size: entry.size });
			}
		}).observe({ buffered: true, type: 'largest-contentful-paint' });
	}, { countSelector: COUNT, hostId: PRERENDER.hostId });
}

/**
 * What the probe recorded.
 *
 * @param page - The page.
 * @returns The record.
 */
async function readProbe(page: Page): Promise<PrerenderProbe> {
	return page.evaluate(() => (window as unknown as { __prerenderProbe: PrerenderProbe }).__prerenderProbe);
}

/**
 * Wait until the app has booted and taken over: no snapshot, no boot caption, the live count settled.
 *
 * @param page - The page.
 * @returns The settled count.
 */
async function waitForTakeover(page: Page): Promise<string> {
	// Released at takeover; removed once the count's webfont is in and the app shows the snapshot's count
	// (`releasePrerender` says why).
	await expect(page.locator(`#${PRERENDER.hostId}:not([${PRERENDER.releasedAttribute}])`)).toHaveCount(0, { timeout: 60_000 });
	await expect(page.locator('.fe-boot-caption')).toHaveCount(0);

	// The app's own count: the released layer may still hold the snapshot's above it.
	const appCount = page.locator(`${COUNT}:not(#${PRERENDER.hostId} *)`);

	await expect(appCount).toHaveCount(1);
	await expect(page.locator(`${COUNT}--computing:not(#${PRERENDER.hostId} *)`)).toHaveCount(0);

	// Settled: the same twice, a beat apart. A server-backed engine applies a link's state a round trip
	// after it renders, under the snapshot's layer, which shows the right count meanwhile.
	const read = async (): Promise<string> => ((await appCount.textContent()) ?? '').trim();
	let previous = await read();

	for (let attempt = 0; attempt < 40; attempt += 1) {
		await page.waitForTimeout(500);

		const current = await read();

		if (current === previous) {
			return current;
		}
		previous = current;
	}

	throw new Error('the app’s count never settled');
}

for (const app of APPS) {
	test.describe(`${app.name} build — prerendered dataset pages`, () => {
		for (const route of [...app.clientRoutes, ...app.serverRoutes]) {
			test(`${route}: the count and the first card show before any script runs`, async ({ page }) => {
				await page.route(/\.m?js(?:\?.*)?$/u, async (request) => request.abort());
				await page.goto(`${app.origin}${route}`);

				await expect(page.locator(`#${PRERENDER.hostId} ${COUNT}`)).toHaveText(/^\s*\d[\d,]*\s*$/u);
				await expect(page.locator(`#${PRERENDER.hostId} [${PRERENDER.cardsSlotAttribute}] > *`).first()).toBeVisible();
			});

			test(`${route}: the app takes over without a missing, changed or shifted count`, async ({ page }) => {
				await installProbe(page);
				await page.goto(`${app.origin}${route}`);

				const settled = await waitForTakeover(page);

				// Gone with no input from the visitor: the live page it reveals must not move either.
				await expect(page.locator(`#${PRERENDER.hostId}`)).toHaveCount(0);

				const probe = await readProbe(page);

				expect(probe.hasSeenPrerender, 'the snapshot was never shown').toBe(true);
				expect(probe.counts, 'a count other than the booted one was painted').toEqual([settled]);
				expect(probe.hasCountGap, 'the count went missing during the takeover').toBe(false);

				// The page's own shifts while it boots are not the takeover's, so the baseline is the same page
				// without a snapshot: an address with a query never shows one. The takeover may add nothing.
				const baseline = await page.context().newPage();

				await installProbe(baseline);
				await baseline.goto(`${app.origin}${route}?${WITHOUT_SNAPSHOT}`);
				await waitForTakeover(baseline);

				const { hasSeenPrerender, layoutShift } = await readProbe(baseline);

				expect(hasSeenPrerender, 'the baseline showed a snapshot').toBe(false);
				expect(probe.layoutShift, `the takeover shifted the page (the page shifts ${layoutShift.toFixed(3)} on its own)`).toBeLessThanOrEqual(
					layoutShift + 0.01,
				);
			});

			test(`${route}: with the webfonts late, the takeover paints nothing larger than the snapshot did`, async ({ page }) => {
				let fontsArrive = (): void => undefined;
				const fontsHeld = new Promise<void>((resolve) => {
					fontsArrive = resolve;
				});

				await page.route(/\.woff2(?:\?.*)?$/u, async (request) => {
					await fontsHeld;
					await request.continue();
				});
				await installProbe(page);
				// Not `load`: the held fonts would hold it back.
				await page.goto(`${app.origin}${route}`, { waitUntil: 'commit' });
				await expect.poll(async () => (await readProbe(page)).largestPaints.length, { timeout: 30_000 }).toBeGreaterThan(0);
				fontsArrive();

				await waitForTakeover(page);
				await expect(page.locator(`#${PRERENDER.hostId}`)).toHaveCount(0);

				const { largestPaints } = await readProbe(page);

				expect(largestPaints.filter((paint) => !paint.isInSnapshot), 'the app painted larger than the snapshot').toEqual([]);
			});

			if (FILTERABLE_ROUTES.has(route)) {
				test(`${route}: a filtered deep link never paints a count but the filtered one`, async ({ page }, testInfo) => {
					await page.goto(`${app.origin}${route}`);
					await waitForTakeover(page);
					// Gone once the app has matched it, so the controls are the app's alone.
					await expect(page.locator(`#${PRERENDER.hostId}`)).toHaveCount(0);
					await openFilterPanel(page, testInfo, page.locator(FACET_CHIP).first());
					await clickFirstFacetChip(page);
					await expect.poll(() => new URL(page.url()).searchParams.get('f'), { timeout: 5_000 }).not.toBeNull();

					const link = page.url();
					const fresh = await page.context().newPage();

					await installProbe(fresh);
					await fresh.goto(link);

					const settled = await waitForTakeover(fresh);
					const probe = await readProbe(fresh);

					expect(probe.counts, 'a count other than the filtered one was painted').toEqual([settled]);
					// A server-backed route shows its snapshot with the count the Worker wrote in; a client-booted
					// route shows none for an address with a query.
					expect(probe.hasSeenPrerender).toBe(app.serverRoutes.includes(route));
				});
			}
		}
	});
}
