/**
 * `[feInView]` — toggles the `is-playing` class on its host element while that element is within the
 * viewport, gating the About-page figures' CSS animations.
 *
 * @remarks
 * This is the Angular counterpart to the Vue `v-in-view` directive, the SvelteKit `use:inView` action
 * and the React `useInView` hook. The lifted figure CSS (in `@filter-enginez/ui-styles`) animates only
 * under `@media (prefers-reduced-motion: no-preference)` while the figure carries `.is-playing`, so an
 * off-screen or reduced-motion figure rests on its completed static frame. Without this directive the
 * eight ported figures would render their finished frame and never animate.
 *
 * No-observer guard: where `IntersectionObserver` is unavailable (server render, jsdom), the class is
 * added immediately so static markup renders the completed frame — the same "treat as visible"
 * fallback every other vertical uses.
 *
 * @packageDocumentation
 */

import { Directive, ElementRef, inject, type OnDestroy, type OnInit } from '@angular/core';

/** The class toggled on the element while it is in view. */
const PLAYING_CLASS = 'is-playing';

/** Visible fraction (0–1) that counts as "in view" — matches the Vue directive / Svelte action. */
const THRESHOLD = 0.35;

@Directive({
	selector: '[feInView]',
})
export class InViewDirective implements OnDestroy, OnInit {
	/** The host element whose class list is toggled. */
	private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef);

	/** The live observer, kept so it can be disconnected on teardown. */
	private _observer: IntersectionObserver | null = null;

	/** Disconnect the observer with the component. */
	public ngOnDestroy(): void {
		this._observer?.disconnect();
		this._observer = null;
	}

	/** Start observing, or fall back to "always playing" where there is no observer. */
	public ngOnInit(): void {
		const element = this._element.nativeElement;

		if (typeof IntersectionObserver === 'undefined') {
			element.classList.add(PLAYING_CLASS);

			return;
		}

		this._observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					element.classList.toggle(PLAYING_CLASS, entry.isIntersecting);
				}
			},
			{ threshold: THRESHOLD },
		);

		this._observer.observe(element);
	}
}
