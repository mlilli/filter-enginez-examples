/**
 * Rendering tests for `<BooksResultGrid />`: the result column's copy, window and cap notice, all from the
 * shared `RESULT_COPY.books` / `RESULT_GRID_WINDOW` every app reads.
 *
 * @remarks
 * jsdom has no `IntersectionObserver`, so a stub records the grid's sentinel callback and the tests
 * fire it by hand: each call is the user scrolling near the end of what is rendered.
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { type Book, books } from '@filter-enginez/mock-data/books';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RESULT_COPY, RESULT_GRID_WINDOW } from '../verticals/verticals.js';
import { BooksResultGrid } from './BooksResultGrid.js';

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

const COPY = RESULT_COPY.books;

/**
 * Mount the grid over a real engine.
 *
 * @param sourceData - The corpus.
 * @param isEmpty - Whether to filter the results down to nothing.
 */
function renderGrid(sourceData: readonly Book[], isEmpty = false): void {
	const core = createFilterEngine<Book>({ sourceData });

	if (isEmpty) {
		core.addRule('genre', inSet<string>('genre', ['no-such-genre']));
	}
	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<BooksResultGrid />
		</FilterEngineProvider>,
	);
}

/** Report the sentinel as intersecting, as scrolling near the rendered tail does. */
function scrollNearTheEnd(): void {
	act(() => {
		sentinelCallbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
	});
}

describe('<BooksResultGrid />', () => {
	it('names the scroller and the list from the shared copy, and renders the first window', () => {
		renderGrid(books);

		expect(screen.getByRole('group', { name: COPY.scrollerLabel })).toBeDefined();
		expect(screen.getByRole('list', { name: COPY.listLabel(books.length) }).children).toHaveLength(
			Math.min(RESULT_GRID_WINDOW.initial, books.length),
		);
	});

	it('shows the shared empty state when nothing matches', () => {
		renderGrid(books, true);

		expect(screen.getByText(COPY.emptyTitle)).toBeDefined();
		expect(screen.getByText(COPY.emptyHint)).toBeDefined();
	});

	it('grows by one batch per scroll and says nothing about a cap below it', () => {
		renderGrid(books);
		scrollNearTheEnd();

		expect(screen.getByRole('list').children).toHaveLength(
			Math.min(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch, books.length),
		);
		expect(screen.queryByText(/narrow your filters/u)).toBeNull();
	});
});
