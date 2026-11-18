/**
 * `@filter-enginez/examples-shared/prerender` — the two React apps' side of the prerender hand-over
 * (`./prerender-core` explains it).
 *
 * @packageDocumentation
 */

import { useLayoutEffect } from 'react';

import { dismissPrerender, releasePrerender } from './index.js';

export { dismissPrerender, hasPrerender, releasePrerender } from './index.js';

/**
 * Hand the page to the dataset view rendering its first commit (the snapshot's live twin):
 * `releasePrerender`.
 */
export function useReleasePrerender(): void {
	useLayoutEffect(() => {
		releasePrerender();
	}, []);
}

/**
 * Remove the prerendered snapshot in the commit that first renders the calling component: a screen that
 * replaces the page (a boot failure, a page error, an unreachable server).
 */
export function useDismissPrerender(): void {
	useLayoutEffect(() => {
		dismissPrerender();
	}, []);
}
