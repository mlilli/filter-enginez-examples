/**
 * `about/figures/inView` — the framework-less in-view gate for the About-page figures.
 *
 * @remarks
 * The lifted figure CSS (in `@filter-enginez/ui-styles`) animates only under
 * `@media (prefers-reduced-motion: no-preference)` while the figure carries `.is-playing`, so an
 * off-screen or reduced-motion figure rests on its completed static frame. This module supplies that
 * `.is-playing` toggle via an `IntersectionObserver` — the framework-less counterpart to the React
 * `useInView` hook, the Svelte `use:inView` action, and the Vue `v-in-view` directive, so all four
 * verticals animate identically.
 *
 * SSR / no-observer guard: where `IntersectionObserver` is unavailable (server render, jsdom), the
 * class is added immediately so the static markup renders the completed frame — the same "treat as
 * visible" fallback every other vertical uses.
 *
 * Figure builders deliberately do NOT self-observe. The About page owns the observation so it can
 * gate every figure in one pass and tear them all down with a single teardown on unmount.
 *
 * @packageDocumentation
 */

/** The class toggled on the element while it is in view. */
const PLAYING_CLASS = 'is-playing';

/** Visible fraction (0–1) that counts as "in view" (matches the other verticals' default). */
const DEFAULT_THRESHOLD = 0.35;

/**
 * Toggle `is-playing` on an element while it intersects the viewport.
 *
 * @param element - The figure root to observe.
 * @param threshold - Visible fraction (0–1) that counts as "in view".
 * @returns A teardown that disconnects the observer. Safe to call more than once.
 *
 * @example
 * ```ts
 * const teardowns = figures.map((figure) => observeInView(figure));
 * // …later
 * for (const teardown of teardowns) teardown();
 * ```
 */
export function observeInView(element: HTMLElement, threshold: number = DEFAULT_THRESHOLD): () => void {
	if (typeof IntersectionObserver === 'undefined') {
		// SSR / non-DOM: render the completed frame, with no observer to tear down.
		element.classList.add(PLAYING_CLASS);

		return () => {
			// Nothing was observed, so there is nothing to disconnect.
		};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				element.classList.toggle(PLAYING_CLASS, entry.isIntersecting);
			}
		},
		{ threshold },
	);

	observer.observe(element);

	return () => {
		observer.disconnect();
	};
}
