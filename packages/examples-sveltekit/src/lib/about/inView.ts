/**
 * `inView` — a Svelte action that toggles the `is-playing` class on its node while the node is within
 * the viewport, gating the About-page figures' CSS animations exactly like the React `useInView` hook.
 *
 * @remarks
 * The lifted figure CSS (in `@filter-enginez/ui-styles`) animates only under
 * `@media (prefers-reduced-motion: no-preference)` while the figure carries `.is-playing`, so an
 * off-screen or reduced-motion figure rests on its completed static frame. This action supplies that
 * `.is-playing` toggle via an `IntersectionObserver`, mirroring the React figures' in-view gating.
 *
 * SSR / no-observer guard: where `IntersectionObserver` is unavailable (server render, jsdom), the
 * class is added immediately so the static/SSR markup renders the completed frame — the same
 * "treat as visible" fallback the React hook uses.
 *
 * @packageDocumentation
 */

/** Tuning knobs for the {@link inView} action. */
export interface InViewOptions {
	/** Visible fraction (0–1) that counts as "in view". Defaults to `0.35`. */
	readonly threshold?: number;
}

/** The class toggled on the node while it is in view. */
const PLAYING_CLASS = 'is-playing';

/**
 * Svelte action: add `is-playing` to `node` while it intersects the viewport, remove it when it leaves.
 *
 * @param node - The element to observe (the figure root).
 * @param options - Threshold tuning.
 * @returns A Svelte action handle with a `destroy` teardown.
 *
 * @example
 *   <div class="fe-fig fe-fig-roaring" use:inView>…</div>
 */
export function inView(node: HTMLElement, options: InViewOptions = {}): { destroy: () => void } {
	const { threshold = 0.35 } = options;

	if (typeof IntersectionObserver === 'undefined') {
		// SSR / non-DOM: render the completed frame, no observer to tear down.
		node.classList.add(PLAYING_CLASS);

		return { destroy: () => undefined };
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				node.classList.toggle(PLAYING_CLASS, entry.isIntersecting);
			}
		},
		{ threshold },
	);

	observer.observe(node);

	return {
		destroy: () => {
			observer.disconnect();
		},
	};
}
