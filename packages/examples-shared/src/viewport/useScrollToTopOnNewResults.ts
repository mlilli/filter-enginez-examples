/**
 * `useScrollToTopOnNewResults` — scroll a result grid back to its top when a new result set arrives,
 * and leave it alone on mount.
 *
 * @remarks
 * A filter change hands the grid a fresh results array, and the visitor should see the new first
 * page rather than the deep tail of the old one. On mount there is nothing to reset: the scroller has
 * just been created at the top. Writing `scrollTop` anyway is not free — the browser has to lay the
 * page out to clamp the value, so the write forced a full layout in the middle of the first render
 * (78 ms on a throttled phone). So the reset fires only for a result set the grid has not shown yet.
 *
 * @packageDocumentation
 */

import { type RefObject, useEffect, useRef } from 'react';

/**
 * Scroll `scrollerRef`'s element to the top whenever `results` changes identity after the first
 * render.
 *
 * @param scrollerRef - The grid's scrolling element.
 * @param results - The result set the grid shows; compared by identity.
 */
export function useScrollToTopOnNewResults(scrollerRef: RefObject<HTMLElement | null>, results: unknown): void {
	// The result set the scroll position already belongs to. Starting at the first one is what skips
	// the mount, and a re-run of the effect over the same set (Strict Mode) is skipped the same way.
	const shownResults = useRef(results);

	useEffect(() => {
		if (shownResults.current === results) {
			return;
		}
		shownResults.current = results;

		const scroller = scrollerRef.current;

		if (scroller !== null) {
			scroller.scrollTop = 0;
		}
	}, [results, scrollerRef]);
}
