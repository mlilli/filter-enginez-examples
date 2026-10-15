/**
 * Shared origin for the standalone documentation-site e2e spec.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React RTK app, so the docs
 * spec navigates with absolute URLs built from this origin. It must match the docs-site
 * `webServer.url` in the Playwright config (and the app's `vite.config.ts` `strictPort` on 5196).
 *
 * @packageDocumentation
 */

/** The standalone documentation-site dev-server origin. */
export const DOCS_BASE_URL = 'http://127.0.0.1:5196';

/** Build an absolute URL into the documentation site. */
export function docsUrl(path: string): string {
	return `${DOCS_BASE_URL}${path}`;
}
