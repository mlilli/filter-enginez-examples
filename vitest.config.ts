/**
 * @fileoverview Root Vitest configuration for the Filter EngineZ examples monorepo.
 *
 * Plain Vitest 4: tests run in plain Node (the API server) and jsdom (the apps and
 * the browser packages).
 *
 * ## Two projects, split by runtime
 *
 * Vitest 4 removed the `vitest.workspace.*` file in favor of `test.projects`.
 * We define two projects, partitioned by the package's runtime target:
 *
 *   - **node**  — the Node API server and the landing site's Worker. No DOM.
 *   - **jsdom** — the browser-only packages (brand, react-ui, examples-shared and
 *                 the React and vanilla apps), plus the landing site's
 *                 how-it-works page.
 *
 * Each project `extends: true` so it inherits the root-level test options
 * (coverage, `clearMocks`, `passWithNoTests`) defined below.
 *
 * ## No prior build needed
 *
 * Every package's `exports["."]` points at its TypeScript source (`./src/...`),
 * so cross-package imports in tests resolve to source and Vitest transpiles them
 * on the fly — there is no `dist` dependency, hence no Turborepo `^build` gate on
 * the test run. Run from the repo root with `vitest run` (see the `test` scripts
 * in the root `package.json`).
 *
 * ## Coverage — V8
 *
 * `@vitest/coverage-v8`. Vitest 4's V8 provider uses AST-aware remapping
 * (`ast-v8-to-istanbul`) for branch-accurate coverage without source
 * instrumentation, so it is both faster than Istanbul and the modern default.
 * Defensive unreachable branches use a `v8 ignore` comment + rationale.
 *
 * 🔴 **The thresholds below ARE armed — 100% on branches, functions, lines and statements.**
 *
 * 🔴 **They are GLOBAL aggregates with no `perFile`, and that is the part worth carrying.** One
 * uncovered branch anywhere in the include set turns the whole run red and names no file — the
 * symptom points at the repo rather than at the module. That is why `vitest.coverage.config.ts`'s
 * vanilla block is a debt register with measured numbers rather than a judgement call, and why a
 * newly-measured directory (`src/lab/**`) is a risk to the aggregate rather than only to itself.
 *
 * The `coverage.exclude` list itself lives in `vitest.coverage.config.ts`, which keeps this file under
 * the 500-line `max-lines` cap — and the split is honest rather than mechanical: that list is a
 * DOCUMENT, almost all of its length reasoning about why individual modules are or are not measured,
 * while what remains here is configuration. Two tooling guards
 * parse it as text; see its own header before renaming it.
 */

import { configDefaults, defineConfig } from 'vitest/config';

import { COVERAGE_EXCLUDE } from './vitest.coverage.config.js';

/**
 * Isomorphic + Node-tooling packages — tests run under the plain Node runtime. `site` is here for its
 * Cloudflare Worker, whose runtime has no DOM either; its browser half is {@link SITE_BROWSER_TESTS}.
 */
const NODE_TEST_PACKAGES: readonly string[] = [
	'examples-server',
	'site',
];

/**
 * Browser-only packages — tests run under jsdom.
 *
 * Note `examples-vue` + `examples-sveltekit` are deliberately absent: their component tests need a
 * framework transform plugin, so they self-test via their own package-local `vitest.config.ts`.
 * `examples-vanilla` needs no plugin (it is plain TypeScript building DOM by hand), so it runs here.
 */
const BROWSER_TEST_PACKAGES: readonly string[] = [
	'brand',
	'examples-react-plain',
	'examples-react-rtk',
	'examples-shared',
	'examples-vanilla',
	'react-ui',
];

/**
 * The landing site's browser code — the home, how-it-works and compare pages — which builds DOM and so runs
 * under jsdom, while the rest of `site` (its Worker) runs under Node. One glob, used as the jsdom
 * project's extra `include` and the node project's `exclude`, so each test file runs in exactly one
 * environment. Two names in the brace group, so picomatch reads it as a group (see
 * {@link buildPackageTestGlob}).
 */
const SITE_BROWSER_TESTS = 'packages/site/src/{compare,home,how-it-works}/**/*.test.ts';

/**
 * Build a Vitest `include` glob that scopes to the `*.test.{ts,tsx}` files under
 * the `src/` of the supplied workspace packages.
 *
 * @remarks
 * 🔴 **A ONE-NAME LIST MUST NOT BECOME A BRACE GROUP.** `packages/{examples-server}/…` matches NOTHING:
 * picomatch — the matcher behind Vitest's `include` — treats a brace group without a comma as literal
 * text, and Vitest only complains when EVERY project finds no files. So a project whose list shrank to
 * one entry would run zero tests and report success. That is not hypothetical: this repo's `node`
 * project holds two packages, one deletion away from the trap. Verified against picomatch directly — `{examples-server}` false, `{examples-server,x}` true.
 *
 * @param packageNames - Unscoped package directory names under `packages/`
 * @returns One glob covering those packages' test files
 */
const buildPackageTestGlob = (packageNames: readonly string[]): string =>
	packageNames.length === 1
		? `packages/${packageNames[0] ?? ''}/src/**/*.test.{ts,tsx}`
		: `packages/{${packageNames.join(',')}}/src/**/*.test.{ts,tsx}`;

export default defineConfig({
	test: {
		// Reset spies / mocks / stubs between tests so one test's mock can't leak
		// into the next — the usual first source of flakiness in a fresh suite.
		clearMocks: true,
		coverage: {
			exclude: COVERAGE_EXCLUDE,
			include: ['packages/*/src/**/*.{ts,tsx}'],
			provider: 'v8',
			reporter: ['text', 'html', 'lcov', 'json'],
			reportOnFailure: true,
			reportsDirectory: 'coverage',
			thresholds: {
				branches: 100,
				functions: 100,
				lines: 100,
				statements: 100,
			},
		},
		/**
		 * Hook budget, raised for the same reason as {@link testTimeout} below.
		 *
		 * @remarks
		 * Set alongside `testTimeout` deliberately: the natural fix for a slow body-level `await` is to
		 * hoist it into `beforeAll`, and with the default 5s hook budget that move would trade one
		 * flake for an identical one a line higher up.
		 */
		hookTimeout: 30_000,
		// A filter that matches no test files (`vitest --changed`, a narrowed run) must not fail the run.
		passWithNoTests: true,
		projects: [
			{
				extends: true,
				test: {
					environment: 'node',
					exclude: [...configDefaults.exclude, SITE_BROWSER_TESTS],
					include: [buildPackageTestGlob(NODE_TEST_PACKAGES)],
					name: 'node',
				},
			},
			{
				extends: true,
				test: {
					environment: 'jsdom',
					include: [buildPackageTestGlob(BROWSER_TEST_PACKAGES), SITE_BROWSER_TESTS],
					name: 'jsdom',
				},
			},
			{
				// Repo-level build-configuration invariants that belong to no single package — they assert
				// relationships BETWEEN packages, or between a package and the toolchain. The motivating case is
				// Tailwind's `@source` scanning: a utility used only inside a workspace package is silently dropped
				// from the generated CSS, with no build error and no warning, because Tailwind excludes node_modules
				// (where pnpm symlinks workspace packages). Nothing else in the toolchain can see that class of bug.
				//
				// These run under plain Node because they read the filesystem. That is precisely why they cannot live
				// inside the package they describe: `examples-shared` is browser-only and carries no Node types, and
				// widening it to place a test would let any browser-only source file import `node:fs` unremarked.
				//
				// Deliberately outside `coverage.include` (which scopes to `packages/*/src`): these assert facts about
				// configuration, so there is no product code here for them to cover.
				extends: true,
				test: {
					environment: 'node',
					include: ['tests/tooling/**/*.test.ts'],
					name: 'tooling',
				},
			},
		],
		/**
		 * Per-test budget. Vitest's default is 5s; this repo needs more, for a measured reason.
		 *
		 * @remarks
		 * ### The flake this exists to kill
		 *
		 * `how-it-works/benchmark/benchmarkWorkload.test.ts`'s "resolves the bundled wine corpus" times out
		 * intermittently under a full-suite run. It calls `loadWineCorpus()`, which is a DYNAMIC
		 * `import('@filter-enginez/mock-data/wine')` — and that barrel pulls
		 * `wine/data-real-default.json`, **8.6 MB**. Measured: ~2.1s in isolation, ~1.9s with the corpus
		 * already transformed. Against a 5s budget that is a 2.3x margin, which
		 * a parallel run of hundreds of files competing for CPU eats without difficulty. It is not a cold-cache
		 * one-off; it is a structurally slow test with an inadequate margin.
		 *
		 * ### Why global rather than a third argument on that one test
		 *
		 * Because the exposure is structural, not local. Four suites import multi-megabyte corpora
		 * (`benchmarkWorkload`, `wineEngine`, `smartFilters`, `wineCorpusLoader`), and the wine corpora
		 * run 8.6 MB / 100 MB / 116 MB. Only `benchmarkWorkload` is exposed, because the other
		 * three import at MODULE TOP LEVEL — that cost lands in file-import time and counts against no
		 * test's budget. The moment any of them moves a corpus load into a test body or a `beforeAll`,
		 * it inherits the identical flake. A per-test number would fix one site and leave the class open.
		 *
		 * ### Why 30s and not 6s
		 *
		 * A timeout costs wall-clock only when it FIRES. Sizing this to barely clear the current
		 * measurement would mean re-tuning it the next time a corpus grows — and `regen:mock-data:full`
		 * exists precisely to grow them. 30s clears the largest plausible corpus parse with room, and
		 * still fails a genuinely hung test in well under the time a human waits before checking.
		 *
		 * Pinned by `tests/tooling/vitestTimeouts.test.ts`, so a later tidy-up cannot quietly restore
		 * the default and reintroduce the flake.
		 */
		testTimeout: 30_000,
	},
});
