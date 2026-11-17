/**
 * `useScrollToTopOnNewResults`: a new result set scrolls the grid to its top; the first one, and a
 * re-render over the same one, never touch `scrollTop` (a write forces a layout).
 */

import { cleanup, render } from '@testing-library/react';
import { createElement, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useScrollToTopOnNewResults } from './useScrollToTopOnNewResults.js';

afterEach(cleanup);

/** A scroller whose `scrollTop` writes are recorded. */
interface RecordingScroller {
	readonly element: HTMLDivElement;
	readonly writes: number[];
}

/**
 * Create a detached scroller that records every `scrollTop` write.
 *
 * @returns The element and its writes.
 */
function recordingScroller(): RecordingScroller {
	const element = document.createElement('div');
	const writes: number[] = [];

	Object.defineProperty(element, 'scrollTop', {
		configurable: true,
		get: () => writes.at(-1) ?? 0,
		set: (value: number) => {
			writes.push(value);
		},
	});

	return { element, writes };
}

/**
 * A grid-shaped harness: the hook over a ref that points at `scroller`.
 *
 * @param props - The scroller (or none) and the result set.
 * @param props.scroller - The element the ref holds, or `null` before it mounts.
 * @param props.results - The result set.
 * @returns Nothing visible.
 */
function Harness({ results, scroller }: { readonly results: unknown; readonly scroller: HTMLElement | null }): null {
	// Each case keeps one scroller for its whole life, so the ref's first value is its only one.
	const ref = useRef<HTMLElement | null>(scroller);

	useScrollToTopOnNewResults(ref, results);

	return null;
}

describe('useScrollToTopOnNewResults', () => {
	it('leaves scrollTop alone on mount and on a re-render over the same results', () => {
		const scroller = recordingScroller();
		const results = [1, 2, 3];
		const { rerender } = render(createElement(Harness, { results, scroller: scroller.element }));

		rerender(createElement(Harness, { results, scroller: scroller.element }));

		expect(scroller.writes).toEqual([]);
	});

	it('scrolls to the top once per new result set', () => {
		const scroller = recordingScroller();
		const { rerender } = render(createElement(Harness, { results: [1], scroller: scroller.element }));

		rerender(createElement(Harness, { results: [2], scroller: scroller.element }));
		rerender(createElement(Harness, { results: [3], scroller: scroller.element }));

		expect(scroller.writes).toEqual([0, 0]);
	});

	it('does nothing while the scroller is not mounted', () => {
		const { rerender } = render(createElement(Harness, { results: [1], scroller: null }));

		expect(() => {
			rerender(createElement(Harness, { results: [2], scroller: null }));
		}).not.toThrow();
	});
});
