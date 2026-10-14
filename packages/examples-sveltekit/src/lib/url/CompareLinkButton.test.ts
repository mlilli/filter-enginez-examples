/**
 * Tests for `<CompareLinkButton>` — the header button that opens the comparison page on the landing
 * site with the current filter state.
 *
 * @remarks
 * `compare-core`'s own suite owns the URL algebra (origins per layout, the query round trip); this
 * one checks the seam: that the button builds its href from the page and the published state, and
 * refuses the click while there is no state to carry. jsdom serves from a loopback host, so the
 * destination is the local site server, `SITE.devOrigin`.
 *
 * @packageDocumentation
 */

import { COMPARE_PATH, SITE } from '@filter-enginez/examples-shared/verticals';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import CompareLinkButton from './CompareLinkButton.svelte';
import { serializedFilterState } from './urlState.js';

/** A serialized filter state, in the shape the URL sync publishes. */
const SERIALIZED_STATE = 'json~{"rules":[{"id":"color"}]}';

afterEach(() => {
	cleanup();
	serializedFilterState.set(null);
});

/**
 * Render the button and return its anchor.
 *
 * @returns The `<a>` the button renders.
 */
function renderCompareLink(): HTMLAnchorElement {
	const { container } = render(CompareLinkButton, { dataset: 'wine' });
	const anchor = container.querySelector<HTMLAnchorElement>('a.fe-compare-link');

	expect(anchor).not.toBeNull();

	return anchor as HTMLAnchorElement;
}

describe('<CompareLinkButton>', () => {
	it('opens the comparison page on the landing site with the dataset and the published state', () => {
		serializedFilterState.set(SERIALIZED_STATE);

		const target = new URL(renderCompareLink().href);

		expect(target.origin).toBe(SITE.devOrigin);
		expect(target.pathname).toBe(COMPARE_PATH);
		expect(target.searchParams.get('dataset')).toBe('wine');
		expect(target.searchParams.get('f')).toBe(SERIALIZED_STATE);
	});

	it('links to the page without a state, and refuses the click, while there is none to carry', async () => {
		const anchor = renderCompareLink();
		const target = new URL(anchor.href);

		expect(target.origin).toBe(SITE.devOrigin);
		expect(target.pathname).toBe(COMPARE_PATH);
		expect(target.searchParams.has('f')).toBe(false);
		expect(anchor.getAttribute('aria-disabled')).toBe('true');
		// `fireEvent` returns `false` when a handler called `preventDefault`.
		expect(await fireEvent.click(anchor)).toBe(false);
	});
});
