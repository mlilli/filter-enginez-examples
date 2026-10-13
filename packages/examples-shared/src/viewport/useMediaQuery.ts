/**
 * `useMediaQuery` / `useIsDesktop` — the shared viewport hooks that drive the React apps' mobile-first
 * layout switch.
 *
 * @remarks
 * Both React shells (RTK + plain) render the filter controls as an off-canvas `<FilterDrawer />` on
 * small viewports and as a static inline sidebar at the two-column breakpoint and up. Rendering
 * *one* of the two (rather than both, toggled by CSS) keeps a single engine-connected panel
 * instance in the tree — no duplicate subscriptions, no ambiguous e2e selectors — so the shell needs
 * to know the current breakpoint in JS. That's what these hooks provide.
 *
 * Implemented on `useSyncExternalStore` (the same store-subscription primitive the engine-busy
 * tracker uses): tear-free under concurrent React and SSR-safe. The server snapshot is `false`
 * (mobile-first — assume the small viewport until the client can measure), so first paint favors the
 * drawer layout and never assumes desktop.
 *
 * Lives in `examples-shared` rather than `react-ui` because it touches `window.matchMedia`, a
 * browser global that the dumb-presentational `react-ui` layer forbids. It's app-shell plumbing, not
 * a library primitive.
 *
 * @packageDocumentation
 */

import { useCallback, useSyncExternalStore } from 'react';

import { DESKTOP_MEDIA_QUERY } from './viewportCore.js';

// Re-exported so the React apps get the breakpoint and the hooks from one `./viewport` import. The
// declaration lives in `./viewportCore.ts`, which is reachable React-free as `./viewport-core` — the
// four non-React verticals need the number and must not need `react` to get it.
export { DESKTOP_MEDIA_QUERY, DESKTOP_MIN_WIDTH_PX } from './viewportCore.js';

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * @param query - A media-query string, e.g. `'(min-width: 1024px)'`.
 * @returns `true` while the query matches the current viewport.
 */
export function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(onStoreChange: () => void): (() => void) => {
			const mediaQueryList = window.matchMedia(query);

			mediaQueryList.addEventListener('change', onStoreChange);

			return (): void => {
				mediaQueryList.removeEventListener('change', onStoreChange);
			};
		},
		[query],
	);

	const getSnapshot = useCallback((): boolean => window.matchMedia(query).matches, [query]);

	// Mobile-first server default: assume the small viewport until the client can measure.
	const getServerSnapshot = (): boolean => false;

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * `true` at or above the two-column breakpoint (desktop). Drives the React shells' choice between the
 * inline sidebar (desktop) and the off-canvas `<FilterDrawer />` (mobile).
 */
export function useIsDesktop(): boolean {
	return useMediaQuery(DESKTOP_MEDIA_QUERY);
}
