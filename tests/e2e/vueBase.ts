/**
 * Shared origin for the Vue app's e2e specs.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React RTK app on `:5191`, so
 * the Vue specs (every `vue-*.spec.ts`, plus the Vue cases in the cross-vertical specs) navigate with
 * absolute URLs built from this origin. It must match the Vue `webServer.url` in the Playwright config (and the
 * app's `vite.config.ts` `strictPort` on 5194).
 *
 * @packageDocumentation
 */

/** The Vue app's dev-server origin. */
export const VUE_BASE_URL = 'http://127.0.0.1:5194';

/** Build an absolute URL into the Vue app. */
export function vueUrl(path: string): string {
	return `${VUE_BASE_URL}${path}`;
}
