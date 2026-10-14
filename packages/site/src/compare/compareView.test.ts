/**
 * Tests for `compareView.ts` — the comparison page's markup, at build time and in the browser.
 *
 * @remarks
 * The scope is the seam, as it was for every app's comparison page: `compare-core`'s own suites own
 * the link algebra and the state resolution, so what is asserted here is that this page wires them up
 * and puts the same things on screen. The markup is parsed back with the DOM rather than matched as
 * strings, so the assertions are about the document a browser would build — which is also how the
 * escaping is proven: a hostile `?f=` must come back out as the same text, and as nothing else.
 *
 * @packageDocumentation
 */

import { COMPARE_PRESETS, DATASET_LABELS, URL_STATE_PARAM } from '@filter-enginez/examples-shared/compare-core';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { describe, expect, it } from 'vitest';

import {
	COLD_VISIT,
	COMPARE_HEADING_SLOT,
	COMPARE_VIEW_SLOT,
	prerenderCompare,
	readCompareQuery,
	renderCompareView,
} from './compareView.js';

/** Stand-in for `window.location` on a developer's machine. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5181' };

/** Stand-in for the deployed site. */
const DEPLOYED = { hostname: 'filterenginez.com', origin: 'https://filterenginez.com' };

/**
 * Render the view for a query string and parse it the way a browser would.
 *
 * @param search - The page's query string.
 * @param location - Where the page is served from.
 * @returns A detached container holding the view.
 */
function viewAt(search: string, location = DEV_LOCATION): HTMLElement {
	const container = document.createElement('div');

	container.innerHTML = renderCompareView(readCompareQuery(search), location).viewHtml;

	return container;
}

/** Every row link in a rendered view. */
function rowLinks(view: HTMLElement): readonly HTMLAnchorElement[] {
	return [...view.querySelectorAll<HTMLAnchorElement>('.fe-compare__list .fe-compare__row-name')];
}

describe('renderCompareView', () => {
	it('renders one row per vertical, in registry order, naming each stack', () => {
		expect(rowLinks(viewAt('')).map((link) => link.textContent)).toEqual(VERTICALS.map((descriptor) => descriptor.name));
	});

	it('points every row at that vertical on this machine, carrying the state it displays', () => {
		const view = viewAt('');
		const serialized = view.querySelector('.fe-compare__state-value')?.textContent ?? '';

		// Non-empty first: an empty readout would make every per-row assertion below vacuous.
		expect(serialized).not.toBe('');

		const parsed = rowLinks(view).map((link) => new URL(link.href));

		expect(parsed.map((url) => url.origin)).toEqual(VERTICALS.map((descriptor) => descriptor.devOrigin));
		expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(VERTICALS.map(() => serialized));
	});

	it('links the deployed apps when served from the deployed site', () => {
		expect(rowLinks(viewAt('', DEPLOYED)).map((link) => new URL(link.href).origin)).toEqual(
			VERTICALS.map((descriptor) => descriptor.productionOrigin),
		);
	});

	it('falls back to the first preset on a cold visit, and says so', () => {
		expect(viewAt('').querySelector('.fe-compare__state-label')?.textContent).toBe(
			`preset · ${COMPARE_PRESETS.books[0].label}`,
		);
	});

	it('honors a chosen preset over the default', () => {
		const chosen = COMPARE_PRESETS.books[1];

		expect(chosen).toBeDefined();
		expect(viewAt(`?preset=${chosen?.id ?? ''}`).querySelector('.fe-compare__state-label')?.textContent).toBe(
			`preset · ${chosen?.label ?? ''}`,
		);
	});

	it('passes an inbound ?f= through VERBATIM rather than re-encoding it', () => {
		const inbound = 'h~{"version":1,"rules":[]}';
		const view = viewAt(`?f=${encodeURIComponent(inbound)}`);

		expect(view.querySelector('.fe-compare__state-value')?.textContent).toBe(inbound);
		expect(view.querySelector('.fe-compare__state-label')?.textContent).toBe('from your link');

		for (const url of rowLinks(view).map((link) => new URL(link.href))) {
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(inbound);
		}
	});

	it('shows a hostile ?f= as text, and carries it as data, never as markup', () => {
		const hostile = `"><img src=x onerror="alert(1)"><script>alert(2)</script>'`;
		const view = viewAt(`?f=${encodeURIComponent(hostile)}`);

		expect(view.querySelector('img')).toBeNull();
		expect(view.querySelector('script')).toBeNull();
		expect(view.querySelector('.fe-compare__state-value')?.textContent).toBe(hostile);
		expect(new URL(rowLinks(view)[0]?.href ?? '').searchParams.get(URL_STATE_PARAM)).toBe(hostile);
	});

	it('hides the preset picker when the visitor arrived with their own state', () => {
		expect(viewAt(`?f=${encodeURIComponent('h~{"version":1,"rules":[]}')}`).querySelectorAll('.fe-compare__group')).toHaveLength(1);
		expect(viewAt('').querySelectorAll('.fe-compare__group')).toHaveLength(2);
	});

	it('switches dataset from the query, marking the toggle for pointer and screen reader alike', () => {
		const view = viewAt('?dataset=real-estate');
		const selected = [...view.querySelectorAll('.fe-compare__toggle--selected')];
		const dataset = selected.find((toggle) => toggle.textContent === DATASET_LABELS['real-estate']);

		expect(dataset?.getAttribute('aria-current')).toBe('true');
		// The rows follow the dataset, which a toggle-only assertion would miss.
		expect(rowLinks(view).map((link) => new URL(link.href).pathname)).toEqual(VERTICALS.map(() => '/real-estate'));
	});

	it('links every toggle back to this page, with its choice in the query', () => {
		for (const toggle of viewAt('').querySelectorAll<HTMLAnchorElement>('.fe-compare__toggle')) {
			const url = new URL(toggle.getAttribute('href') ?? '', DEPLOYED.origin);

			expect(url.pathname).toBe('/compare');
			expect(url.searchParams.has('dataset')).toBe(true);
		}
	});

	it('counts only the apps that serve the dataset, in the heading and the list name', () => {
		const query = readCompareQuery('?dataset=wine-server');
		const { heading, viewHtml } = renderCompareView(query, DEV_LOCATION);
		const container = document.createElement('div');

		container.innerHTML = viewHtml;

		expect(heading).toContain('both');
		expect(rowLinks(container)).toHaveLength(2);
		expect(container.querySelector('.fe-compare__list')?.getAttribute('aria-label')).toBe('The 2 demo apps');
	});
});

describe('readCompareQuery', () => {
	it('reads a cold visit as the first dataset, with no state and no preset', () => {
		expect(readCompareQuery('')).toEqual(COLD_VISIT);
	});

	it('falls back to the first dataset for one it does not know', () => {
		expect(readCompareQuery('?dataset=whiskey').dataset).toBe(COLD_VISIT.dataset);
	});
});

describe('prerenderCompare', () => {
	/** A page template holding both slots once, as `compare.html` does. */
	const TEMPLATE = `<h1>${COMPARE_HEADING_SLOT}</h1><div>${COMPARE_VIEW_SLOT}</div>`;

	it('fills the heading and a cold visit linked to the deployed apps', () => {
		const container = document.createElement('div');

		container.innerHTML = prerenderCompare(TEMPLATE);

		expect(container.querySelector('h1')?.textContent).toBe(renderCompareView(COLD_VISIT, DEPLOYED).heading);
		expect(rowLinks(container).map((link) => new URL(link.href).origin)).toEqual(
			VERTICALS.map((descriptor) => descriptor.productionOrigin),
		);
	});

	it.each([
		['missing', `<h1>${COMPARE_HEADING_SLOT}</h1>`],
		['duplicated', `${TEMPLATE}${COMPARE_VIEW_SLOT}`],
	])('refuses a template whose view slot is %s', (_label, template) => {
		expect(() => prerenderCompare(template)).toThrow(COMPARE_VIEW_SLOT);
	});
});
