/**
 * Tests for `<RealEstateResultGrid>`.
 *
 * @remarks
 * **What jsdom can and cannot see here.** This grid batches on an `IntersectionObserver` sentinel,
 * and jsdom does not implement `IntersectionObserver` — the component guards on its absence, so under
 * test it renders the first page and stays there. That is not a gap in the component; it is the
 * honest limit of the environment, and it is why the assertions below are about the FIRST page and
 * the reset, not about scrolling to the second.
 *
 * The reset is the one worth the test. Without it a filter change leaves `renderLimit` wherever the
 * user's scrolling left it, so narrowing 10,000 listings to 12 would render those 12 inside a
 * scroller still sized for 900 — and widening again would silently show a page the user never
 * scrolled to.
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import RealEstateResultGrid from './RealEstateResultGrid.svelte';

// Not automatic in this app's vitest setup — without it each render stacks another copy in the same
// document, and a query that should match one grid finds every previous test's too.
afterEach(cleanup);

/**
 * A run of listings.
 *
 * @param count - How many.
 * @param prefix - Distinguishes two sets, so a reset assertion can tell them apart.
 * @returns The fixture, cast past the fields the card never reads.
 */
function listings(count: number, prefix = 'a'): readonly Listing[] {
	return Array.from({ length: count }, (_unused, index) => ({
		addressLine1: `${String(index)} ${prefix} Street`,
		bathrooms: 2,
		bedrooms: 3,
		city: 'Denver',
		features: ['solar-panels', 'two-car-garage'],
		id: `${prefix}-${String(index)}`,
		lotSizeAcres: 0.25,
		neighborhood: 'Capitol Hill',
		priceUsd: 750_000,
		propertyType: 'single-family',
		squareFeet: 1800,
		state: 'CO',
		status: 'for-sale',
		yearBuilt: 1998,
	})) as unknown as readonly Listing[];
}

describe('RealEstateResultGrid', () => {
	it('renders the first batch and no more', () => {
		const { container } = render(RealEstateResultGrid, { props: { results: listings(500) }});

		expect(container.querySelectorAll('.fe-listing-card')).toHaveLength(60);
	});

	it('renders every listing when the set is smaller than a batch', () => {
		const { container } = render(RealEstateResultGrid, { props: { results: listings(7) }});

		expect(container.querySelectorAll('.fe-listing-card')).toHaveLength(7);
	});

	it('resets to the first page when the result set changes identity', async () => {
		const { container, rerender } = render(RealEstateResultGrid, {
			props: { results: listings(500) },
		});

		await rerender({ results: listings(500, 'b') });

		const first = container.querySelector('.fe-listing-card__title');

		expect(container.querySelectorAll('.fe-listing-card')).toHaveLength(60);
		expect(first?.textContent).toBe('0 b Street');
	});

	it('shows the empty state rather than an empty grid', () => {
		// A bare scroller with no cards reads as a loading state. The message names the two filters
		// most likely to be responsible, which is the difference between "broken" and "too narrow".
		const { container, getByText } = render(RealEstateResultGrid, { props: { results: []}});

		expect(getByText('No listings match the current filters.')).toBeTruthy();
		expect(container.querySelector('.fe-result-grid__scroller')).toBeNull();
	});

	it('gives the scroll region a keyboard-reachable handle', () => {
		// A scrollable region containing no focusable element cannot be scrolled by keyboard at all.
		const { container } = render(RealEstateResultGrid, { props: { results: listings(500) }});
		const scroller = container.querySelector('.fe-result-grid__scroller');

		expect(scroller?.getAttribute('tabindex')).toBe('0');
		expect(scroller?.getAttribute('role')).toBe('group');
	});

	it('labels the list with the FULL match count, not the rendered one', () => {
		// The rendered count is an implementation detail of batching; a screen-reader user asking "how
		// many results" wants the answer the visible count badge gives.
		const { container } = render(RealEstateResultGrid, { props: { results: listings(500) }});

		expect(container.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('500 matching listings');
	});
});
