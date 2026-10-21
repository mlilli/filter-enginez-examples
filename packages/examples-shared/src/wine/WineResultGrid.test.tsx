/**
 * Rendering tests for `<WineResultGrid />`: the result column's copy, window and cap notice, all from the
 * shared `RESULT_COPY.wine` / `RESULT_GRID_WINDOW` every app reads.
 *
 * @remarks
 * jsdom has no `IntersectionObserver`, so a stub records the grid's sentinel callback and the tests
 * fire it by hand: each call is the user scrolling near the end of what is rendered.
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { type Wine, wines } from '@filter-enginez/mock-data/wine';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RESULT_COPY, RESULT_GRID_WINDOW, resultCapNotice } from '../verticals/verticals.js';
import { WineResultGrid } from './WineResultGrid.js';

/** The sentinel callbacks the grid registered, newest last. */
let sentinelCallbacks: IntersectionObserverCallback[] = [];

beforeEach(() => {
	sentinelCallbacks = [];
	globalThis.IntersectionObserver = class {
		disconnect = (): void => undefined;
		observe = (): void => undefined;
		takeRecords = (): IntersectionObserverEntry[] => [];
		unobserve = (): void => undefined;

		/** @param callback - The grid's sentinel handler. */
		constructor(callback: IntersectionObserverCallback) {
			sentinelCallbacks.push(callback);
		}
	} as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

const COPY = RESULT_COPY.wine;

/**
 * Mount the grid over a real engine.
 *
 * @param sourceData - The corpus.
 * @param isEmpty - Whether to filter the results down to nothing.
 */
function renderGrid(sourceData: readonly Wine[], isEmpty = false): void {
	const core = createFilterEngine<Wine>({ sourceData });

	if (isEmpty) {
		core.addRule('color', inSet<string>('color', ['no-such-color']));
	}
	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<WineResultGrid />
		</FilterEngineProvider>,
	);
}

/** Report the sentinel as intersecting, as scrolling near the rendered tail does. */
function scrollNearTheEnd(): void {
	act(() => {
		sentinelCallbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
	});
}

describe('<WineResultGrid />', () => {
	it('names the scroller and the list from the shared copy, and renders the first window', () => {
		renderGrid(wines);

		expect(screen.getByRole('group', { name: COPY.scrollerLabel })).toBeDefined();
		expect(screen.getByRole('list', { name: COPY.listLabel(wines.length) }).children).toHaveLength(
			Math.min(RESULT_GRID_WINDOW.initial, wines.length),
		);
	});

	it('shows the shared empty state when nothing matches', () => {
		renderGrid(wines, true);

		expect(screen.getByText(COPY.emptyTitle)).toBeDefined();
		expect(screen.getByText(COPY.emptyHint)).toBeDefined();
	});

	it('grows by one batch per scroll and says nothing about a cap below it', () => {
		renderGrid(wines);
		scrollNearTheEnd();

		expect(screen.getByRole('list').children).toHaveLength(
			Math.min(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch, wines.length),
		);
		expect(screen.queryByText(/narrow your filters/u)).toBeNull();
	});

	it('stops at the cap and only then says so, with the shared notice', () => {
		// The wine tier is far larger than the cap, so the window can reach it.
		expect(wines.length).toBeGreaterThan(RESULT_GRID_WINDOW.cap);
		renderGrid(wines);

		const scrollsToCap = Math.ceil((RESULT_GRID_WINDOW.cap - RESULT_GRID_WINDOW.initial) / RESULT_GRID_WINDOW.batch);

		for (let scroll = 1; scroll < scrollsToCap; scroll += 1) {
			scrollNearTheEnd();
		}
		expect(screen.queryByText(/narrow your filters/u)).toBeNull();

		scrollNearTheEnd();
		scrollNearTheEnd();

		const notice = resultCapNotice(RESULT_GRID_WINDOW.cap, wines.length);

		expect(screen.getByRole('list').children).toHaveLength(RESULT_GRID_WINDOW.cap);
		expect(screen.getByText(/narrow your filters/u).textContent).toBe(`Showing ${notice.rendered} of ${notice.total} ${notice.suffix}`);
	});
});
