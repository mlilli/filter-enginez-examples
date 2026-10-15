/**
 * Origin helper for the Angular app's e2e specs.
 *
 * @remarks
 * Playwright carries a single `baseURL` (the React RTK app on 5191), so every other vertical's specs
 * navigate with absolute URLs built here. Mirrors `svelteBase.ts` / `vueBase.ts` / `vanillaBase.ts`.
 *
 * The port is pinned in `packages/examples-angular/angular.json` (`serve.options.port`) and must match
 * the `webServer.url` entry in the Playwright config.
 *
 * @packageDocumentation
 */

/** The Angular app's dev-server origin. */
export const ANGULAR_BASE_URL = 'http://127.0.0.1:5190';

/**
 * Build an absolute URL into the Angular app.
 *
 * @param path - Root-relative path, e.g. `/books`.
 * @returns The absolute URL.
 */
export function angularUrl(path: string): string {
	return `${ANGULAR_BASE_URL}${path}`;
}
