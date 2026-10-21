/**
 * The two-column breakpoint switch, framework-lessly.
 *
 * @remarks
 * Below `lg` the filter panel is an inline collapse behind a "Filters" button; at `lg` and above it
 * is a permanent sidebar. Every vertical wires `matchMedia` in its own idiom — a React hook, a Vue
 * `onMounted`, an Angular `DestroyRef` — and this is the framework-less one: a plain subscribe
 * function returning its own teardown, which is the shape this app uses everywhere (see
 * `url/urlState.ts`'s `subscribeUrlFormat`).
 *
 * `DESKTOP_MEDIA_QUERY` comes from `@filter-enginez/examples-shared/viewport-core` — the React-free
 * half of the viewport slice, added precisely so a non-React vertical can have the number without
 * `react` entering its bundle. It is the same 1024 `ui-styles` switches `.fe-sidebar-app__main` on,
 * and the two disagreeing by a pixel would leave a viewport with no visible panel AND no button to
 * open one.
 *
 * ### It defaults to desktop
 *
 * `matchMedia` is absent under jsdom. Defaulting to desktop means the panel is PRESENT rather than
 * hidden behind a button that also isn't there, so the existing DOM tests exercise the real layout
 * and a hostile environment degrades to the more usable of the two states.
 *
 * @packageDocumentation
 */

import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';

/** The live breakpoint state plus the collapse toggle. */
export interface DesktopBreakpoint {
	/** True at `lg` and above — the sidebar is permanent and no toggle button renders. */
	readonly isDesktop: () => boolean;
	/** Whether the mobile collapse is open. Meaningless while {@link isDesktop} is true. */
	readonly isFilterOpen: () => boolean;
	/** Whether the panel should be on screen: desktop, or the collapse is open. */
	readonly shouldShowPanel: () => boolean;
	/** Flip the collapse, then notify. */
	readonly toggleFilters: () => void;
	/** Called on every breakpoint or collapse change. Returns an unsubscribe. */
	readonly subscribe: (listener: () => void) => () => void;
	/** Detach the `matchMedia` listener. */
	readonly dispose: () => void;
}

/**
 * Track the desktop breakpoint for the lifetime of a route.
 *
 * @remarks
 * Crossing the breakpoint re-seeds the collapse as well as the layout: someone who closed the panel,
 * rotated to landscape and rotated back should find it closed again, rather than reopened because
 * the desktop branch left the flag `true` on the way through.
 *
 * @returns The breakpoint state; call `dispose()` from the route's teardown.
 */
export function trackDesktopBreakpoint(): DesktopBreakpoint {
	let isDesktop = true;
	let isFilterOpen = true;
	const listeners = new Set<() => void>();

	const notify = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	/**
	 * Seed the state from `mediaQuery` and follow its changes.
	 *
	 * @param mediaQuery - The desktop breakpoint's media query list.
	 * @returns Detaches the change listener.
	 */
	const follow = (mediaQuery: MediaQueryList): (() => void) => {
		const apply = (): void => {
			isDesktop = mediaQuery.matches;
			isFilterOpen = mediaQuery.matches;
			notify();
		};

		isDesktop = mediaQuery.matches;
		isFilterOpen = mediaQuery.matches;
		mediaQuery.addEventListener('change', apply);

		return () => {
			mediaQuery.removeEventListener('change', apply);
		};
	};

	// Without `matchMedia` (SSR, jsdom, a hostile environment) the layout stays desktop: panel shown.
	const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
	const stopFollowing = hasMatchMedia ? follow(window.matchMedia(DESKTOP_MEDIA_QUERY)) : undefined;

	return {
		dispose: () => {
			stopFollowing?.();
			listeners.clear();
		},
		isDesktop: () => isDesktop,
		isFilterOpen: () => isFilterOpen,
		shouldShowPanel: () => isDesktop || isFilterOpen,
		subscribe: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
		toggleFilters: () => {
			isFilterOpen = !isFilterOpen;
			notify();
		},
	};
}
