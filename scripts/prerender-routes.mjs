#!/usr/bin/env node
/// <reference lib="dom" />
/* global document, location -- the functions handed to `page.evaluate` run in the page, not in Node */
/**
 * `prerender-routes` — write each dataset route's booted page into its HTML shell, so the result count
 * and the first results paint before the app's code has run.
 *
 *     node ../../scripts/prerender-routes.mjs dist --host vue                  # after write-route-shells
 *     node ../../scripts/prerender-routes.mjs dist/browser --host angular
 *     node ../../scripts/prerender-routes.mjs .svelte-kit/output/client --host sveltekit --pages .svelte-kit/output/prerendered/pages
 *
 * @remarks
 * It serves the finished build the way its host does (a path's `.html` file, `404.html` otherwise, and
 * `/api/*` answered in-process by examples-server's handler, so the server-backed routes boot as they do
 * deployed), opens every dataset route the host prerenders in headless Chromium at a phone width and at
 * a desktop width, waits until the page has booted and settled, and reads the app root's markup. The
 * result grid's cards are kept apart, so a server can drop them for a filtered address and keep the page
 * around them. Then it writes both widths into the route's shell (`lib/prerender-shells.mjs`), with the
 * inlined picker that shows the right one, or none, before the first paint (`examples-shared`'s
 * `prerender-core` says when).
 *
 * The snapshot is the default, unfiltered state: the build cannot know a visitor's filters. It is the
 * app's own rendering, so the app's takeover cannot shift anything, and that is checked here rather
 * than trusted: with the app's scripts blocked, each prerendered shell must put the result count and the
 * first card exactly where the booted app put them, at both widths, or the step fails and says where.
 *
 * Run after `write-route-shells.mjs` and `strip-local-corpus.mjs`, last in the build: the snapshot must
 * show the corpus the deployed site boots, never a local-only one. `tests/tooling/prerenderRoutes.test.ts`
 * checks that every app's build ends with it.
 *
 * @packageDocumentation
 */

import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

import { APP_ROOTS, loadPrerenderModule, loadVerticalRoutes, prerenderedRoutes, writePrerenderedShell } from './lib/prerender-shells.mjs';
import { loadRouteCatalog, REPO_ROOT } from './lib/route-shells.mjs';
import { importTypeScript } from './lib/typescript-source.mjs';

/** How the script is called, for its error messages. */
const USAGE = 'usage: node prerender-routes.mjs <build-output-directory> --host <host> [--pages <html-directory>]';

/** The two widths, either side of the apps' desktop breakpoint: Lighthouse's phone, and a laptop. */
const WIDTHS = /** @type {const} */ ({
	desktop: { deviceScaleFactor: 1, hasTouch: false, isMobile: false, viewport: { height: 940, width: 1350 }},
	phone: { deviceScaleFactor: 1.75, hasTouch: true, isMobile: true, viewport: { height: 823, width: 412 }},
});

/** How long a route may take to boot in the build's browser (the wine worker generates 150,000 records). */
const BOOT_TIMEOUT_MS = 120_000;

/** How far, in CSS pixels, a prerendered element may sit from where the booted app puts it. */
const POSITION_TOLERANCE_PX = 1;

/** Content types for the files a build holds. */
const CONTENT_TYPES = new Map([
	['.css', 'text/css'],
	['.html', 'text/html; charset=utf-8'],
	['.ico', 'image/x-icon'],
	['.js', 'text/javascript'],
	['.json', 'application/json'],
	['.mjs', 'text/javascript'],
	['.png', 'image/png'],
	['.svg', 'image/svg+xml'],
	['.wasm', 'application/wasm'],
	['.webmanifest', 'application/manifest+json'],
	['.woff2', 'font/woff2'],
]);

/**
 * Print a failure and exit.
 *
 * @param {string} message - What is wrong and how to fix it.
 * @returns {never} Never; the process exits.
 */
function fail(message) {
	console.error(`✗ prerender-routes: ${message}`);
	process.exit(1);
}

/**
 * Serve a build the way its Workers host does, with `/api/*` answered by examples-server's handler.
 *
 * @param {readonly string[]} directories - Where its files are, searched in order (the HTML pages may sit
 *   apart from the assets, as SvelteKit's do before its adapter merges them).
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>} Its origin and a way to stop it.
 */
async function serveBuild(directories) {
	const { handleRequest } = /** @type {{ handleRequest: (method: string, path: string, body: string | undefined) => Promise<{ body: unknown, status: number }> }} */ (
		await importTypeScript(join(REPO_ROOT, 'packages/examples-server/src/requestHandler.ts'))
	);
	const server = createServer((request, response) => {
		const { pathname } = new URL(request.url ?? '/', 'http://build.invalid');

		if (pathname === '/api' || pathname.startsWith('/api/')) {
			const chunks = /** @type {Buffer[]} */ ([]);

			request.on('data', (chunk) => chunks.push(chunk));
			request.on('end', () => {
				const body = request.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined;

				void handleRequest(request.method ?? 'GET', pathname.slice('/api'.length) || '/', body).then(({ body: payload, status }) => {
					response.writeHead(status, { 'content-type': 'application/json' });
					response.end(JSON.stringify(payload));
				});
			});

			return;
		}

		const candidates = directories.flatMap((directory) =>
			pathname.endsWith('/') ? [join(directory, pathname, 'index.html')] : [join(directory, pathname), join(directory, `${pathname}.html`)],
		);
		let status = 200;
		let file = candidates.find((candidate) => {
			try {
				return readFileSync(candidate).length >= 0;
			} catch {
				return false;
			}
		});

		if (file === undefined) {
			status = 404;
			file = directories.map((directory) => join(directory, '404.html')).find((candidate) => existsSync(candidate));
		}
		if (file === undefined) {
			response.writeHead(404, { 'content-type': 'text/plain' });
			response.end('Not found');

			return;
		}
		response.writeHead(status, { 'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream' });
		response.end(readFileSync(file));
	});

	await new Promise((done) => {
		server.listen(0, '127.0.0.1', () => {
			done(undefined);
		});
	});

	const address = server.address();

	if (address === null || typeof address === 'string') {
		throw new Error('the build server has no port');
	}

	return {
		close: async () =>
			new Promise((done) => {
				server.close(() => {
					done(undefined);
				});
			}),
		origin: `http://127.0.0.1:${String(address.port)}`,
	};
}

/**
 * Wait until a route has booted and stopped changing: the count and the first cards are in, no boot
 * caption is left, the fonts have loaded, and the root's markup is the same twice in a row.
 *
 * @param {import('@playwright/test').Page} page - The page.
 * @param {string} selector - The app root.
 */
async function waitForBootedPage(page, selector) {
	await page.waitForFunction(
		(rootSelector) => {
			const root = document.querySelector(rootSelector);

			return (
				root !== null &&
				root.querySelector('.fe-result-count__number') !== null &&
				document.querySelector('.fe-boot-caption') === null &&
				[...root.querySelectorAll('[role="list"]')].some((list) => list.querySelector('[role="listitem"]') !== null)
			);
		},
		selector,
		{ timeout: BOOT_TIMEOUT_MS },
	);
	await page.evaluate(async () => document.fonts.ready.then(() => undefined));
	await page.waitForLoadState('networkidle');

	let previous = '';

	for (let attempt = 0; attempt < 40; attempt += 1) {
		const current = await page.locator(selector).innerHTML();

		if (current === previous) {
			return;
		}
		previous = current;
		await page.waitForTimeout(250);
	}
	throw new Error('the page never stopped changing');
}

/**
 * Where the result count's number and the first card sit, in viewport pixels.
 *
 * @param {import('@playwright/test').Page} page - The page.
 * @returns {Promise<{ count: string, countBox: number[], cardBox: number[] }>} The count's text and the two boxes.
 */
async function measure(page) {
	return page.evaluate(() => {
		const box = (/** @type {Element} */ element) => {
			const rect = element.getBoundingClientRect();

			return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
		};
		const count = document.querySelector('.fe-result-count__number');
		const lists = [...document.querySelectorAll('[role="list"]')];
		const card = lists.map((list) => list.querySelector('[role="listitem"]')).find((item) => item !== null);

		if (count === null || card === undefined || card === null) {
			throw new Error('no result count or no card on the page');
		}

		return { cardBox: box(card), count: count.textContent ?? '', countBox: box(count) };
	});
}

/**
 * Read the booted page: its root's markup with the result grid's cards kept apart, and its stylesheets.
 *
 * @param {import('@playwright/test').Page} page - The booted page.
 * @param {string} selector - The app root.
 * @param {import('./lib/prerender-shells.d.mts').PrerenderConstants} constants - `PRERENDER`.
 * @returns {Promise<{ cards: string, page: string, styles: string[], stylesheets: string[] }>} What was read.
 */
async function readBootedPage(page, selector, constants) {
	return page.evaluate(
		({ cardsSlotAttribute, countAttribute, rootSelector }) => {
			const root = document.querySelector(rootSelector);

			if (root === null) {
				throw new Error(`no ${rootSelector}`);
			}

			const clone = /** @type {Element} */ (root.cloneNode(true));

			for (const script of clone.querySelectorAll('script')) {
				script.remove();
			}
			clone.querySelector('.fe-result-count__number')?.setAttribute(countAttribute, '');

			// The result grid: the list holding the most cards (Angular wraps each card in its component element).
			const itemCount = (/** @type {Element} */ list) => list.querySelectorAll('[role="listitem"]').length;
			const grid = [...clone.querySelectorAll('[role="list"]')].sort((first, second) => itemCount(second) - itemCount(first))[0];

			if (grid === undefined || itemCount(grid) === 0) {
				throw new Error('no result grid with cards');
			}

			const cards = grid.innerHTML;

			grid.replaceChildren();
			grid.setAttribute(cardsSlotAttribute, '');

			return {
				cards,
				page: clone.innerHTML,
				styles: [...document.head.querySelectorAll('style')].map((style) => style.textContent ?? ''),
				// As site paths: a bundler's loader writes absolute URLs, which here name the build server's port.
				stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => {
					const url = new URL(link.getAttribute('href') ?? '', document.baseURI);

					return url.origin === location.origin ? `${url.pathname}${url.search}` : url.href;
				}),
			};
		},
		{ cardsSlotAttribute: constants.cardsSlotAttribute, countAttribute: constants.countAttribute, rootSelector: selector },
	);
}

/**
 * A browser context at one of the two widths, with motion reduced (an entrance animation is never
 * caught mid-frame) and service workers blocked (the build serves no mock API).
 *
 * @param {import('@playwright/test').Browser} browser - The browser.
 * @param {keyof typeof WIDTHS} width - Which width.
 * @param {boolean} isScriptBlocked - Block the app's own scripts (the check of the written shells).
 * @returns {Promise<import('@playwright/test').BrowserContext>} The context.
 */
async function openContext(browser, width, isScriptBlocked) {
	const context = await browser.newContext({ ...WIDTHS[width], reducedMotion: 'reduce', serviceWorkers: 'block' });

	if (isScriptBlocked) {
		await context.route(/\.m?js(?:\?.*)?$/u, (route) => route.abort());
	}

	return context;
}

const [outputArgument, hostFlag, host, pagesFlag, pagesArgument, ...extra] = process.argv.slice(2);

if (
	outputArgument === undefined ||
	hostFlag !== '--host' ||
	host === undefined ||
	(pagesFlag !== undefined && (pagesFlag !== '--pages' || pagesArgument === undefined)) ||
	extra.length > 0
) {
	fail(USAGE);
}
if (!(host in APP_ROOTS)) {
	fail(`"${host}" is not a host that prerenders; expected one of ${Object.keys(APP_ROOTS).join(', ')}.`);
}

const prerenderHost = /** @type {import('./lib/prerender-shells.d.mts').PrerenderHost} */ (host);
const outputDirectory = resolve(outputArgument);
// Where the HTML shells are: the output itself, or the separate pages directory.
const pagesDirectory = pagesArgument === undefined ? outputDirectory : resolve(pagesArgument);
const root = APP_ROOTS[prerenderHost];
let server;
let browser;

try {
	const prerender = await loadPrerenderModule();
	const { hostPages } = await loadRouteCatalog();
	const verticals = await loadVerticalRoutes();
	const routes = prerenderedRoutes(prerenderHost, verticals.find(({ id }) => id === prerenderHost)?.routes ?? [], prerender);

	if (routes.length === 0) {
		fail(`${host} serves no dataset route to prerender — is the verticals registry readable?`);
	}

	server = await serveBuild(pagesDirectory === outputDirectory ? [outputDirectory] : [pagesDirectory, outputDirectory]);
	browser = await chromium.launch();

	/** @type {Map<string, Record<keyof typeof WIDTHS, Awaited<ReturnType<typeof measure>>>>} */
	const bootedPositions = new Map();

	for (const path of routes) {
		const file = join(pagesDirectory, hostPages.shellFileName(path));
		const shell = readFileSync(file, 'utf8');
		/** @type {Record<string, { cards: string, page: string }>} */
		const widths = {};
		const styles = new Set();
		const stylesheets = new Set();
		/** @type {Partial<Record<keyof typeof WIDTHS, Awaited<ReturnType<typeof measure>>>>} */
		const positions = {};

		for (const width of /** @type {(keyof typeof WIDTHS)[]} */ (Object.keys(WIDTHS))) {
			const context = await openContext(browser, width, false);
			const page = await context.newPage();

			const failedRequests = /** @type {string[]} */ ([]);

			page.on('response', (response) => {
				if (response.status() >= 400) {
					failedRequests.push(`${String(response.status())} ${new URL(response.url()).pathname}`);
				}
			});
			page.on('pageerror', (error) => {
				failedRequests.push(`page error: ${error.message}`);
			});
			await page.goto(`${server.origin}${path}`);
			try {
				await waitForBootedPage(page, root.selector);
			} catch (error) {
				throw new Error(
					`${path} at the ${width} width never finished booting (${error instanceof Error ? error.message : String(error)})${
						failedRequests.length > 0 ? `; failed along the way: ${failedRequests.join(', ')}` : ''}`,
				);
			}
			positions[width] = await measure(page);

			const read = await readBootedPage(page, root.selector, prerender.PRERENDER);

			widths[width] = { cards: read.cards, page: read.page };
			for (const css of read.styles) {
				if (!shell.includes(css)) {
					styles.add(css);
				}
			}
			for (const href of read.stylesheets) {
				if (!shell.includes(`href="${href}"`)) {
					stylesheets.add(href);
				}
			}
			await context.close();
		}

		writeFileSync(
			file,
			writePrerenderedShell(
				shell,
				{
					desktop: /** @type {{ cards: string, page: string }} */ (widths['desktop']),
					isFullTier: prerender.FULL_TIER_ROUTE_PATHS.includes(path),
					missingStyles: [...styles],
					missingStylesheets: [...stylesheets],
					phone: /** @type {{ cards: string, page: string }} */ (widths['phone']),
				},
				root,
				prerender,
			),
		);
		bootedPositions.set(path, /** @type {Record<keyof typeof WIDTHS, Awaited<ReturnType<typeof measure>>>} */ (positions));
	}

	// The check: the written shells, with the app's scripts blocked, must place the count and the first
	// card where the booted app did. From a fresh server on another port, so a shell that only works on
	// the port it was captured from fails here rather than when deployed.
	await server.close();
	server = await serveBuild(pagesDirectory === outputDirectory ? [outputDirectory] : [pagesDirectory, outputDirectory]);

	const mismatches = [];

	for (const [path, booted] of bootedPositions) {
		for (const width of /** @type {(keyof typeof WIDTHS)[]} */ (Object.keys(WIDTHS))) {
			const context = await openContext(browser, width, true);
			const page = await context.newPage();

			await page.goto(`${server.origin}${path}`);
			await page.evaluate(async () => document.fonts.ready.then(() => undefined));

			const shown = await measure(page);
			const expected = booted[width];
			const isOff = (/** @type {number[]} */ got, /** @type {number[]} */ want) =>
				got.some((value, index) => Math.abs(value - (want[index] ?? Number.NaN)) > POSITION_TOLERANCE_PX);

			if (shown.count !== expected.count || isOff(shown.countBox, expected.countBox) || isOff(shown.cardBox, expected.cardBox)) {
				mismatches.push(
					`${path} at the ${width} width: prerendered count "${shown.count}" at [${shown.countBox.join(', ')}], first card at [${shown.cardBox.join(', ')}]; ` +
						`booted "${expected.count}" at [${expected.countBox.join(', ')}], first card at [${expected.cardBox.join(', ')}]`,
				);
			}
			await context.close();
		}
	}
	if (mismatches.length > 0) {
		fail(`the prerendered pages would shift when the app takes over:\n  ${mismatches.join('\n  ')}`);
	}
	console.log(`→ prerender-routes: ${host}: ${routes.join(', ')} prerendered at phone and desktop widths, each checked in place`);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
} finally {
	await browser?.close();
	await server?.close();
}
