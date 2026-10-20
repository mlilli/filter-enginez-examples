/**
 * The page-error screen — what a route shows when it cannot be shown: its code did not load, or its
 * render threw.
 *
 * @remarks
 * The markup and words every app renders for this (`@filter-enginez/examples-shared/page-error-core`),
 * built by hand over the shared `.fe-page-error*` classes. The router paints it into the failed
 * route's mount (`startRouter`'s `renderError`, wired in `main.ts`), in place of the empty page the
 * failure would otherwise leave. The `/wine` boot failure (`wine/bootScreen.ts`) is the same shape:
 * one `<main>` around a `role="alert"` card.
 *
 * @packageDocumentation
 */

import { el } from '@filter-enginez/examples-shared/dom';
import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	pageErrorDetail,
} from '@filter-enginez/examples-shared/page-error-core';

/**
 * Build the page-error screen.
 *
 * @param error - What the route threw; its message is the detail line.
 * @returns The screen's root, one main landmark.
 */
export function createPageErrorScreen(error: unknown): HTMLElement {
	return el('main', {
		children: [
			el('div', {
				attrs: { role: 'alert' },
				children: [
					el('p', { className: 'fe-page-error__title', text: PAGE_ERROR_TITLE }),
					el('p', { className: 'fe-page-error__detail', text: pageErrorDetail(error) }),
					el('p', { className: 'fe-page-error__hint', text: PAGE_ERROR_HINT }),
					// `target="_self"`, which the router leaves to the browser: loading the page again is
					// what recovers from a chunk that did not arrive, so this link must not route client-side.
					el('a', {
						attrs: { href: PAGE_ERROR_HOME_HREF, target: '_self' },
						className: 'fe-page-error__link',
						text: PAGE_ERROR_HOME_LABEL,
					}),
				],
				className: 'fe-page-error__card',
			}),
		],
		className: 'fe-page-error',
	});
}
