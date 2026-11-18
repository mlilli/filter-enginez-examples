/**
 * The server-backed pages' prerendered count: rewritten for a filtered address, untouched otherwise.
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { PRERENDER } from '@filter-enginez/examples-shared/prerender-core';
import { booksFilterConfig } from '@filter-enginez/mock-data/books';
import { describe, expect, it } from 'vitest';

import { applyConfig } from './applyConfig.js';
import { rewritePrerenderedCount, SERVER_PAGE_DATASETS, serveServerPage } from './prerenderedCount.js';

/** A page template's header, as a build writes it (Angular-style scoped attributes included). cspell:ignore ngcontent */
const HEADER = `<div class="fe-result-count"><span _ngcontent-ng-1="" class="fe-result-count__number" ${PRERENDER.countAttribute}="">10,000</span><span class="fe-result-count__label">books</span><span _ngcontent-ng-1="" class="fe-result-count__total">filtered from 10,000 total</span></div>`;

/** A prerendered page: both page templates, both cards templates, the picker, the root. */
const PAGE = [
	'<!doctype html><html><head></head><body>',
	`<template id="${PRERENDER.phoneTemplateId}">${HEADER}<div role="list" ${PRERENDER.cardsSlotAttribute}=""></div></template>`,
	`<template id="${PRERENDER.desktopTemplateId}">${HEADER}<div role="list" ${PRERENDER.cardsSlotAttribute}=""></div></template>`,
	`<template id="${PRERENDER.phoneCardsTemplateId}"><article role="listitem">Unfiltered</article></template>`,
	`<template id="${PRERENDER.desktopCardsTemplateId}"><article role="listitem">Unfiltered</article></template>`,
	'<script>/* picker */</script><div id="root"></div></body></html>',
].join('');

/** The apps' own reader of `?f=`. */
const SERIALIZER = createLinkSerializer('human-readable');

/**
 * Read a filter state as the Worker does.
 *
 * @param serialized - `?f=`.
 * @returns The state.
 */
const decode = (serialized: string): FilterEngineConfig => SERIALIZER.decode(serialized);

/** A books filter state: the dataset's own declarative config, which narrows the corpus. */
const FILTERED: FilterEngineConfig = booksFilterConfig;

/**
 * A static page response, as the assets binding would answer.
 *
 * @param body - The HTML.
 * @param status - The status.
 * @returns It.
 */
function staticPage(body = PAGE, status = 200): Response {
	return new Response(body, { headers: { 'content-type': 'text/html', etag: '"abc"' }, status });
}

describe('rewritePrerenderedCount', () => {
	it('writes the count into both widths, adds the delta, marks the pages and drops the cards', () => {
		const page = rewritePrerenderedCount(PAGE, 1234, 10_000) ?? '';

		expect(page.match(/>1,234</gu)).toHaveLength(2);
		expect(page).not.toContain('>10,000</span><span class="fe-result-count__label"');
		expect(page.match(/<span class="fe-result-count__delta fe-result-count__delta--down">-8,766<\/span><span _ngcontent-ng-1="" class="fe-result-count__total">/gu)).toHaveLength(2);
		expect(page).toContain(`<template id="${PRERENDER.phoneTemplateId}" ${PRERENDER.filteredAttribute}>`);
		expect(page).toContain(`<template id="${PRERENDER.desktopTemplateId}" ${PRERENDER.filteredAttribute}>`);
		expect(page).not.toContain(PRERENDER.phoneCardsTemplateId);
		expect(page).not.toContain(PRERENDER.desktopCardsTemplateId);
		expect(page).not.toContain('Unfiltered');
	});

	it('keeps the whitespace a framework’s template leaves around the number', () => {
		const spaced = PAGE.replaceAll('="">10,000</span>', '=""> 10,000 </span>');

		expect(rewritePrerenderedCount(spaced, 42, 10_000)?.match(/=""> 42 <\/span>/gu)).toHaveLength(2);
	});

	it('adds no delta when the state matches every record', () => {
		expect(rewritePrerenderedCount(PAGE, 10_000, 10_000)).not.toContain('fe-result-count__delta');
	});

	it('signs a delta above the total', () => {
		expect(rewritePrerenderedCount(PAGE, 10_005, 10_000)).toContain('fe-result-count__delta--up">+5<');
	});

	it('returns null for a page without a snapshot', () => {
		expect(rewritePrerenderedCount('<html><body><div id="root"></div></body></html>', 1, 2)).toBeNull();
	});
});

describe('serveServerPage', () => {
	it('serves the count of the address’s filter state, uncached', async () => {
		const url = new URL(`https://react.filterenginez.com/books-server?f=${encodeURIComponent(SERIALIZER.encode(FILTERED))}`);
		const expected = await applyConfig('books', FILTERED, { limit: 0 });
		const response = await serveServerPage(url, async () => Promise.resolve(staticPage()), decode);
		const body = await response.text();

		expect(expected.matched).toBeGreaterThan(0);
		expect(expected.matched).toBeLessThan(expected.total);
		expect(body).toContain(`>${expected.matched.toLocaleString('en-US')}<`);
		expect(body).toContain(PRERENDER.filteredAttribute);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('etag')).toBeNull();
		expect(response.headers.get('content-type')).toBe('text/html');
	});

	it('serves the static page itself without a filter state, or for a page it does not know', async () => {
		const original = staticPage();
		const bare = await serveServerPage(new URL('https://x.test/books-server'), async () => Promise.resolve(original), decode);
		const empty = await serveServerPage(new URL('https://x.test/books-server?f='), async () => Promise.resolve(staticPage()), decode);
		const other = await serveServerPage(new URL('https://x.test/books?f=abc'), async () => Promise.resolve(staticPage()), decode);

		expect(bare).toBe(original);
		expect(await empty.text()).toBe(PAGE);
		expect(await other.text()).toBe(PAGE);
	});

	it('serves the static page for a state that does not decode, or that the engine refuses', async () => {
		const undecodable = await serveServerPage(new URL('https://x.test/books-server?f=%%%'), async () => Promise.resolve(staticPage()), () => {
			throw new Error('not a state');
		});
		const refused = await serveServerPage(new URL('https://x.test/wine-server?f=x'), async () => Promise.resolve(staticPage()), () =>
			({ rules: [{ config: {}, id: 'nope', type: 'no-such-rule' }], version: 1 }) as unknown as FilterEngineConfig,
		);

		expect(await undecodable.text()).toBe(PAGE);
		expect(await refused.text()).toBe(PAGE);
		expect(refused.headers.get('cache-control')).toBeNull();
	});

	it('passes a failed static page straight through', async () => {
		const missing = staticPage('not found', 404);

		expect(await serveServerPage(new URL('https://x.test/books-server?f=x'), async () => Promise.resolve(missing), decode)).toBe(missing);
	});

	it('knows exactly the server-backed pages', () => {
		expect([...SERVER_PAGE_DATASETS]).toEqual([
			['/books-server', 'books'],
			['/wine-server', 'wine'],
		]);
	});
});
