/**
 * Shared origin for the plain-React app's e2e specs.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React **RTK** app on
 * `:24611`, so the plain-React specs navigate with absolute URLs built from this origin. It must match
 * the react-plain `webServer.url` in the Playwright config (and the app's `vite.config.ts`
 * `strictPort` on 24613).
 *
 * @packageDocumentation
 */

/** The plain-React app's dev-server origin. */
export const REACT_PLAIN_BASE_URL = 'http://127.0.0.1:24613';

/**
 * Build an absolute URL into the plain-React app.
 *
 * @param path - Root-relative path, e.g. `/wine`.
 * @returns The absolute URL.
 */
export function reactPlainUrl(path: string): string {
	return `${REACT_PLAIN_BASE_URL}${path}`;
}
