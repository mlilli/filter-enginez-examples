/**
 * Tests for the shared results-column copy and paging window.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { isRenderCapped, nextRenderLimit, RESULT_COPY, RESULT_GRID_WINDOW, resultCapNotice } from './verticals.js';

describe('nextRenderLimit', () => {
	it('grows by one batch', () => {
		expect(nextRenderLimit(RESULT_GRID_WINDOW.initial, 10_000)).toBe(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch);
	});

	it('never passes the result count', () => {
		expect(nextRenderLimit(60, 70)).toBe(70);
	});

	it('never passes the cap', () => {
		expect(nextRenderLimit(RESULT_GRID_WINDOW.cap - 1, 150_000)).toBe(RESULT_GRID_WINDOW.cap);
	});
});

describe('isRenderCapped', () => {
	it('is true only once the cap stops a larger result set', () => {
		expect(isRenderCapped(RESULT_GRID_WINDOW.cap, RESULT_GRID_WINDOW.cap + 1)).toBe(true);
	});

	it('is false while the grid can still grow', () => {
		// The notice must not appear from the first batch on: below the cap, scrolling renders more.
		expect(isRenderCapped(RESULT_GRID_WINDOW.initial, 10_000)).toBe(false);
	});

	it('is false when every result fits under the cap', () => {
		expect(isRenderCapped(RESULT_GRID_WINDOW.cap, RESULT_GRID_WINDOW.cap)).toBe(false);
	});
});

describe('RESULT_COPY', () => {
	it.each(Object.entries(RESULT_COPY))('%s names its list by the result count', (_dataset, copy) => {
		expect(copy.listLabel(1204)).toMatch(/^1,204 matching /u);
		expect(copy.emptyTitle).toMatch(/^No .+ match the current filters\.$/u);
		expect(copy.emptyHint).toMatch(/^Try widening /u);
	});
});

describe('resultCapNotice', () => {
	it('formats both counts with grouping separators', () => {
		expect(resultCapNotice(1500, 150_000)).toEqual({
			rendered: '1,500',
			suffix: 'matches · narrow your filters to surface the rest',
			total: '150,000',
		});
	});
});
