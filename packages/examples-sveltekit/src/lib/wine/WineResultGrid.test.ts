/**
 * Tests for the wine grid's result windowing.
 *
 * @remarks
 * **The window is not an optimization; it is what keeps the tab alive.** The wine corpus is ~130k
 * rows and an unfiltered result set is most of them. Rendering every match builds hundreds of
 * thousands of DOM nodes, which locks the browser for seconds — and reads as the ENGINE being slow,
 * when the engine answered in single-digit milliseconds and the entire cost is paint. That
 * misattribution is the reason this deserves a direct test rather than trust.
 *
 * **The reset is the subtle half.** After a filter narrows the corpus, a window still sitting at page
 * four would slice past the end of a two-item list and render an empty grid — over a results header
 * confidently reporting "2 bottles". Empty grid, non-zero count, no error: the user concludes the app
 * is broken, and nothing in a log would say otherwise.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import WineResultGrid from './WineResultGrid.svelte';

// Not automatic in this app's vitest setup — without it each render stacks another copy in the same
// document, and a `getByRole` that should match one control finds every previous test's too.
afterEach(cleanup);

/**
 * `count` wines, distinguishable by id and name.
 *
 * @param count - How many to make.
 * @param prefix - Id/name prefix, so two sets are tellable apart.
 * @returns A wine array shaped for the card.
 */
function wines(count: number, prefix = 'w'): readonly Wine[] {
	return Array.from({ length: count }, (_unused, index) => ({
		abv: 13.5,
		body: 'full',
		color: 'red',
		id: `${prefix}${index}`,
		name: `${prefix} wine ${index}`,
		origin: { country: 'Italy', province: 'Piedmont', region: '', subregion: '' },
		points: 90,
		priceUsd: 25,
		sweetness: 'dry',
		tastingNotes: ['cherry'],
		varietal: 'Nebbiolo',
		vintage: 2018,
		winery: 'Test',
	})) as unknown as readonly Wine[];
}

/** How many cards are currently rendered. */
function cardCount(container: HTMLElement): number {
	return container.querySelectorAll('.fe-wine-card').length;
}

describe('WineResultGrid', () => {
	it('renders only the first page of a large result set', () => {
		const { container } = render(WineResultGrid, { props: { results: wines(500) }});

		expect(cardCount(container)).toBe(24);
	});

	it('renders everything when the results fit in one page', () => {
		const { container } = render(WineResultGrid, { props: { results: wines(5) }});

		expect(cardCount(container)).toBe(5);
	});

	it('grows the window on "show more"', async () => {
		const { container, getByRole } = render(WineResultGrid, { props: { results: wines(60) }});

		await fireEvent.click(getByRole('button'));

		expect(cardCount(container)).toBe(48);
	});

	it('hides the "show more" control once everything is visible', async () => {
		const { getByRole, queryByRole } = render(WineResultGrid, { props: { results: wines(30) }});

		await fireEvent.click(getByRole('button'));

		expect(queryByRole('button')).toBeNull();
	});

	it('resets the window when the result set changes', async () => {
		// The case that renders an empty grid over a non-zero count. Expand, then narrow to fewer rows
		// than the expanded window: without the reset the slice starts past the end.
		const { container, getByRole, rerender } = render(WineResultGrid, { props: { results: wines(200) }});

		await fireEvent.click(getByRole('button'));

		expect(cardCount(container)).toBe(48);

		// Narrow to 30 — MORE than one page but FEWER than the expanded window. That gap is the only
		// place the reset is observable: narrowing to 3 would render 3 either way, because slicing 3
		// items at 48 and at 24 give the same answer, so such a test would pass with the reset deleted.
		await rerender({ results: wines(30, 'narrowed') });

		expect(cardCount(container)).toBe(24);
		expect(container.textContent).toContain('narrowed wine 0');
	});

	it('shows the empty state rather than a bare grid', () => {
		// Predictive disable should make this unreachable through the UI, so the copy says so — a user
		// who lands here has found a real gap, and "no results" alone would not tell them that.
		const { container } = render(WineResultGrid, { props: { results: []}});

		expect(cardCount(container)).toBe(0);
		expect(container.textContent).toContain('No wines match these filters');
	});

	it('hides "show more" when the results exactly fill one page', () => {
		// The boundary: `>` not `>=`. At exactly one page there is nothing more to show, and an
		// off-by-one renders a control that expands the window past the end and reveals nothing — a
		// button that visibly does nothing when clicked.
		const { queryByRole } = render(WineResultGrid, { props: { results: wines(24) }});

		expect(queryByRole('button')).toBeNull();
	});

	it('reports how many remain behind the "show more"', () => {
		const { getByRole } = render(WineResultGrid, { props: { results: wines(100) }});

		expect(getByRole('button').textContent).toContain('76');
	});
});
