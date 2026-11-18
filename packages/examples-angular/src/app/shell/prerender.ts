/**
 * The Angular app's side of the prerender hand-over (`@filter-enginez/examples-shared/prerender-core`
 * explains it): the boot screens render nothing while {@link hasPrerender} holds, and the components that
 * replace the snapshot — the dataset pages and the failure screens — remove it after their first render.
 *
 * @packageDocumentation
 */

import { afterNextRender } from '@angular/core';
import { dismissPrerender, releasePrerender } from '@filter-enginez/examples-shared/prerender-core';

export { hasPrerender } from '@filter-enginez/examples-shared/prerender-core';

/**
 * Hand the page to the calling component (a dataset page) once its first render is in the DOM: the hook
 * runs inside the same change-detection pass, before the browser paints (`releasePrerender`). Call it
 * from a constructor (it needs an injection context).
 */
export function releasePrerenderOnFirstRender(): void {
	afterNextRender(() => {
		releasePrerender();
	});
}

/**
 * Remove the prerendered snapshot once the calling component's first render is in the DOM: a screen that
 * replaces the page (a boot failure, a page error), which must not wait under a snapshot of a working
 * page. Call it from a constructor.
 */
export function dismissPrerenderOnFirstRender(): void {
	afterNextRender(() => {
		dismissPrerender();
	});
}
