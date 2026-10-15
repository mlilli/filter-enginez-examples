/**
 * Shared origin for the framework-less app's e2e specs.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React RTK app on `:5191`,
 * so the vanilla specs navigate with absolute URLs built from this origin. It must match the vanilla
 * `webServer.url` in the Playwright config (and the app's `vite.config.ts` `strictPort` on 5195).
 *
 * @packageDocumentation
 */

/** The framework-less app's dev-server origin. */
export const VANILLA_BASE_URL = 'http://127.0.0.1:5195';

/** Build an absolute URL into the framework-less app. */
export function vanillaUrl(path: string): string {
	return `${VANILLA_BASE_URL}${path}`;
}
