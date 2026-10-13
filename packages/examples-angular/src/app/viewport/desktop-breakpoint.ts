/**
 * The two-column breakpoint switch, as a signal — shared by every page with a filter sidebar.
 *
 * @remarks
 * Below `lg` the filter panel is a drawer behind a "Filters" button; at `lg` and above it is a
 * sticky sidebar that is always open. Three pages need that decision (`/books`, `/books-server`,
 * `/real-estate`), so it is authored once here rather than inlined three times — which is how the
 * breakpoint comes to be 1024 in two places and 1023 in the third.
 *
 * ### Why `viewport-core` and not `viewport`
 *
 * `./viewport`'s `useIsDesktop` is a React hook, so importing that barrel for one number would drag
 * `react` into this bundle — the same trap `./books-boot-core` exists to avoid. `./viewport-core`
 * carries the query and the constant alone, and exists for this. What is NOT shared is the
 * reader: every vertical wires `matchMedia` in its own idiom, and this is Angular's.
 *
 * ### Why it defaults to `true`
 *
 * `matchMedia` is absent under jsdom and in any non-browser render. Defaulting to desktop means the
 * panel is PRESENT rather than hidden behind a button that also isn't there, so component tests
 * exercise the real layout and a hostile environment degrades to the more usable of the two states.
 *
 * @packageDocumentation
 */

import { computed, DestroyRef, inject, type Signal, signal } from '@angular/core';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';

/** What a page needs to render the sidebar-or-drawer decision. */
export interface DesktopBreakpointState {
	/** True at `lg` and above — the sidebar is permanent and the toggle button is not rendered. */
	readonly isDesktop: Signal<boolean>;
	/** Whether the mobile drawer is currently open. Meaningless while {@link isDesktop} is true. */
	readonly isFilterOpen: Signal<boolean>;
	/**
	 * Whether the filter panel should be on screen.
	 *
	 * @remarks
	 * Every consumer computed this same OR immediately after calling {@link trackDesktopBreakpoint},
	 * so it belongs here — three pages deriving one predicate is three chances for one of them to
	 * write `&&`. A `computed`, not a method: the pages bind it in a template, where a plain arrow
	 * re-evaluates on every change-detection pass at every binding site.
	 */
	readonly shouldShowPanel: Signal<boolean>;
	/** Flip the mobile drawer. */
	readonly toggleFilters: () => void;
}

/**
 * Track the desktop breakpoint for the calling component's lifetime.
 *
 * @remarks
 * Must be called from an injection context (a field initializer or a constructor) — it registers a
 * `DestroyRef` teardown so the `matchMedia` listener does not outlive the route.
 *
 * Crossing the breakpoint re-seeds `isFilterOpen` as well as `isDesktop`: someone who closed the
 * drawer, rotated to landscape and rotated back should get the drawer closed again, not a panel
 * that reappeared because the desktop branch left the flag `true` on the way through.
 *
 * @returns The breakpoint signals plus the drawer toggle.
 */
export function trackDesktopBreakpoint(): DesktopBreakpointState {
	const isDesktop = signal(true);
	const isFilterOpen = signal(true);

	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
		const apply = (): void => {
			isDesktop.set(mediaQuery.matches);
			isFilterOpen.set(mediaQuery.matches);
		};

		apply();
		mediaQuery.addEventListener('change', apply);
		inject(DestroyRef).onDestroy(() => {
			mediaQuery.removeEventListener('change', apply);
		});
	}

	return {
		isDesktop: isDesktop.asReadonly(),
		isFilterOpen: isFilterOpen.asReadonly(),
		shouldShowPanel: computed<boolean>(() => isDesktop() || isFilterOpen()),
		toggleFilters: (): void => {
			isFilterOpen.update((open) => !open);
		},
	};
}
