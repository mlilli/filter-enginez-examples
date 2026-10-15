/**
 * Shared origin for the SvelteKit app's e2e specs.
 *
 * @remarks
 * Playwright's single `baseURL` (see `playwright.config.ts`) points at the React RTK app on `:5191`,
 * so the Svelte specs (every `svelte-*.spec.ts`, plus the SvelteKit cases in the cross-vertical specs)
 * navigate with absolute URLs built from this origin. It must match the SvelteKit `webServer.url` in the Playwright config
 * (and the app's `vite.config.ts` `strictPort` on 5192).
 *
 * @packageDocumentation
 */

/** The SvelteKit app's dev-server origin. */
export const SVELTE_BASE_URL = 'http://127.0.0.1:5192';

/** Build an absolute URL into the SvelteKit app. */
export function svelteUrl(path: string): string {
	return `${SVELTE_BASE_URL}${path}`;
}
