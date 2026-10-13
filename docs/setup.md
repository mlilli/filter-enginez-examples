# Setup — command and script reference

> Companion to the [README](../README.md), which covers prerequisites, the two-checkout quick start, the gates CI runs,
> moving the engine pin, and the local-only wine corpus. This page lists what the README does not: the remaining `pnpm`
> scripts, the helper scripts run directly with `bash` or `node`, and fixes for the problems a first run hits most
> often.

## More `pnpm` scripts

Every script lives in the root [`package.json`](../package.json).

### Dev servers

| Command                                             | What it does                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev:fresh`                                    | `pnpm dev`, with Vite's dependency pre-bundle rebuilt (`--force`)               |
| `pnpm dev:rtk:fresh`                                | The same for one app; `dev:plain:fresh` likewise                                |
| `pnpm dev:rtk:default`                              | The RTK app on the committed 10,000-record wine tier instead of the full corpus |
| `pnpm dev:plain:default`                            | The same for the plain React app; both have a `:fresh` variant                  |
| `pnpm --filter <app> dev`                           | Any single app, by its `@filter-enginez/examples-*` package name                |
| `pnpm --filter @filter-enginez/examples-server cli` | The Node CLI half of `examples-server`; `pnpm dev:api` runs its HTTP half       |
| `pnpm docs:site`                                    | A production build of the standalone documentation site                         |

The `:fresh` variants are the fix when an app keeps serving an old copy of an engine package after a re-pack: Vite
resolves a linked package once at startup and caches the result.

### Tests

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `pnpm test:watch`      | Vitest in watch mode                                   |
| `pnpm test:changed`    | Only the suites affected by uncommitted changes        |
| `pnpm test:ui`         | Vitest's browser UI                                    |
| `pnpm test:min`        | A one-line-per-failure summary of a full run           |
| `pnpm test:e2e:failed` | Re-run only the Playwright tests that failed last time |
| `pnpm test:e2e:ui`     | Playwright's UI mode                                   |

### Fixing, syncing, measuring

| Command                     | What it does                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint:fix`             | ESLint with `--fix`, which also applies the sort-order rules                                                              |
| `pnpm lint:markdown:fix`    | markdownlint with `--fix`                                                                                                 |
| `pnpm prettier:fix`         | Prettier, writing                                                                                                         |
| `pnpm cspell:files <paths>` | Spell-check only the named files                                                                                          |
| `pnpm sync:brand-assets`    | Copy the logomark files out of `@filter-enginez/brand` into each app that serves them statically (`:check` only compares) |
| `pnpm measure:verticals`    | Count the code each app had to write for itself; writes `benchmarks/vertical-sizes.json`                                  |
| `pnpm check:node`           | Fail if the running Node is older than [`.nvmrc`](../.nvmrc) pins                                                         |
| `pnpm clean`                | Remove build output and every `node_modules`                                                                              |

## Helper scripts

Run from the repository root. Each script's header explains why it exists and how to read its output.

| Script                                         | What it does                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bash scripts/pin-engine-ref.sh`               | Record the sibling engine checkout's commit in `.github/engine-ref`                      |
| `bash scripts/clear-angular-cache.sh`          | Remove the Angular app's build cache; `pnpm test:e2e` runs it first                      |
| `bash scripts/measure-e2e-parallelism.sh`      | Time the wine e2e slice at several Playwright worker counts                              |
| `bash scripts/measure-vanilla-coverage.sh`     | Coverage for `examples-vanilla`, the evidence for narrowing its coverage exclusions      |
| `bash scripts/measure-react-plain-coverage.sh` | The same for `examples-react-plain`                                                      |
| `bash scripts/secret-scan.sh`                  | Sweep the tree, commit messages and history for credentials (`--tree` for the tree only) |
| `node scripts/recheck-accepted-advisories.mjs` | Fail when an advisory this repository accepts has become fixable                         |

The coverage measurements are slow and memory-hungry; run them on a workstation with headroom.

## Troubleshooting

- **`pnpm install` fails on a tarball integrity hash.** The engine was re-packed since the lockfile was written. Run
  `pnpm install` without `--frozen-lockfile`; if the engine change is meant to stay, move the pin as the README
  describes.
- **`pnpm test:e2e` refuses to start because a port is in use.** A dev server is still running, and the suite will not
  test a server it did not start. Stop it; the refusal message lists the busy ports and a command that frees them.
- **The wine apps boot, but the worker never engages.** The full corpus is not linked, so the apps fell back to the
  10,000-record tier, which is below the worker threshold. Run `pnpm link:wine-corpus` after generating the corpus.
- **The Angular app serves code you already changed.** Its build cache pre-bundles linked packages and does not notice
  an export added, renamed or removed in one. Run `bash scripts/clear-angular-cache.sh` and restart it.
- **Playwright cannot find a browser.** Run `pnpm exec playwright install chromium` once.
