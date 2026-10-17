/**
 * Shared origin for the landing site's e2e specs.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React RTK app, so the specs
 * that drive the landing site — its how-it-works and comparison pages, and every app's header links to
 * it — navigate with absolute URLs built from this origin. It must match the site's `webServer.url` in
 * the Playwright config (and the site's `vite.config.ts` `strictPort` on 24617), and `SITE.devOrigin` in
 * examples-shared's verticals registry, which every app's header and Compare button link to.
 *
 * @packageDocumentation
 */

/** The landing site's dev-server origin. */
export const SITE_BASE_URL = 'http://127.0.0.1:24617';

/** Build an absolute URL into the landing site. */
export function siteUrl(path: string): string {
	return `${SITE_BASE_URL}${path}`;
}
