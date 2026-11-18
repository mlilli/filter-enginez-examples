/**
 * The server-backed pages' prerendered count, rewritten per request for a filtered address.
 *
 * @remarks
 * Every app's build writes a snapshot of each dataset route's booted, unfiltered page into its HTML
 * (`scripts/prerender-routes.mjs`; `examples-shared`'s `prerender-core` says how the page shows it).
 * On a route whose engine is this server's — `/books-server`, `/wine-server` — the Worker runs first,
 * so it can do better than the static page for an address carrying a filter state (`?f=`): it applies
 * the state to the dataset, writes the matching count into the snapshot, marks the snapshot as
 * rewritten for the address (the page's picker otherwise shows nothing on an address with a query),
 * and drops the snapshot's cards, which show the unfiltered first results. The app's own cards arrive
 * when it boots, as they would without a snapshot.
 *
 * Only the count, because the Workers Free plan allows 10 ms of CPU per request: filtering the corpus
 * fits, rendering each framework's cards does not. The cards are a template of their own and the grid a
 * marked slot, so rendering them here is a change to this module alone if the plan ever allows it.
 *
 * Anything unexpected — an address that does not decode, a page without a snapshot — serves the static
 * page untouched: with a query and no rewrite mark, its picker shows nothing and the app boots as usual.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { PRERENDER } from '@filter-enginez/examples-shared/prerender-core';

import { applyConfig } from './applyConfig.js';

/** Each server-backed page and the dataset its engine filters. */
export const SERVER_PAGE_DATASETS: ReadonlyMap<string, string> = new Map([
	['/books-server', 'books'],
	['/wine-server', 'wine'],
]);

/** The address parameter holding a page's filter state. */
const FILTER_STATE_PARAMETER = 'f';

/** Formats a count as the pages' own `toLocaleString()` does in the build's browser. */
const COUNT_FORMAT = new Intl.NumberFormat('en-US');

/**
 * Write a filtered count into a prerendered page.
 *
 * @param html - The page as the build wrote it.
 * @param matched - How many records pass the address's filters.
 * @param total - How many records the dataset holds.
 * @returns The page, or `null` when it holds no snapshot to rewrite.
 */
export function rewritePrerenderedCount(html: string, matched: number, total: number): string | null {
	// The whitespace around the number is the framework's template's (Angular keeps it), kept as it is.
	const countPattern = new RegExp(`(<span[^>]*\\s${PRERENDER.countAttribute}(?:="")?[^>]*>)(\\s*)[^<]*?(\\s*)(</span>)`, 'gu');
	let rewrites = 0;
	let page = html.replaceAll(countPattern, (_match, open: string, before: string, after: string, close: string) => {
		rewrites += 1;

		return `${open}${before}${COUNT_FORMAT.format(matched)}${after}${close}`;
	});

	if (rewrites === 0) {
		return null;
	}

	// The delta every app shows beside a filtered count, before the "filtered from" caption, so the
	// header has the shape the app will render.
	const delta = matched - total;

	if (delta !== 0) {
		const deltaSpan = `<span class="fe-result-count__delta fe-result-count__delta--${delta < 0 ? 'down' : 'up'}">${delta > 0 ? '+' : ''}${COUNT_FORMAT.format(delta)}</span>`;

		page = page.replaceAll(/<span(?=[^>]*\sclass="fe-result-count__total")/gu, `${deltaSpan}<span`);
	}

	for (const id of [PRERENDER.phoneTemplateId, PRERENDER.desktopTemplateId]) {
		page = page.replace(`<template id="${id}"`, `<template id="${id}" ${PRERENDER.filteredAttribute}`);
	}
	for (const id of [PRERENDER.phoneCardsTemplateId, PRERENDER.desktopCardsTemplateId]) {
		page = page.replace(new RegExp(`<template id="${id}">[\\s\\S]*?</template>`, 'u'), '');
	}

	return page;
}

/**
 * Serve a server-backed route's page: for an address with a filter state, the prerendered page with
 * that state's count; otherwise, or when anything does not fit, the static page untouched.
 *
 * @param url - The request's address.
 * @param fetchStaticPage - Fetches the page from the assets.
 * @param decode - Reads an address's filter state (the apps' link serializer).
 * @returns The page.
 */
export async function serveServerPage(
	url: URL,
	fetchStaticPage: () => Promise<Response>,
	decode: (serialized: string) => FilterEngineConfig,
): Promise<Response> {
	const dataset = SERVER_PAGE_DATASETS.get(url.pathname);
	const serialized = url.searchParams.get(FILTER_STATE_PARAMETER);
	const staticPage = await fetchStaticPage();

	if (dataset === undefined || serialized === null || serialized === '' || !staticPage.ok) {
		return staticPage;
	}

	let config: FilterEngineConfig;

	try {
		config = decode(serialized);
	} catch {
		return staticPage;
	}

	const html = await staticPage.text();
	let page: string | null = null;

	try {
		const { matched, total } = await applyConfig(dataset, config, { limit: 0 });

		page = rewritePrerenderedCount(html, matched, total);
	} catch {
		// A state the engine refuses (a rule it cannot build): the app reports it, as it does without
		// a snapshot.
	}

	const headers = new Headers(staticPage.headers);

	headers.delete('content-length');
	headers.delete('etag');
	if (page !== null) {
		// The page now depends on the query, which the static page's cache key ignores.
		headers.set('cache-control', 'no-store');
	}

	return new Response(page ?? html, { headers, status: staticPage.status });
}
