/**
 * `@filter-enginez/examples-shared/page-error-core` — the words of the screen every app shows when a
 * page cannot be shown at all.
 *
 * @remarks
 * Every app loads its pages on demand, so every app has the same failure: the code of the page a
 * visitor opened does not arrive (a dropped connection, or a deploy that replaced the chunk the open tab
 * asks for), or the page fails while it renders or resolves its data. Without a screen for it the app
 * shows a blank page, which reads as a hang. Each app renders this screen in its own idiom: the React
 * apps and the documentation site through the error boundary of `examples-shared/app-router`, Vue
 * through `router.onError`, Angular through the router's navigation-error handler, the framework-free
 * app through a catch in its route rendering.
 *
 * The markup is the same everywhere, and `ui-styles` styles it (`.fe-page-error*`):
 *
 * ```html
 * <main class="fe-page-error">
 *   <div class="fe-page-error__card" role="alert">
 *     <p class="fe-page-error__title">{PAGE_ERROR_TITLE}</p>
 *     <p class="fe-page-error__detail">{pageErrorDetail(error)}</p>
 *     <p class="fe-page-error__hint">{PAGE_ERROR_HINT}</p>
 *     <a class="fe-page-error__link" href="/">{PAGE_ERROR_HOME_LABEL}</a>
 *   </div>
 * </main>
 * ```
 *
 * One `<main>`, because the failure is the page's main content and a page without a main landmark
 * fails an accessibility audit; `role="alert"` on the card rather than on the `<main>`, whose landmark
 * role it would replace, so a screen reader announces the failure. The link is a plain `href`, not a
 * router link: a page reload is what recovers from a chunk that did not load.
 *
 * React-free, for the four non-React apps.
 *
 * @packageDocumentation
 */

/** The screen's title. */
export const PAGE_ERROR_TITLE = 'This page could not load.';

/** What to do about it. */
export const PAGE_ERROR_HINT = 'Reload the page to try again.';

/** The label of the link back to the app's start page. */
export const PAGE_ERROR_HOME_LABEL = 'Go to the start page';

/** Where that link goes: the app's own root, which every app serves. */
export const PAGE_ERROR_HOME_HREF = '/';

/** The detail line for a failure that carries no message of its own. */
export const PAGE_ERROR_UNKNOWN_DETAIL = 'An unexpected error occurred.';

/**
 * The detail line for a failure: the error's own message, which names what failed (for a chunk that
 * did not load, the browser's message names the module).
 *
 * @param error - What was thrown or rejected; anything, since JavaScript can throw anything.
 * @returns The message of an `Error` or a string, or {@link PAGE_ERROR_UNKNOWN_DETAIL} when there is no
 *   text to show.
 */
export function pageErrorDetail(error: unknown): string {
	const message = error instanceof Error ? error.message : error;

	return typeof message === 'string' && message.trim() !== '' ? message : PAGE_ERROR_UNKNOWN_DETAIL;
}
