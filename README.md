# Filter EngineZ — examples

> Demo applications, shared UI packages, and the design system for
> [Filter EngineZ](https://github.com/mlilli/filter-enginez), a generic, isomorphic, framework-agnostic TypeScript data
> filter engine.

| Field        | Value                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Author**   | Michael Lilli                                                                             |
| **Packages** | Private demonstrations — none are published to npm                                        |
| **License**  | Apache-2.0 — see [`LICENSE.md`](./LICENSE.md) and [`NOTICE.md`](./NOTICE.md)              |
| **Home**     | [filterenginez.com](https://filterenginez.com)                                            |
| **Engine**   | [`mlilli/filter-enginez`](https://github.com/mlilli/filter-enginez) — the 13 npm packages |

## What it is

This repository shows the engine working under six different front-end stacks and one server. Every app runs the same
engine over the same three mock datasets (real estate, wine, books) from `@filter-enginez/mock-data`, which is the
point: the engine does not care which framework, state library, or runtime sits on top of it.

The engine itself lives in [`filter-enginez`](https://github.com/mlilli/filter-enginez). Bugs in engine behavior belong
there; this repository is for the demos and the UI they share.

Both repositories were developed privately from May 2026; their public history begins with the first commit.

## Live demos

Every app runs on its own subdomain, built from `main` and running on synthetic data:

| Site                                                                     | What it is                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [filterenginez.com](https://filterenginez.com)                           | The landing page: what the engine is, how to install it, links to the rest      |
| [filterenginez.com/how-it-works](https://filterenginez.com/how-it-works) | How the engine works: eight animated algorithms and a live in-browser benchmark |
| [react-rtk.filterenginez.com](https://react-rtk.filterenginez.com)       | React + Redux Toolkit                                                           |
| [react.filterenginez.com](https://react.filterenginez.com)               | React, no Redux                                                                 |
| [svelte.filterenginez.com](https://svelte.filterenginez.com)             | SvelteKit, with server-side rendering and server-filtered routes                |
| [vue.filterenginez.com](https://vue.filterenginez.com)                   | Vue 3                                                                           |
| [angular.filterenginez.com](https://angular.filterenginez.com)           | Angular                                                                         |
| [vanilla.filterenginez.com](https://vanilla.filterenginez.com)           | Plain TypeScript, no framework                                                  |
| [docs.filterenginez.com](https://docs.filterenginez.com)                 | The documentation site                                                          |

The `/compare` page in any of the six opens your current filter state in all of them, and each one's landing hub links
to the one "How the engine works" page on the landing site.

## Apps

| Package                                                             | What it is                                                                              | Run with           | Port |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | ---- |
| [`examples-react-rtk`](./packages/examples-react-rtk/README.md)     | React + Redux Toolkit, with `redux-bridge`, `url-state-router`, and `worker-bridge`     | `pnpm dev:rtk`     | 5174 |
| [`examples-react-plain`](./packages/examples-react-plain/README.md) | React + `react-signals` + `url-state-router`, no Redux                                  | `pnpm dev:plain`   | 5176 |
| `examples-sveltekit`                                                | SvelteKit over `svelte-signals`, with server-side rendering                             | `pnpm dev:svelte`  | 5175 |
| `examples-vue`                                                      | Vue 3 + Vue Router over `vue-signals`                                                   | `pnpm dev:vue`     | 5178 |
| [`examples-angular`](./packages/examples-angular/README.md)         | Angular (zoneless, standalone components) over `reactive-rxjs` + `angular-rxjs`         | `pnpm dev:angular` | 4200 |
| `examples-vanilla`                                                  | Plain TypeScript and hand-written DOM, over `reactive-signals` and the bare core        | `pnpm dev:vanilla` | 5179 |
| [`examples-server`](./packages/examples-server/README.md)           | Node CLI plus a small `node:http` endpoint: the same engine and JSON config, no browser | `pnpm dev:api`     | 8787 |
| `examples-docs`                                                     | Standalone documentation site: rule and algorithm reference, live playground            | `pnpm dev:docs`    | 5180 |
| `site`                                                              | `filterenginez.com`: the landing page, and the how-it-works page rendered at build time | `pnpm dev:site`    | 5181 |

`pnpm dev` starts every app except the API server, which `pnpm dev:api` runs. Every dev server pins its port, so a
collision fails loudly; the canonical port map is in [`playwright.config.ts`](./playwright.config.ts).

## Shared packages

| Package                               | What it is                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `examples-shared`                     | Dataset-domain code shared by the apps: presentation and orchestration per dataset    |
| `react-ui`                            | Prop-driven React presentational components, with no engine or state-library imports  |
| `ui-styles`                           | Framework-agnostic component CSS on the brand tokens, used by every framework binding |
| [`brand`](./packages/brand/README.md) | Logomark, wordmark, three loaders, design tokens, and the bundled variable webfonts   |

The design system those packages implement — tokens, typography, components, previews — lives in
[`docs/branding/design-system/`](./docs/branding/design-system/README.md).

## Quick start

The apps install the engine as **packed tarballs from a sibling checkout**. Clone both repositories side by side, under
these exact directory names:

```bash
git clone https://github.com/mlilli/filter-enginez.git
git clone https://github.com/mlilli/filter-enginez-examples.git

corepack enable                               # activates the pnpm pinned in package.json

cd filter-enginez
pnpm install
bash scripts/pack-engine-tarballs.sh          # builds the engine, writes tmp/engine-tarballs/*.tgz
bash scripts/verify-tarball-imports.sh        # optional: proves every published entry point loads

cd ../filter-enginez-examples
pnpm install                                  # resolves @filter-enginez/* from ../filter-enginez/tmp/engine-tarballs/
pnpm dev:rtk                                  # or any app from the table above
```

The `overrides` block in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) is what points each `@filter-enginez/*`
dependency at its tarball.

## Development

Node comes from [`.nvmrc`](./.nvmrc) (24.18 or newer) and pnpm from the `packageManager` field in `package.json`.
`pnpm install` also installs the Git hooks: pre-commit runs typecheck, lint-staged, and the tests for changed files;
pre-push runs typecheck and the full coverage run.

### Changing the engine

1. Make the change in `../filter-enginez` and run `bash scripts/pack-engine-tarballs.sh` there.
2. Run `pnpm install` here, without `--frozen-lockfile`: a re-packed tarball has a new integrity hash, so the lockfile
   has to move.

CI checks the engine out beside this repository at the commit recorded in [`.github/engine-ref`](./.github/engine-ref),
packs it, and installs with `--frozen-lockfile`. When you commit the engine change, run `bash scripts/pin-engine-ref.sh`
to record that commit, then re-pack and install, and commit `.github/engine-ref` together with `pnpm-lock.yaml`. The
script refuses an engine checkout with uncommitted changes.

### Checks

```bash
pnpm typecheck        # tsc across every package, the e2e suite, and the tooling
pnpm lint             # ESLint, zero warnings allowed
pnpm lint:markdown    # markdownlint
pnpm prettier:check   # formatting
pnpm cspell           # spelling (American English)
pnpm test             # Vitest
pnpm test:coverage    # Vitest with the coverage thresholds
pnpm test:frameworks  # the Vue, SvelteKit and Angular component tests, under their own runners
pnpm build            # build every app and package
pnpm size             # brand bundle-size budgets (after a build)
pnpm test:e2e         # Playwright across the apps (local only; see below)
```

CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs everything above except `test:e2e`. The end-to-end
suite needs the real wine corpus, which CI does not have, so it runs locally. Before the first run, install the browser
with `pnpm exec playwright install chromium` and stop any running dev servers.

### Deployment

Each site is a [Cloudflare Worker with static assets](https://developers.cloudflare.com/workers/static-assets/), and
each package that deploys carries a `wrangler.jsonc` naming its Worker, its build output, and its custom domain. A
package is deployed if and only if it has one.

On every push to `main`, after the CI gates pass, the `deploy` job builds each of those packages for production and runs
`wrangler deploy` with it, one job per site, so one failure leaves the other sites deploying. Before uploading, it
checks that none of the local-only wine corpus is in the output and adds the bundled fonts' licenses.

- The single-page apps fall back to `index.html` for client-side routes. The four with a server-filtered route answer
  their same-origin `/api/*` with [`examples-server`'s Worker entry](./packages/examples-server/README.md), the deployed
  counterpart of the dev-server proxy.
- SvelteKit builds with `adapter-node` by default; `SVELTEKIT_ADAPTER=cloudflare` switches it to `adapter-cloudflare`,
  which is what the deploy job sets.
- `/compare`, and every link to the how-it-works page, resolves to the production origins on a deployed host and to the
  dev servers on a loopback one, so a local production preview stays local.
- `www.filterenginez.com` redirects to the apex, and `/how-it-works.html` and `/how-it-works/` to `/how-it-works`.
- Every demo app answers `/about` with a permanent redirect to `https://filterenginez.com/how-it-works`: the static ones
  from a `_redirects` file in their `public/` directory, SvelteKit from a route.

To try a deployed build locally, build the package and run
`pnpm exec wrangler dev --config packages/<name>/wrangler.jsonc` from the repository root.

## Local-only data

Everything shipped from this project uses **synthetic** data. The wine demos can also run on the real Kaggle "Wine
Reviews" dataset (about 130,000 records), but only on your machine:

```bash
cd ../filter-enginez
pnpm --filter @filter-enginez/mock-data regen:wine:real --accept-data-license

cd ../filter-enginez-examples
pnpm link:wine-corpus     # links the corpus into each app's static-asset directory
```

That dataset is licensed **CC BY-NC-SA 4.0** (attribution, non-commercial, share-alike) and its review text belongs to
WineEnthusiast. It is gitignored, never published, and every app's production build strips it, so anything deployed runs
on synthetic data. The end-to-end suite needs it linked. See [`NOTICE.md`](./NOTICE.md) for the full terms.

## Contributing and security

Issues are welcome. Pull requests are accepted from collaborators only; [`CONTRIBUTING.md`](./CONTRIBUTING.md) explains
the process and the coding standards. Report vulnerabilities privately as described in [`SECURITY.md`](./SECURITY.md).
Participation is covered by the [code of conduct](./CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](./LICENSE.md). [`NOTICE.md`](./NOTICE.md) carries the third-party attributions, the SIL Open Font
License terms for the bundled fonts, the trademark terms for the Filter EngineZ name and marks, and the terms of the
optional wine dataset.

## Author

**Mike Lilli** — [@mlilli](mailto:mlilli@innov8ia.com)

---

_Filter EngineZ is the modernization of a legacy TypeScript + React + MobX filter engine I originally built for an
automotive online inventory search experience. The new engine is a generalized, framework-agnostic, isomorphic
reimagining of those patterns — inspired-by, not migrated-from._
