/**
 * Render test for the SvelteKit `/compare` view — the Svelte counterpart to
 * `examples-shared`'s `compare/core.test.ts`, and deliberately NOT a second copy of it.
 *
 * @remarks
 * `core.test.ts` already owns the link algebra: origins per layout, the query round-trip, registry
 * order, preset validity against the real corpora. Re-asserting any of that here would test
 * `compare-core` through a component, which is the shape that makes a shared module's test suite grow
 * six-fold across a fan-out.
 *
 * What is left is the part only mounting can answer: **did this shell wire the shared module up
 * correctly, and does it put the same things on screen as the React one?** Every assertion below is
 * about the seam, not about the algebra behind it.
 *
 * The view is mounted BARE, with its four inputs as props. That is possible only because it imports
 * nothing from `$app/*` — `vitest.config.ts` aliases `$lib` and nothing else, so a component reaching
 * for `$app/stores` has no module to resolve and cannot be rendered at all. The route is the thin
 * adapter that reads `page.url`; it holds no logic, which is the same reason it needs no test.
 *
 * @packageDocumentation
 */

import { COMPARE_PRESETS, DATASET_LABELS, URL_STATE_PARAM } from '@filter-enginez/examples-shared/compare-core';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import CompareView from './CompareView.svelte';

afterEach(cleanup);

/**
 * The location a developer's browser would supply.
 *
 * @remarks
 * A plain object, not a `Location`. That is the whole reason this page can server-render: the shared
 * {@link CompareLocation} is structural, so `page.url` satisfies it on the server and a two-field
 * literal satisfies it here. A component that read `window.location` instead would need a jsdom
 * navigation to test and could not SSR at all.
 */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5175' };

/** The props for a cold visit — no inbound state, no chosen preset. */
const COLD_VISIT = { dataset: 'books', inboundState: null, location: DEV_LOCATION, presetId: null } as const;

/** Every anchor the vertical list renders. */
function rowLinks(container: HTMLElement): readonly HTMLAnchorElement[] {
	return [...container.querySelectorAll<HTMLAnchorElement>('.fe-compare__list .fe-compare__row-name')];
}

describe('SvelteKit /compare view', () => {
	it('renders one row per vertical, in registry order, naming each stack', () => {
		const { container } = render(CompareView, COLD_VISIT);

		expect(rowLinks(container).map((link) => link.textContent.trim())).toEqual(
			VERTICALS.map((descriptor) => descriptor.name),
		);
	});

	it('points every row at that vertical, carrying the state it displays', () => {
		const { container } = render(CompareView, COLD_VISIT);
		const serialized = container.querySelector('.fe-compare__state-value')?.textContent ?? '';

		// Non-empty first: an empty readout renders zero rows, so the per-row assertions below would
		// pass vacuously over an empty list and report a working page.
		expect(serialized).not.toBe('');

		const parsed = rowLinks(container).map((link) => new URL(link.href));

		expect(parsed.map((url) => url.origin)).toEqual(VERTICALS.map((descriptor) => descriptor.devOrigin));
		expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(VERTICALS.map(() => serialized));
	});

	it('falls back to the first preset on a cold visit, and says so', () => {
		const { container } = render(CompareView, COLD_VISIT);
		const first = COMPARE_PRESETS.books[0];

		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe(`preset · ${first.label}`);
	});

	it('honors a chosen preset over the default', () => {
		const chosen = COMPARE_PRESETS.books[1];
		const { container } = render(CompareView, { ...COLD_VISIT, presetId: chosen.id });

		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe(`preset · ${chosen.label}`);
	});

	it('passes an inbound ?f= through VERBATIM rather than re-encoding it', () => {
		// The claim that makes the page worth having: the visitor's own bytes reach the other five
		// apps, not merely an equivalent state. A shell that decoded and re-encoded would still
		// "work", and would quietly be demonstrating something weaker.
		const inbound = 'h~{"version":1,"rules":[]}';
		const { container } = render(CompareView, { ...COLD_VISIT, inboundState: inbound });

		expect(container.querySelector('.fe-compare__state-value')?.textContent).toBe(inbound);
		expect(container.querySelector('.fe-compare__state-label')?.textContent).toBe('from your link');

		for (const url of rowLinks(container).map((link) => new URL(link.href))) {
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(inbound);
		}
	});

	it('hides the preset picker when the visitor arrived with their own state', () => {
		// Offering a preset to someone who came in via a shared link would replace the thing they
		// followed the link to see. React's page makes the same call; this pins the parity.
		const withState = render(CompareView, { ...COLD_VISIT, inboundState: 'h~{"version":1,"rules":[]}' });

		expect(withState.container.querySelectorAll('.fe-compare__group')).toHaveLength(1);

		cleanup();

		const cold = render(CompareView, COLD_VISIT);

		expect(cold.container.querySelectorAll('.fe-compare__group')).toHaveLength(2);
	});

	it('marks the shown dataset on its toggle, for pointer and screen-reader alike', () => {
		const { container } = render(CompareView, { ...COLD_VISIT, dataset: 'real-estate' });
		const selected = container.querySelectorAll('.fe-compare__toggle--selected');
		const dataset = [...selected].find((toggle) => toggle.textContent.trim() === DATASET_LABELS['real-estate']);

		expect(dataset).toBeDefined();
		expect(dataset?.getAttribute('aria-current')).toBe('true');
	});
});
