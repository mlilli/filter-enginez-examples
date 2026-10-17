/**
 * Playwright configuration — end-to-end tests for the six demo apps, the documentation site, the
 * landing site's how-it-works page and the server-backed routes.
 *
 * @remarks
 * Playwright's single `baseURL` is the React RTK app; every other vertical's specs import their
 * origin from a `tests/e2e/*Base.ts` helper and navigate with absolute URLs. Flows run in two
 * projects, desktop Chrome and a phone viewport, and the specs run axe scans that fail on any
 * serious or critical violation.
 *
 * ## Prerequisites (why a fresh checkout cannot run this as-is)
 *
 *   1. **Browsers.** Run `pnpm exec playwright install chromium` once.
 *   2. **Optionally, the real wine corpus, linked into the apps.** Without it every `/wine` route
 *      generates 150,000 synthetic wines in its Web Worker, and the suite runs against those. To run
 *      it against the real reviews instead, generate them once in the engine repo
 *      (`pnpm --filter @filter-enginez/mock-data regen:wine:real --accept-data-license`), then run
 *      `pnpm link:wine-corpus` here.
 *   3. **The dev servers.** `webServer` below launches one per vertical and waits for each, and
 *      every config pins `strictPort`, so a port collision is a hard failure rather than a silent
 *      reassignment. **Stop any dev servers before running the suite** — `reuseExistingServer` is
 *      `false` everywhere, deliberately. See the note above the `webServer` array.
 *
 * ## The port map (canonical — every other reference should cite this list)
 *
 * | Vertical            | Port  |
 * | ------------------- | ----- |
 * | examples-server API | 24618 |
 * | Angular             | 24610 |
 * | React RTK           | 24611 |
 * | SvelteKit           | 24612 |
 * | React plain         | 24613 |
 * | Vue                 | 24614 |
 * | vanilla             | 24615 |
 * | Documentation site  | 24616 |
 * | Landing site        | 24617 |
 *
 * Every dev server pins `strictPort`, so two apps declaring the same port fail loudly when the suite
 * boots them together; `tests/tooling/devServerPorts.test.ts` checks each app's declared port against
 * the origins this config waits on.
 *
 * @packageDocumentation
 */

import { defineConfig, devices } from '@playwright/test';

/** The React RTK app's dev-server origin (see its `vite.config.ts` — `127.0.0.1:24611`, `strictPort`). */
const BASE_URL = 'http://127.0.0.1:24611';

/**
 * The plain-React app's dev-server origin (its `vite.config.ts` pins `127.0.0.1:24613`, `strictPort`).
 * The plain-React specs (`react-plain-*.spec.ts`) import it from `tests/e2e/reactPlainBase.ts`; the
 * shared React flows run against the RTK app.
 */
const REACT_PLAIN_BASE_URL = 'http://127.0.0.1:24613';

/**
 * The SvelteKit app's dev-server origin (its `vite.config.ts` pins `127.0.0.1:24612`, `strictPort`). The
 * Svelte specs import this from `tests/e2e/svelteBase.ts` and navigate with absolute URLs, since
 * Playwright's single `baseURL` (above) points at the React app.
 */
const SVELTE_BASE_URL = 'http://127.0.0.1:24612';

/**
 * The Vue app's dev-server origin (its `vite.config.ts` pins `127.0.0.1:24614`, `strictPort`). The Vue
 * specs (`vue-*.spec.ts` + the Vue case in `notfound.spec.ts`) import this from `tests/e2e/vueBase.ts`
 * and navigate with absolute URLs, since Playwright's single `baseURL` points at the React app.
 */
const VUE_BASE_URL = 'http://127.0.0.1:24614';

/**
 * The framework-less app's dev-server origin (its `vite.config.ts` pins `127.0.0.1:24615`,
 * `strictPort`). The vanilla specs import this from `tests/e2e/vanillaBase.ts` and navigate with
 * absolute URLs, since Playwright's single `baseURL` points at the React app.
 */
const VANILLA_BASE_URL = 'http://127.0.0.1:24615';

/**
 * The Angular app's dev-server origin (its `angular.json` pins `127.0.0.1:24610`). The Angular specs
 * import this from `tests/e2e/angularBase.ts` and navigate with absolute URLs, since Playwright's
 * single `baseURL` points at the React app.
 */
const ANGULAR_BASE_URL = 'http://127.0.0.1:24610';

/**
 * The standalone documentation-site dev-server origin (its `vite.config.ts` pins `127.0.0.1:24616`,
 * `strictPort`). The docs spec (`docs-site.spec.ts`) imports this from `tests/e2e/docsBase.ts` and
 * navigates with absolute URLs, since Playwright's single `baseURL` points at the React app.
 */
const DOCS_BASE_URL = 'http://127.0.0.1:24616';

/**
 * The landing site's dev-server origin (its `vite.config.ts` pins `127.0.0.1:24617`, `strictPort`). The
 * how-it-works, compare and app-header specs import this from `tests/e2e/siteBase.ts`, and every app's
 * header and Compare button link here in development — `SITE.devOrigin` in examples-shared's verticals
 * registry.
 */
const SITE_BASE_URL = 'http://127.0.0.1:24617';

/**
 * CI-specific toggles are pushed to CLI flags rather than read from `process.env` here (a root
 * config file lints under the typeless default TS project, so `process` can't be typed cleanly).
 * In a CI environment, run: `playwright test --forbid-only --retries=1`.
 */
export default defineConfig({
	// The 150k-corpus boot is heavy, so give each assertion room.
	expect: { timeout: 20_000 },
	/**
	 * Files run in parallel; cases WITHIN a file stay in order.
	 *
	 * @remarks
	 * Left `false` deliberately. Playwright parallelizes across FILES at this setting, which is where the
	 * time is — six wine spec files, fourteen books/real-estate ones. Turning it on would additionally
	 * interleave cases inside one file, which buys little here (the shared suites are already split
	 * per vertical into their own files) and would put several corpus boots of the SAME vertical in
	 * flight at once.
	 */
	fullyParallel: false,
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] }},
		// One phone viewport pins the "critical flow on mobile" requirement: below the desktop
		// breakpoint every app moves its filter panel into a drawer, and the flows run through it.
		{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] }},
	],
	reporter: [['list'], ['html', { open: 'never' }]],
	retries: 0,
	testDir: './tests/e2e',
	timeout: 90_000,
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
	},
	// Nine servers: the Node filter API (proxied at `/api` — required by the React and Angular
	// `/books-server` routes and vanilla's `/wine-server`), one dev server per demo app, the
	// documentation site and the landing site. Booting them all at once also proves every port can be held together.
	// **`reuseExistingServer` is `false` on every entry, deliberately.** `true` reads as a
	// convenience and hides a real failure mode: the suite silently tests whatever an
	// already-running server happens to be serving, which is not necessarily the working tree. A dev
	// server started before a change carries a stale module graph, and Vite resolves a linked
	// workspace package's `exports` map ONCE at startup — a subpath added mid-session does not exist
	// for that process no matter how many files are saved. A run against it can fail for reasons
	// that are not in the code, or pass over a change it never loaded.
	//
	// `scripts/check-e2e-ports.mjs` catches the common case first, with a legible message naming
	// each occupied port and what to stop. It hangs off the `pretest:e2e*` hooks though, so it
	// cannot see `pnpm exec playwright test` or the VS Code Playwright extension. `false` is the backstop for those: Playwright refuses rather than
	// reusing. The error it gives is the opaque "Process from config.webServer was not able to
	// start" — which is why the preflight exists to get there first, not a reason to allow reuse.
	webServer: [
		{
			command: 'pnpm --filter @filter-enginez/examples-server serve:api',
			// GET /health returns 200 once the engine's WASM accel has initialized + the port is bound.
			reuseExistingServer: false,
			timeout: 60_000,
			url: 'http://localhost:24618/health',
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-react-rtk dev',
			reuseExistingServer: false,
			// The dev server itself starts fast; the long pole is the in-browser corpus boot, handled by
			// the per-test timeout + the boot wait in the specs.
			timeout: 180_000,
			url: BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-sveltekit dev',
			// The SvelteKit app pins `strictPort` on 24612 (see its `vite.config.ts`). The Svelte specs
			// (`svelte-*.spec.ts`) target this origin via `SVELTE_BASE_URL` (see `tests/e2e/svelteBase.ts`),
			// since Playwright's single `baseURL` points at the React app.
			reuseExistingServer: false,
			timeout: 180_000,
			url: SVELTE_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-vue dev',
			// The Vue app pins `strictPort` on 24614 (see its `vite.config.ts`). The Vue specs
			// (`vue-*.spec.ts` + the Vue case in `notfound.spec.ts`) target this origin via `VUE_BASE_URL`
			// (see `tests/e2e/vueBase.ts`), since Playwright's single `baseURL` points at the React app.
			reuseExistingServer: false,
			timeout: 180_000,
			url: VUE_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-angular dev',
			// The Angular app pins port 24610 in `angular.json`. Its specs (`angular-*.spec.ts`) target
			// this origin via `ANGULAR_BASE_URL` (see `tests/e2e/angularBase.ts`). `ng serve` is slower to
			// first-byte than Vite — it runs the AOT template compile before it listens — so it gets the
			// same generous timeout as the rest.
			reuseExistingServer: false,
			timeout: 180_000,
			url: ANGULAR_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-react-plain dev',
			// The plain-React specs (`react-plain-*.spec.ts`) target this origin via
			// `REACT_PLAIN_BASE_URL` (see `tests/e2e/reactPlainBase.ts`).
			reuseExistingServer: false,
			timeout: 180_000,
			url: REACT_PLAIN_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-vanilla dev',
			// The framework-less app pins `strictPort` on 24615. Its specs (`vanilla-*.spec.ts` + the
			// vanilla case in `notfound.spec.ts`) target this origin via `VANILLA_BASE_URL` (see
			// `tests/e2e/vanillaBase.ts`).
			reuseExistingServer: false,
			timeout: 180_000,
			url: VANILLA_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/examples-docs dev',
			// The standalone documentation site pins `strictPort` on 24616. Its spec (`docs-site.spec.ts`)
			// targets this origin via `DOCS_BASE_URL` (see `tests/e2e/docsBase.ts`).
			reuseExistingServer: false,
			timeout: 180_000,
			url: DOCS_BASE_URL,
		},
		{
			command: 'pnpm --filter @filter-enginez/site dev',
			// The landing site pins `strictPort` on 24617. Its specs (how-it-works, compare, app-header) target
			// this origin via `SITE_BASE_URL` (see `tests/e2e/siteBase.ts`), and every app's header links and
			// Compare button resolve to it in development.
			reuseExistingServer: false,
			timeout: 180_000,
			url: SITE_BASE_URL,
		},
	],
	/**
	 * How many tests run at once — MEASURED, not chosen.
	 *
	 * @remarks
	 * `scripts/measure-e2e-parallelism.sh` times the six wine spec files (chromium only — the heaviest
	 * slice, and where concurrency would break first):
	 *
	 * | workers | wall  | verdict |
	 * | ------- | ----- | ------- |
	 * | 1       | 371 s | green   |
	 * | 2       | 219 s | green   |
	 * | 4       | 151 s | green   |
	 * | 6       |  99 s | green   |
	 * | 8       | 102 s | green   |
	 *
	 * Six workers is the worst case for the obvious hazard: each wine test builds a 150k-record
	 * corpus, and with six wine files across six workers all six corpus boots are in flight at once.
	 * It stays green there.
	 *
	 * 99 s is a saturation floor, not a plateau. With `fullyParallel: false` Playwright parallelizes
	 * across FILES, and six files across six workers means one file each, so the slice cannot go below
	 * its slowest single file; eight workers is no faster because workers seven and eight have no file
	 * to pick up. Whether the full suite supports more than six is measurable only by timing it.
	 *
	 * `svelte-wine-server.spec.ts` can race the Vite dev server's on-demand SSR transforms into a
	 * transient 500 under load, which is why it carries its own `retries`.
	 */
	workers: 6,
});
