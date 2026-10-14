/**
 * The comparison page on the landing site — its address, its selectors, and how to open it.
 *
 * @remarks
 * Three specs drive this one page: `compare.spec.ts` clicks its rows into every app,
 * `compare-page.spec.ts` asserts its table, and `compare-button.spec.ts` lands on it from an app's
 * header and seeds an inbound link from it. They share this module because they share one trap.
 *
 * ### The served HTML links to the DEPLOYED apps
 *
 * `compare.html` is prerendered with a cold visit whose rows point at the production subdomains
 * (`packages/site/src/compare/compareView.ts`, `prerenderCompare`), so the page reads in full with no
 * JavaScript. Its module script then renders the view again for the page's own query and host, which
 * on the dev server means the local origins. Until that render has happened, a row click leaves for
 * `https://…filterenginez.com` and a readout taken from the page describes the cold visit rather than
 * the query. {@link openComparePage} therefore waits for the rows to carry the LOCAL origins of the
 * dataset the query names — the one observable that only the browser render can produce.
 *
 * ### Why the `examples-shared` imports are relative
 *
 * The reason `./subtitles.ts` gives: the package's subpaths point at TypeScript source, and Playwright
 * does not transform files under `node_modules`. Both modules reached here have no external imports
 * (`links.ts` pulls only `origins.ts` and the registry).
 *
 * @packageDocumentation
 */

import { expect, type Page } from '@playwright/test';

import {
	DATASET_PARAM,
	readCompareDataset,
	verticalsServing,
} from '../../packages/examples-shared/src/compare/links.js';
import { COMPARE_PATH } from '../../packages/examples-shared/src/verticals/verticals.js';
import { siteUrl } from './siteBase.js';

/** The `<ul>` of vertical rows, so the toggles and the footnote link cannot be matched by accident. */
export const COMPARE_LIST = '.fe-compare__list';

/** One row's anchor, scoped to the list. */
export const COMPARE_ROW_LINK = `${COMPARE_LIST} .fe-compare__row-name`;

/** The serialized state, exactly as every row link carries it. */
export const COMPARE_STATE_VALUE = '.fe-compare__state-value';

/** The `preset · <label>` (or inbound) provenance line above the state. */
export const COMPARE_STATE_LABEL = '.fe-compare__state-label';

/**
 * The comparison page's absolute address on the landing site's dev server.
 *
 * @param search - The query, with its leading `?`, or an empty string for a cold visit.
 * @returns For example `http://127.0.0.1:5181/compare?dataset=books`.
 */
export function comparePageUrl(search = ''): string {
	return siteUrl(`${COMPARE_PATH}${search}`);
}

/**
 * Every row link's `href`, parsed, in render order.
 *
 * @param page - A page showing the comparison page.
 * @returns One URL per row.
 */
export async function compareRowUrls(page: Page): Promise<readonly URL[]> {
	const hrefs = await page
		.locator(COMPARE_ROW_LINK)
		// The element generic is named for the reason `histogramSignature` names its own: the default is
		// a union whose `className` is `any` in TS 6's lib.dom, which degrades the expression to `any`
		// under typed lint.
		//
		// THREE type arguments, and the `undefined` in the middle is load-bearing. Playwright 1.63
		// collapsed `evaluateAll`'s two overloads into one — `<R, Arg, E>(fn, arg?)` — so with two
		// arguments the element type binds to `Arg` and `E` falls back to the union, on which `href`
		// does not exist.
		.evaluateAll<string[], undefined, HTMLAnchorElement>((anchors) => anchors.map((anchor) => anchor.href));

	return hrefs.map((href) => new URL(href));
}

/**
 * Open the comparison page and wait until it has rendered for its own query and host.
 *
 * @remarks
 * Two waits, in order. The state readout must be non-empty — a page with nothing to transport fails
 * here, naming that. Then the rows must point at the dev origins of the verticals serving the
 * dataset the query names, in registry order: the prerendered rows point at the deployed apps, so
 * this resolves only once the module script has replaced them (see the module docblock).
 *
 * @param page - The page under test.
 * @param search - The query, with its leading `?`, or an empty string for a cold visit.
 * @returns The serialized state the page hands to every row.
 */
export async function openComparePage(page: Page, search = ''): Promise<string> {
	await page.goto(comparePageUrl(search));

	const value = page.locator(COMPARE_STATE_VALUE);

	await expect(value).toBeVisible();
	await expect(value, 'the comparison page rendered no state to transport').not.toBeEmpty();

	const serving = verticalsServing(readCompareDataset(new URLSearchParams(search).get(DATASET_PARAM)));

	await expect
		.poll(async () => (await compareRowUrls(page)).map((url) => url.origin), {
			message: 'the comparison page never re-rendered its rows for the local dev servers',
		})
		.toEqual(serving.map((descriptor) => descriptor.devOrigin));

	return (await value.textContent()) ?? '';
}
