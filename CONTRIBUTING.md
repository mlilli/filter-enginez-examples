# Contributing

Thank you for your interest in **Filter EngineZ**. This repository holds the demo apps and shared UI; the engine itself
is in [`filter-enginez`](https://github.com/mlilli/filter-enginez). Both are solo-maintained, and both run on the same
model:

- **Issues are welcome from everyone** — bug reports, feature requests, and usage questions.
- **Pull requests are accepted from collaborators only.** That is a GitHub repository setting, not a bot that closes
  PRs, so if you are not a collaborator the way in is an issue.
- **Every merge is my call.** I review each change personally, and nothing lands without that approval. It keeps the
  design coherent and every decision accountable to one person.

This repository is licensed under [Apache 2.0](./LICENSE.md). Unless you state otherwise, anything you submit for
inclusion is offered under those same terms — see [`NOTICE.md`](./NOTICE.md).

## Issues

Blank issues are disabled; pick the template that fits.

- **Here** — a demo app misbehaves, renders wrongly, fails a keyboard or screen-reader check, or the shared UI or design
  system has a problem. Name the app, the route, the browser, and the steps.
- **In the engine repository** — the engine returns the wrong results, throws, or is slow. If an app misbehaves because
  of the engine, report it [there](https://github.com/mlilli/filter-enginez/issues) with a reproduction that does not
  need the app.
- **Security problem** — never a public issue. Follow [`SECURITY.md`](./SECURITY.md).

## Pull requests (collaborators)

1. **Agree on the approach first.** For anything beyond a typo or a clear bug with a tight reproduction, start from an
   issue and wait for a thumbs-up. A green build is necessary but not sufficient: a change can be declined because it
   does not fit the design or the roadmap. The license lets anyone fork and modify their own copy.
2. **Set up both repositories side by side**, as the [README quick start](./README.md#quick-start) shows: the apps
   install the engine as packed tarballs from `../filter-enginez`. Node comes from [`.nvmrc`](./.nvmrc) and pnpm from
   the `packageManager` field; `pnpm check:node` confirms the Node version.
3. **Run the gates CI runs** ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm lint:markdown
   pnpm prettier:check
   pnpm cspell
   pnpm test:coverage
   pnpm test:frameworks
   pnpm build
   pnpm size
   ```

4. **Run `pnpm test:e2e` for any change a user can see.** CI has no end-to-end job, because the wine suites need the
   local-only real wine corpus (see the [README](./README.md#local-only-data)), so this run is yours to do and to report
   in the PR.
5. **If the change depends on an engine change**, land the engine change first, then move
   [`.github/engine-ref`](./.github/engine-ref) with `bash scripts/pin-engine-ref.sh` and commit it together with
   `pnpm-lock.yaml`.
6. **Open the PR against `main`** and fill in the template. There are no changesets here: nothing in this repository is
   published.

There is no response-time guarantee, but a PR that meets the standards below and solves a well-scoped problem gets the
fairest hearing.

## Standards

CI or review holds every change to these. Most are enforced by the engine's shared ESLint presets
(`@filter-enginez/eslint`) and the root configs.

- **Strict TypeScript** — `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, and no unused locals or
  parameters ([`tsconfig.base.json`](./tsconfig.base.json)); no `any`, no non-null assertions, `import type` for types.
- **Lint clean, zero warnings** — `eslint --max-warnings=0`; every `eslint-disable` needs a `-- reason`, and fixing the
  cause beats disabling the rule.
- **Sorted** — object keys, interface members, union types, and imports sort case-insensitively ascending;
  `pnpm lint:fix` applies it.
- **Small files** — at most 500 non-blank lines per source file (tests exempt), two classes per file, cyclomatic
  complexity up to 20, lines up to 150 characters. Split the file rather than disable the rule.
- **No duplication** — code two apps need goes in a shared package (`examples-shared`, `react-ui`, `ui-styles`, `brand`)
  rather than being copied between apps; styling builds on the brand tokens.
- **Accessibility** — React components are linted with the strict `jsx-a11y` rules, and the Playwright suites fail on
  any serious or critical axe violation. Everything works by keyboard, color is never the only signal, and motion
  respects `prefers-reduced-motion`.
- **Unit coverage** — Vitest thresholds are 100% for branches, functions, lines, and statements. Browser wiring and app
  shells that unit tests cannot reach are excluded in [`vitest.coverage.config.ts`](./vitest.coverage.config.ts), each
  with its reason, and covered by the end-to-end suite instead; a threshold is never lowered.
- **Tests describe behavior** — test what a user observes rather than internals, and keep every `expect` unconditional.
  End-to-end runs include a phone viewport.
- **Ports and builds** — each dev server pins its port (the map is in [`playwright.config.ts`](./playwright.config.ts)),
  and each app's build ends by stripping the local-only corpus.
- **Bundle budgets** — the brand mark, wordmark, and loaders have gzipped size budgets in
  [`.size-limit.json`](./.size-limit.json). Each demo app's build also fails when the JavaScript its first screen loads
  exceeds the budget in its `build` script ([`scripts/check-startup-budget.mjs`](./scripts/check-startup-budget.mjs)):
  every dataset page loads on demand, so a static import that pulls one onto the first screen is what trips it. The same
  builds check that the first page preloads exactly the two first-screen brand fonts
  ([`scripts/check-font-preloads.mjs`](./scripts/check-font-preloads.mjs)).
- **Formatting** — Prettier (tabs, single quotes, 120 columns; Markdown wrapped at 120) and markdownlint.
- **Spelling** — American English, checked by cspell ([`cspell.config.yaml`](./cspell.config.yaml) rejects British
  forms); add a legitimate new term to its `words` list with a comment.
- **Docs and comments** — doc comments on every export; comments explain why, not what; update the relevant README in
  the same PR.

## Code of conduct

Participation here — issues, pull requests, discussions — is covered by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md),
the Contributor Covenant 2.1, adopted unmodified. It lists two private reporting channels, both of which reach me.
