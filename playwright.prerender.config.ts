/**
 * Playwright configuration for the prerender suite: the six apps' PRODUCTION builds, which hold the
 * prerendered dataset pages a development server never serves.
 *
 * @remarks
 * Run `pnpm build` first, then `pnpm test:e2e:prerender`. `scripts/serve-builds.mjs` serves each build
 * as it is deployed (a Worker in front of static assets for five apps, SvelteKit's Node build) and
 * refuses to start when one is missing.
 *
 * ## The port map (each app's development port plus ten; `playwright.config.ts` has those)
 *
 * | Vertical    | Port  |
 * | ----------- | ----- |
 * | Angular     | 24620 |
 * | React RTK   | 24621 |
 * | SvelteKit   | 24622 |
 * | React plain | 24623 |
 * | Vue         | 24624 |
 * | vanilla     | 24625 |
 *
 * The same two projects as the main suite: a desktop width and a phone, so each of a page's two
 * snapshots is shown and taken over.
 *
 * @packageDocumentation
 */

import { defineConfig, devices } from '@playwright/test';

/** The vanilla build's origin, the last port the server opens: ready means every app is up. */
const LAST_BUILD_URL = 'http://127.0.0.1:24625';

export default defineConfig({
	expect: { timeout: 20_000 },
	fullyParallel: false,
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] }},
		{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] }},
	],
	reporter: [['list']],
	retries: 0,
	testDir: './tests/e2e',
	testMatch: 'prerender.spec.ts',
	timeout: 90_000,
	webServer: [
		{
			command: 'node scripts/serve-builds.mjs',
			reuseExistingServer: false,
			timeout: 60_000,
			url: LAST_BUILD_URL,
		},
	],
	workers: 4,
});
