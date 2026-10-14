/**
 * @fileoverview The `coverage.exclude` list for the root Vitest config.
 *
 * @remarks
 * ### Why this is its own file
 *
 * It keeps `vitest.config.ts` under its 500-line `max-lines` cap. The house standard is explicit that
 * the answer to `max-lines` is to split the file, not to disable the rule — and the split is honest
 * here rather than mechanical: this list is a
 * DOCUMENT. Nearly all of its length is reasoning about why individual modules are or are not
 * measured, it is edited on its own schedule, and two tooling guards read it as text. The runtime
 * config around it is barely fifty lines of actual configuration.
 *
 * ⚠ **The `.config.ts` suffix is load-bearing, not decorative.** The shared ESLint preset's
 * `allowDefaultProject` admits exactly `*.config.js`, `*.config.mjs`, `*.config.ts` and
 * `eslint.config.js` at the repo root — no package tsconfig includes root tooling files, so a
 * root-level TypeScript file named anything else fails typed linting with "not found in any
 * project". Renaming this to, say, `vitest-coverage-exclude.ts` would break `pnpm lint` in a way
 * whose message points at the type system rather than at the filename.
 *
 * 🔴 **Two tooling guards parse this file as TEXT**, not by importing it —
 * `vanillaCoverageExclusions.test.ts` and `reactPlainCoverageExclusions.test.ts`, both through
 * `tests/tooling/support/coverageExclusions.ts`. They strip comment lines first, because the blocks
 * below quote the blanket globs they replaced and a matcher over the raw file picks those up and
 * fails every assertion against a correct config. If this file is ever renamed, that reader is the
 * thing to change with it.
 *
 * @packageDocumentation
 */

/** Paths the V8 coverage provider must not measure. See each block for its rationale. */
export const COVERAGE_EXCLUDE: readonly string[] = [
	'**/*.d.ts',
	'**/*.test.{ts,tsx}',
	'**/dist/**',
	'**/test-support/**',
	// Same category, one layer up: `examples-shared/src/mocks/` is the single shared
	// `setupWorker` registration every demo app calls from its entry point. It is pure
	// browser wiring — `msw/browser`'s `setupWorker` needs a real `navigator.serviceWorker`
	// to register against, which jsdom does not provide, and the handlers it registers are
	// the same relative-basePath ones excluded above. Its one decision (the full-corpus
	// passthrough) is verified in the browser by the wine e2e, which is the only place the
	// 150k worker tier exists at all.
	'**/examples-shared/src/mocks/**',
	// Same category: `real-estate/map/createRadiusMapController.ts` is Leaflet glue. `L.map()`
	// needs a container with real layout — jsdom reports every element as 0x0 — and the
	// behavior worth checking (a marker DRAG, tiles loading, a StrictMode remount) needs a
	// real browser, so a jsdom suite here would assert that a mock was called rather than
	// that the map works. The two rules that actually DECIDE something were extracted to the
	// pure `radiusMapGeometry.ts`, which IS fully tested; the geo e2e covers the rest.
	'**/examples-shared/src/real-estate/map/createRadiusMapController.ts',
	// ─── examples-server: self-executing entrypoint shells + regen tooling ─────────
	// WHY EXCLUDED (whole-file exception): `cli.ts`
	// and `server.ts` invoke `main()` / `start()` at module top level and touch
	// `process.argv` / stdout / a bound `node:http` port, so importing them runs the
	// program (side effects) rather than testing it; `gen-sample.ts` and `write-corpus.ts`
	// write files on import. Their substantive logic lives in the pure, fully-unit-tested
	// modules (`applyConfig`, `requestHandler`, `cliArgs`, `format`, `corpusFiles`) — the
	// shells are just wiring.
	'**/examples-server/src/cli.ts',
	'**/examples-server/src/server.ts',
	'**/examples-server/src/gen-sample.ts',
	'**/examples-server/src/write-corpus.ts',
	// Same category, browser side: `wine.worker.ts` calls `exposeFilterEngineWorker` at module
	// load, so importing it registers a Comlink endpoint and needs a real worker `self`. It
	// qualifies for the exception on the same terms as the shells above — because its
	// substance lives elsewhere: the three-tier corpus fallback is in `wineCorpusLoader.ts`
	// and is covered there. What remains is the registration
	// call plus engine construction.
	'**/examples-shared/src/wine/wine.worker.ts',
	// ─── The six demo APPS: deliberately e2e-only ──────────────────────────────────
	// A DECISION, not an accident of low numbers. These are demonstrations, and their value
	// is that a real browser drives a real engine end-to-end — which is what `tests/e2e`
	// asserts, across all six verticals. Unit-testing a route shell that mostly wires
	// already-tested pieces together would inflate the percentage without adding a signal,
	// and would couple the tests to per-framework rendering details that are the very thing
	// these apps exist to vary.
	//
	// The engine, the reactive surfaces, the framework bindings, the presentation tier and
	// the shared example code are all held to 100% — that is where the reusable logic
	// lives. Note the two deliberate NON-exclusions:
	//   - `examples-shared` — the dataset/domain code the apps render THROUGH. Shared logic,
	//     so it is covered like a library.
	//   - `examples-server` — a Node demo of the isomorphic core with real unit tests; only
	//     its self-executing entry shells are excluded, individually, above.
	//
	// Deleting an entry here does not add coverage; it adds an obligation. Do that only
	// alongside a decision to unit-test that vertical.
	// ─── examples-shared: presentational components only ───────────────────────────
	// The package itself stays in scope (its shared logic is covered like a library), but its
	// pure React components are e2e-covered for the same reason the apps are: they are
	// rendered by all six verticals in a real browser, and jsdom render tests over them would
	// duplicate that while coupling to markup the apps exist to VARY.
	//
	// The split is by filename case, which is not a heuristic here — it is a convention this
	// package already follows exactly, and `tests/tooling/examplesSharedComponentSplit.test.ts`
	// enforces it: every PascalCase .tsx is a pure component (no exported hooks, no
	// createContext), and every logic-bearing .tsx is camelCase (filterBundle.tsx,
	// controlRegistry.tsx, docsRoutes.tsx, filter-bundle/index.tsx …). Those stay IN scope —
	// `filter-bundle/index.tsx` is the predictive-disable plumbing every dataset depends on,
	// and excluding it by extension would have been a real loss.
	//
	// If that convention is ever broken, the tooling test fails rather than this exclusion
	// silently swallowing a hook.
	'**/examples-shared/src/**/[A-Z]*.tsx',
	'**/examples-angular/**',
	'**/examples-docs/**',
	// ─── examples-react-plain: a TAXONOMY with one carve-out, not a debt register ──────
	// 🔴 READ THIS BEFORE ADDING A LINE, and note it runs the OPPOSITE way to the vanilla
	// list below. That one is a DEBT REGISTER: its entries are modules that ought to be
	// covered, each carries a number, and deleting one is a unit of work with a definition
	// of done. This one is a TAXONOMY: the entries are the app surface the paragraph above
	// deliberately makes e2e-only, and nobody should be paying them down.
	//
	// Naming all thirteen modules individually (which the measurement's "starting point"
	// output suggests) would blur that distinction — a thirteen-entry list reads as debt.
	// So the app's DIRECTORIES are named instead, and `src/lab/**` is simply absent, which
	// is what puts it in scope at 100%.
	//
	// Every path here is pinned by tests/tooling/reactPlainCoverageExclusions.test.ts,
	// which also asserts something the vanilla guard explicitly declines to: that every
	// directory under `examples-react-plain/src` is either named here or in its covered
	// allowlist. A new `src/whatever/` fails the gate until somebody decides which it is —
	// so the list is held in BOTH directions rather than only the one a blanket holds.
	'**/examples-react-plain/src/App.tsx',
	'**/examples-react-plain/src/books/**',
	'**/examples-react-plain/src/datasets.tsx',
	'**/examples-react-plain/src/main.tsx',
	'**/examples-react-plain/src/real-estate/**',
	// `routes/` is narrowed to one file. `DatasetRoute.tsx` has its own spec and is at 100% on
	// all four counters — asserted rather than cited, by `assert-module-covered.mjs` against a
	// `measure-react-plain-coverage.sh` artifact. `LandingPage.tsx` is genuinely app surface,
	// so it keeps the taxonomy entry the rest of this list is made of.
	'**/examples-react-plain/src/routes/LandingPage.tsx',
	'**/examples-react-plain/src/wine/**',
	// NOT excluded, and each for a stated reason rather than by omission:
	//   - `src/lab/**`   — the point of this narrowing; at 100% on all four counters
	//                      (assert-module-covered.mjs).
	//   - `src/index.tsx` — in scope, but its 100% is VACUOUS rather than earned: it is a
	//     single re-export. "Fully covered" and "has nothing to cover" print identically in
	//     the summarizer, because an empty counter is 100% by definition.
	//   - `src/types/**` — `.d.ts`, already dropped by the global `**/*.d.ts` above.
	'**/examples-react-rtk/**',
	'**/examples-sveltekit/**',
	// ─── examples-vanilla: a NAMED list, not a blanket ─────────────────────────────────
	// The one vertical the paragraph above fits poorly. Its suites run in THIS config on every
	// `pnpm test`, so its modules are measured rather than blanket-excluded.
	//
	// 🔴 READ THIS BEFORE ADDING A LINE. The list runs the opposite way to a blanket: a
	// module is IN scope unless it is named here, so a new file is covered unless somebody
	// argues otherwise.
	//
	// It is a DEBT REGISTER rather than a taxonomy, and that is forced rather than chosen:
	// the thresholds below are GLOBAL aggregates with no `perFile`, so a module in scope at
	// 94% lowers the whole repo's number instead of failing its own file. What belongs here
	// is therefore MEASURED, not judged — `bash scripts/measure-vanilla-coverage.sh`
	// re-derives it — and deleting an entry is a unit of work with a definition of done.
	//
	// Every path is pinned by tests/tooling/vanillaCoverageExclusions.test.ts, so the list
	// cannot rot into globs matching nothing while quietly implying they matter.
	//
	// The entry point and five route shells: reached by NO test. They boot an engine, mount
	// a view and wire subscriptions — the category the whole-file exception already covers for
	// examples-server's `cli.ts` / `server.ts`.
	'**/examples-vanilla/src/main.ts',
	'**/examples-vanilla/src/pages/booksPage.ts',
	'**/examples-vanilla/src/pages/booksRawPage.ts',
	'**/examples-vanilla/src/pages/landingPage.ts',
	'**/examples-vanilla/src/pages/realEstatePage.ts',
	'**/examples-vanilla/src/pages/wineServerPage.ts',
	// Browser-geometry bound. jsdom reports every element as 0×0, so the pointer paths (thumb
	// drag, track click, marker drag) have no geometry to resolve against; the KEYBOARD paths
	// and the histogram reconciliation ARE covered, in `rangeSlider.test.ts`. Leaflet needs a
	// real layout box, and the part of the map that DECIDES anything — `radiusMapGeometry` —
	// is pure and fully tested upstream in examples-shared.
	'**/examples-vanilla/src/controls/rangeSlider.ts',
	'**/examples-vanilla/src/real-estate/geoSection.ts',
	// Panel BUILDERS — books' twelve sections and wine's two fuzzy-search facets. Declarative lists
	// whose logic lives in the controls they compose and in examples-shared's bundle readers
	// (covered there). What remains is wiring, driven end-to-end by the view suites and by
	// tests/e2e.
	'**/examples-vanilla/src/books/panel.ts',
	'**/examples-vanilla/src/wine/searchSections.ts',
	// The devtools time-travel panel — 450 lines, the largest untested module here, and dense
	// DOM reconciliation over engine state that is itself fully tested.
	'**/examples-vanilla/src/controls/devtools.ts',
	// ── Reading this list ───────────────────────────────────────────────────────────
	//
	// `main.ts` and the five route shells at the top are reached by no test. The list
	// deliberately records no percentages: coverage is transitive, so a
	// row moves when an unrelated module's suite starts reaching it. Re-derive the per-file
	// table with `bash scripts/measure-vanilla-coverage.sh`, and read the list and the
	// table, never a sentence summarizing them.
	//
	// 🔴 **An entry carries a NUMBER and a REASON, and the measurement re-derives only the
	// number.** Prose beside a correct percentage reads exactly like prose beside a wrong
	// one, so re-read the module before trusting its heading — and ask whether a heading is
	// CONCRETE or a CATEGORY. A module reached through another module's suite has no sibling
	// `*.test.ts` to notice, so counting sibling files answers a narrower question than
	// "what is covered", with an answer indistinguishable from the real one. **A proxy for
	// coverage is not coverage.** Only the measurement settles it.
	'**/examples-vue/**',
	// ─── site: the how-it-works page's two shells ─────────────────────────────────────
	// The landing site is measured like a library: its Worker, the page's build-time render
	// (`prerender.ts`), its enhancement (`howItWorksPage.ts`) and the eight figures are all
	// in scope, tested in `src/how-it-works/*.test.ts`. Two modules are named out:
	//   - `main.ts` is the module script's one call, run against the real `document` and
	//     `window.location` at import — the same whole-file exception as examples-server's
	//     `cli.ts`; what it calls is `howItWorksPage.ts`, covered.
	//   - `benchmarkWidget.ts` runs a real timed workload against the wine corpus, so covering
	//     its live path means either running that workload in the suite or mocking the thing
	//     under test. Its arithmetic lives in examples-shared's `benchmarkTiming` /
	//     `benchmarkWorkload`, both at 100%, and the page test drives its markup and switches.
	'**/site/src/how-it-works/main.ts',
	'**/site/src/how-it-works/benchmarkWidget.ts',
	// The compare page's module script, the same one-call shell as the how-it-works page's `main.ts`;
	// what it calls, `comparePage.ts` and `compareView.ts`, is covered.
	'**/site/src/compare/main.ts',
	'node_modules/**',
];
