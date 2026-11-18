/**
 * The framework-free app's side of the prerender hand-over (`@filter-enginez/examples-shared/prerender-core`
 * explains it): a route's boot screen is not shown while the prerendered snapshot stands in for it, and
 * the route removes the snapshot in the same task that paints its live page's first frame, or its
 * failure screen.
 *
 * @packageDocumentation
 */

import { hasPrerender } from '@filter-enginez/examples-shared/prerender-core';

export { dismissPrerender, releasePrerender } from '@filter-enginez/examples-shared/prerender-core';

/**
 * Show a route's boot screen, unless the prerendered snapshot is standing in for it.
 *
 * @param container - The route container.
 * @param bootScreen - The boot screen; updating it while it is not shown is harmless.
 */
export function appendBootScreen(container: HTMLElement, bootScreen: HTMLElement): void {
	if (!hasPrerender()) {
		container.append(bootScreen);
	}
}
