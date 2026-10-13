/**
 * `vInView` — a Vue custom directive that toggles the `is-playing` class on its element while the
 * element is within the viewport, gating the About-page figures' CSS animations exactly like the
 * SvelteKit `use:inView` action and the React `useInView` hook.
 *
 * @remarks
 * The lifted figure CSS (in `@filter-enginez/ui-styles`) animates only under
 * `@media (prefers-reduced-motion: no-preference)` while the figure carries `.is-playing`, so an
 * off-screen or reduced-motion figure rests on its completed static frame. This directive supplies
 * that `.is-playing` toggle via an `IntersectionObserver`, mirroring the other verticals' in-view
 * gating so every vertical animates identically.
 *
 * SSR / no-observer guard: where `IntersectionObserver` is unavailable (server render, jsdom), the
 * class is added immediately so the static/SSR markup renders the completed frame — the same
 * "treat as visible" fallback the React hook + Svelte action use.
 *
 * Usage (idiomatic parity with Svelte's `use:inView`): in a `<script setup>` figure, a directive
 * named `vInView` is auto-exposed to the template as `v-in-view`:
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { vInView } from '../vInView.js';
 * </script>
 * <template>
 *   <div class="fe-fig fe-fig-roaring" role="img" v-in-view>…</div>
 * </template>
 * ```
 *
 * @packageDocumentation
 */

import type { Directive } from 'vue';

/** The class toggled on the element while it is in view. */
const PLAYING_CLASS = 'is-playing';

/** Visible fraction (0–1) that counts as "in view" (matches the Svelte action's default). */
const DEFAULT_THRESHOLD = 0.35;

/**
 * A per-element observer handle, stashed on the element so `unmounted` can disconnect it. Kept off a
 * module map (which would leak across the element's lifecycle) by living on the element itself.
 */
interface InViewElement extends HTMLElement {
	_inViewObserver?: IntersectionObserver;
}

/**
 * The `v-in-view` directive: add `is-playing` to the element while it intersects the viewport, remove
 * it when it leaves. Optional binding value overrides the visible-fraction threshold
 * (`v-in-view="0.5"`).
 */
export const vInView: Directive<InViewElement, number | undefined> = {
	mounted(element, binding): void {
		const threshold = typeof binding.value === 'number' ? binding.value : DEFAULT_THRESHOLD;

		if (typeof IntersectionObserver === 'undefined') {
			// SSR / non-DOM: render the completed frame, no observer to tear down.
			element.classList.add(PLAYING_CLASS);

			return;
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
		element._inViewObserver = observer;
	},
	unmounted(element): void {
		element._inViewObserver?.disconnect();
		delete element._inViewObserver;
	},
};
