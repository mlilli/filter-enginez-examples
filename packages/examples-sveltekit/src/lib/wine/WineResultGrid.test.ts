/**
 * Tests for the wine grid: the shared infinite-scroll window, and the wine copy.
 *
 * @remarks
 * **The window is not an optimization; it is what keeps the tab alive.** The wine corpus is 150,000
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

import { RESULT_COPY, RESULT_GRID_WINDOW } from '@filter-enginez/examples-shared/verticals';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WineResultGrid from './WineResultGrid.svelte';

// Not automatic in this app's vitest setup — without it each render stacks another copy in the same
// document, and a `getByRole` that should match one control finds every previous test's too.
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** The callback of the most recently created observer: calling it reports the sentinel in view. */
let reportSentinel: (() => void) | null = null;

/**
 * Stand in for `IntersectionObserver`, which jsdom lacks, so a test can scroll the sentinel into
 * view on demand.
 */
function stubIntersectionObserver(): void {
	reportSentinel = null;
	vi.stubGlobal('IntersectionObserver', class {
		/**
		 * Keep the callback, as the browser does.
		 *
		 * @param callback - What the grid runs when the sentinel's visibility changes.
		 */
		public constructor(callback: (entries: readonly { readonly isIntersecting: boolean }[]) => void) {
			reportSentinel = () => {
				callback([{ isIntersecting: true }]);
			};
		}

		/** Nothing to release: the stand-in holds no resources. */
		public readonly disconnect = (): void => undefined;

		/** The grid observes its sentinel; the stand-in needs nothing from it. */
		public readonly observe = (): void => undefined;
	});
}

/** Scroll the sentinel into view once, then let the grid re-render. */
async function scrollToEnd(): Promise<void> {
	expect(reportSentinel).not.toBeNull();
	reportSentinel?.();
	await tick();
}

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
	it('renders only the first batch of a large result set', () => {
		const { container } = render(WineResultGrid, { props: { results: wines(500) }});

		expect(cardCount(container)).toBe(RESULT_GRID_WINDOW.initial);
	});

	it('renders everything when the results fit in one batch', () => {
		const { container } = render(WineResultGrid, { props: { results: wines(5) }});

		expect(cardCount(container)).toBe(5);
	});

	it('grows by one batch each time the end of the grid scrolls into view, with no button', async () => {
		stubIntersectionObserver();
		const { container, queryByRole } = render(WineResultGrid, { props: { results: wines(500) }});

		await tick();
		await scrollToEnd();

		expect(cardCount(container)).toBe(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch);
		expect(queryByRole('button')).toBeNull();
	});

	it('stops at the results, never past them', async () => {
		stubIntersectionObserver();
		const { container } = render(WineResultGrid, { props: { results: wines(70) }});

		await tick();
		await scrollToEnd();
		await scrollToEnd();

		expect(cardCount(container)).toBe(70);
	});

	it('shows the cap notice only once the cap stops the grid', async () => {
		stubIntersectionObserver();
		const total = RESULT_GRID_WINDOW.cap + 100;
		const { container } = render(WineResultGrid, { props: { results: wines(total) }});

		await tick();

		expect(container.querySelector('.fe-result-grid__cap-notice')).toBeNull();

		const scrollsToCap = (RESULT_GRID_WINDOW.cap - RESULT_GRID_WINDOW.initial) / RESULT_GRID_WINDOW.batch;

		for (let scroll = 0; scroll < scrollsToCap; scroll += 1) {
			await scrollToEnd();
		}

		expect(cardCount(container)).toBe(RESULT_GRID_WINDOW.cap);
		expect(container.querySelector('.fe-result-grid__cap-notice')?.textContent.replace(/\s+/gu, ' ').trim()).toBe(
			`Showing ${RESULT_GRID_WINDOW.cap.toLocaleString()} of ${total.toLocaleString()} matches · narrow your filters to surface the rest`,
		);
	});

	it('resets the window when the result set changes', async () => {
		// The case that renders a page the user never scrolled to. Grow, then narrow to fewer rows than
		// the grown window but more than one batch: without the reset the grid would keep them all.
		stubIntersectionObserver();
		const { container, rerender } = render(WineResultGrid, { props: { results: wines(200) }});

		await tick();
		await scrollToEnd();

		expect(cardCount(container)).toBe(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch);

		await rerender({ results: wines(100, 'narrowed') });

		expect(cardCount(container)).toBe(RESULT_GRID_WINDOW.initial);
		expect(container.textContent).toContain('narrowed wine 0');
	});

	it('labels the scroller and the list with the wine copy, the list by the FULL match count', () => {
		const { container } = render(WineResultGrid, { props: { results: wines(500) }});
		const scroller = container.querySelector('.fe-result-grid__scroller');

		expect(scroller?.getAttribute('aria-label')).toBe(RESULT_COPY.wine.scrollerLabel);
		expect(scroller?.getAttribute('role')).toBe('group');
		expect(scroller?.getAttribute('tabindex')).toBe('0');
		expect(container.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe(RESULT_COPY.wine.listLabel(500));
	});

	it('shows the wine empty state rather than a bare grid', () => {
		const { container, getByText } = render(WineResultGrid, { props: { results: []}});

		expect(cardCount(container)).toBe(0);
		expect(getByText(RESULT_COPY.wine.emptyTitle)).toBeTruthy();
		expect(getByText(RESULT_COPY.wine.emptyHint)).toBeTruthy();
		expect(container.querySelector('.fe-result-grid__scroller')).toBeNull();
	});
});
