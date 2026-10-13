/**
 * Render test for the framework-less `/compare` page.
 *
 * @remarks
 * Same scope as the SvelteKit, Vue and Angular equivalents, deliberately: `compare-core`'s `core.test.ts` owns
 * the link algebra and the state resolution, and re-asserting either through a shell is how a shared
 * module's suite grows six-fold across a fan-out. What is left is the seam — did THIS shell wire the
 * shared module up, and does it put the same things on screen as the others.
 *
 * ### It reads `window.location` directly, so the test navigates jsdom rather than mocking
 *
 * `renderComparePage` takes only a container — the framework-less router gives it nothing else — so
 * the query string is read from the global. `history.replaceState` is the honest way to vary that: it
 * is what the app's own router does, and it exercises the same `new URLSearchParams(location.search)`
 * path a real visit does. jsdom's origin is a loopback host, so `deploymentLayout` returns `dev` and
 * the links resolve to the registry's `devOrigin`s exactly as they do on a developer's machine —
 * asserted below rather than assumed, since a jsdom origin change would otherwise flip these to the
 * production layout and fail while naming the wrong thing.
 *
 * @packageDocumentation
 */

import { COMPARE_PRESETS, DATASET_LABELS, URL_STATE_PARAM } from '@filter-enginez/examples-shared/compare-core';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderComparePage } from './comparePage.js';

/** The container each test renders into. */
let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
});

afterEach(() => {
	container.remove();
	window.history.replaceState({}, '', '/compare');
});

/** Render the page at a given query string, the way a navigation would. */
function renderAt(query = ''): void {
	window.history.replaceState({}, '', `/compare${query}`);
	renderComparePage(container);
}

/** Every anchor the vertical list renders. */
function rowLinks(): readonly HTMLAnchorElement[] {
	return [...container.querySelectorAll<HTMLAnchorElement>('.fe-compare__list .fe-compare__row-name')];
}

/** Every toggle in the control strip. */
function toggles(): readonly HTMLAnchorElement[] {
	return [...container.querySelectorAll<HTMLAnchorElement>('.fe-compare__toggle')];
}

describe('vanilla /compare page', () => {
	it('renders one row per vertical, in registry order, naming each stack', () => {
		renderAt();

		expect(rowLinks().map((link) => link.textContent.trim())).toEqual(
			VERTICALS.map((descriptor) => descriptor.name),
		);
	});

	it('points every row at that vertical, carrying the state it displays', () => {
		renderAt();

		const serialized = container.querySelector('.fe-compare__state-value')?.textContent ?? '';

		// Non-empty first: an empty readout would render zero rows, and every per-row assertion below
		// would pass vacuously over an empty list while reporting a working page.
		expect(serialized).not.toBe('');

		const parsed = rowLinks().map((link) => new URL(link.href));

		expect(parsed.map((url) => url.origin)).toEqual(VERTICALS.map((descriptor) => descriptor.devOrigin));
		expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(VERTICALS.map(() => serialized));
	});

	it('gives every toggle an absolute path, so the hand-written router intercepts it', () => {
		// The one thing genuinely specific to this vertical. `router.ts` routes a click only when the
		// href starts with `/`; a bare `?dataset=books` — which is what the React, SvelteKit and Vue
		// shells write, correctly, for their own routers — would fall through to a full page reload here. That is a
		// silently worse version of the same behavior, visible in no other assertion, so it is pinned.
		renderAt();

		for (const control of toggles()) {
			expect(control.getAttribute('href')?.startsWith('/compare?')).toBe(true);
		}
	});

	it('leaves every ROW link absolute, so the router does NOT intercept it', () => {
		// The mirror image, and the reason this shell needs no `data-sveltekit-reload` equivalent. Five
		// rows are cross-origin; the sixth points back at this app and is the one an SPA router would
		// otherwise capture — leaving the engine unhydrated on a page that looked like it navigated.
		renderAt();

		for (const link of rowLinks()) {
			expect(link.getAttribute('href')?.startsWith('/')).toBe(false);
		}
	});

	it('falls back to the first preset on a cold visit, and says so', () => {
		renderAt();

		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe(
			`preset · ${COMPARE_PRESETS.books[0].label}`,
		);
	});

	it('honors a chosen preset over the default', () => {
		const chosen = COMPARE_PRESETS.books[1];

		expect(chosen).toBeDefined();
		renderAt(`?preset=${chosen?.id ?? ''}`);

		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe(`preset · ${chosen?.label}`);
	});

	it('passes an inbound ?f= through VERBATIM rather than re-encoding it', () => {
		const inbound = 'h~{"version":1,"rules":[]}';

		renderAt(`?f=${encodeURIComponent(inbound)}`);

		expect(container.querySelector('.fe-compare__state-value')?.textContent).toBe(inbound);
		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe('from your link');

		for (const url of rowLinks().map((link) => new URL(link.href))) {
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(inbound);
		}
	});

	it('hides the preset picker when the visitor arrived with their own state', () => {
		renderAt(`?f=${encodeURIComponent('h~{"version":1,"rules":[]}')}`);

		expect(container.querySelectorAll('.fe-compare__group')).toHaveLength(1);

		container.replaceChildren();
		renderAt();

		expect(container.querySelectorAll('.fe-compare__group')).toHaveLength(2);
	});

	it('switches dataset from the query, marking the toggle for pointer and screen reader alike', () => {
		renderAt('?dataset=real-estate');

		const selected = [...container.querySelectorAll('.fe-compare__toggle--selected')];
		const dataset = selected.find((toggle) => toggle.textContent.trim() === DATASET_LABELS['real-estate']);

		expect(dataset).toBeDefined();
		expect(dataset?.getAttribute('aria-current')).toBe('true');
		// And the rows follow the dataset, which a toggle-only assertion would miss.
		expect(rowLinks().map((link) => new URL(link.href).pathname)).toEqual(VERTICALS.map(() => '/real-estate'));
	});
});
