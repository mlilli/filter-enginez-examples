/**
 * `useInView` — a tiny `IntersectionObserver` hook that reports whether a referenced element is
 * currently within the viewport (past a threshold).
 *
 * @remarks
 * The About page uses this for two things: gating each hero illustration's animation so only
 * on-screen figures animate (the loops idle-pause off-screen, keeping the page cheap and calm — the
 * brief's "never more than one loop animating per viewport-height"), and driving the sticky
 * mini-table-of-contents' active-section highlight. It deliberately has no dependencies beyond React
 * and the DOM `IntersectionObserver`, which every target browser ships.
 *
 * Isomorphic note: this module is browser-only (it touches `IntersectionObserver`) and lives in the
 * browser-only `examples-shared` package, so it never crosses the isomorphic boundary.
 *
 * @packageDocumentation
 */

import { type RefObject, useEffect, useState } from 'react';

/** Tuning knobs for {@link useInView}. */
export interface UseInViewOptions {
	/** Only fire once — latch `true` the first time the element enters and never flip back. */
	readonly isOnce?: boolean;
	/** `IntersectionObserver` rootMargin, e.g. `'-20% 0px'` to trigger past the viewport edge. */
	readonly rootMargin?: string;
	/** Visible fraction (0–1) that counts as "in view". Defaults to `0.4` (40%). */
	readonly threshold?: number;
}

/**
 * Track whether `ref`'s element is intersecting the viewport past `threshold`.
 *
 * @param ref - A ref attached to the element to observe.
 * @param options - Threshold / rootMargin / once behavior.
 * @returns `true` while the element is sufficiently in view (or latched, when `once`).
 *
 * @example
 *   const ref = useRef<HTMLDivElement>(null);
 *   const isInView = useInView(ref, { threshold: 0.4 });
 */
export function useInView<T extends Element>(
	ref: RefObject<T | null>,
	options: UseInViewOptions = {},
): boolean {
	const { isOnce = false, rootMargin = '0px', threshold = 0.4 } = options;
	const [isInView, setIsInView] = useState(false);

	useEffect(() => {
		const element = ref.current;

		if (element === null) {
			return undefined;
		}

		// Guard for non-DOM/test environments that lack IntersectionObserver — treat as always visible
		// so content (and assertions against it) never hides behind an unavailable observer.
		if (typeof IntersectionObserver === 'undefined') {
			setIsInView(true);

			return undefined;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];

				if (entry === undefined) {
					return;
				}
				if (entry.isIntersecting) {
					setIsInView(true);

					if (isOnce) {
						observer.disconnect();
					}
				} else if (!isOnce) {
					setIsInView(false);
				}
			},
			{ rootMargin, threshold },
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [ref, isOnce, rootMargin, threshold]);

	return isInView;
}
