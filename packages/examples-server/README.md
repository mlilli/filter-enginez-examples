# @filter-enginez/examples-server

The **server-side / isomorphic demo**. The exact same Filter EngineZ core and JSON `FilterEngineConfig` that drive the
browser apps, running in a plain **Node** process — no browser, no framework, no rewrite. This is the proof that the
engine is isomorphic: `createFilterEngine({ sourceData, config })` → `getResultCount()` / `getResults()`, on the server.

Everything runs through [`tsx`](https://tsx.is) (a devDependency). Run `pnpm install` once first.

## CLI

```bash
# list available datasets
pnpm --filter @filter-enginez/examples-server cli --list

# filter books by the committed sample config, show 5 records
pnpm --filter @filter-enginez/examples-server cli --dataset books --config sample-configs/books.json --limit 5

# just the count, using a dataset's built-in config
pnpm --filter @filter-enginez/examples-server cli --dataset wine --count-only
```

## HTTP endpoint (zero-dependency `node:http`)

```bash
pnpm dev:api                                              # from the repository root; listens on :24618
pnpm --filter @filter-enginez/examples-server serve:api   # the same, from anywhere (override the port with PORT)
```

```bash
curl localhost:24618/datasets
curl localhost:24618/corpus/books.json   # the full corpus (for a server-backed browser engine)
curl -X POST localhost:24618/filter \
  -H 'content-type: application/json' \
  -d '{ "dataset": "books", "config": { "version": 1, "rules": [] }, "limit": 3 }'
# /query — same body, also returns result indices + predictive-disable facet metadata
curl -X POST localhost:24618/query \
  -H 'content-type: application/json' \
  -d '{ "dataset": "books", "config": { "version": 1, "rules": [] }, "limit": 3 }'
```

Routes: `GET /health`, `GET /datasets`, `GET /corpus/<dataset>.json`, `POST /filter { dataset, config, limit? }`, and
`POST /query { dataset, config, limit?, query? }`.

- **`GET /corpus/<dataset>.json`** ships the full corpus once, as `{ dataset, label, records }`, so a server-backed
  browser engine can hold a resident copy (for slider baselines, chip vocabularies, and index→record joins) exactly as
  the worker tier ships its corpus to the main thread at boot. The server stays the filtering authority — this is the
  data, not the decisions. The path ends in `.json` because, deployed, it is a static file rather than a response (see
  below).
- **`POST /query`** additionally returns the FULL `resultIndices` (a `number[]`, not sliced by `limit`) + the
  **predictive-disable facet metadata** — per-chip exclusion counts + per-slider bounds/histograms — so a server-backed
  UI reaches parity with the in-browser apps. The engine's `TypedArray` histograms are serialized to plain `number[]`,
  and the (limited) `results` array materializes records for corpus-less callers (`limit: 0` skips them). An optional
  `query` (`FilterBundleQuery`) is honored verbatim so a remote UI controls exactly which facets it needs (including
  `inSetOfSets` hierarchies + baseline-aligned histograms); omit it for a config-derived default, or pass `{}` to skip
  facet work (the mirror-sync fast path). See `src/applyQuery.ts`.

**The server-backed routes consume all of the above.** `/books-server` in both React apps and the Angular app, and
`/wine-server` in the vanilla app, render the same UI as their in-browser counterparts over a `createHttpFilterEngine`
(`FilterEngineAsync` over `fetch`), reached through each dev server's same-origin `/api` proxy. The browser never runs a
filter; every mutation round-trips here. (SvelteKit's `/books-server` and `/wine-server` run the engine in SvelteKit's
own server tier instead.)

## On Cloudflare Workers

Deployed, the same four apps have no Node process to proxy to. Each is a Cloudflare Worker with static assets, and its
`wrangler.jsonc` names [`src/cloudflareWorker.ts`](./src/cloudflareWorker.ts) as the Worker script with
`run_worker_first: ["/api/*", "!/api/corpus/*"]`. So the browser sends exactly the requests it sends in development, and
the Worker answers them with the same `handleRequest` — the isomorphic core on a third runtime, after the browser and
Node.

**The corpus is the exception: a static file, not a Worker response.** The sites run on the Workers Free plan, which
allows 10 ms of CPU per request, and serializing a corpus of several megabytes takes several times that; a Worker that
keeps exceeding the limit is stopped, and every `/api` route with it. So before `wrangler deploy`, the deploy job writes
each registered dataset's corpus into the app's assets as `api/corpus/<dataset>.json`, and the negated
`run_worker_first` pattern lets the assets answer those paths before the Worker runs:

```bash
pnpm --filter @filter-enginez/examples-server corpus:write <assets directory>/api/corpus   # write every dataset's file
pnpm --filter @filter-enginez/examples-server corpus:check <assets directory>/api/corpus   # fail if one is missing or stale
```

Each file is `JSON.stringify` of the `GET /corpus/<dataset>.json` response body, taken from `handleRequest` itself
([`src/corpusFiles.ts`](./src/corpusFiles.ts)), so the file and the route send the same bytes. A relative directory
resolves against the directory pnpm was started from. To try a deployed build of one of these apps under `wrangler dev`,
build it and run `corpus:write` into its assets first.

- [`src/workerRequestHandler.ts`](./src/workerRequestHandler.ts) strips the `/api` prefix (as the dev proxies do), calls
  `handleRequest`, and hands every other path to the static assets.
- The entry module exports only its default handler: the Workers runtime treats every named export of the main module as
  an entry point.
- Workers do not compile WebAssembly from bytes at runtime, so the Roaring-Bitmap acceleration stays off there; the
  engine's predicate path returns the same results.

## How it works

- [`src/applyConfig.ts`](./src/applyConfig.ts) — the whole isomorphic proof: boot the engine over a corpus, apply a
  `FilterEngineConfig`, report `{ total, matched, results }`.
- [`src/datasets.ts`](./src/datasets.ts) — loads `books` / `wine` from `@filter-enginez/mock-data`'s **Node-safe
  subpaths** (never the root barrel or `/handlers`, which drag MSW → `localStorage` and throw in Node). The server
  registers the two datasets its server-backed routes query; real estate is served by the browser apps only.
- [`src/cli.ts`](./src/cli.ts) / [`src/server.ts`](./src/server.ts) — thin shells over `applyConfig`, and
  [`src/cloudflareWorker.ts`](./src/cloudflareWorker.ts) the same for Workers.
- [`src/requestHandler.ts`](./src/requestHandler.ts) — the pure router (no `node:http` coupling), so it unit-tests
  without binding a port.
- [`src/corpusDocument.ts`](./src/corpusDocument.ts) — the corpus document and its URL, shared with the SvelteKit app's
  prerendered corpus routes; [`src/write-corpus.ts`](./src/write-corpus.ts) writes it to files for the deploy job.
- [`sample-configs/books.json`](./sample-configs/books.json) — a committed, valid config (regenerate with
  `pnpm --filter @filter-enginez/examples-server gen:sample`).

This package is private and never published — it's a demonstration, run through `tsx` rather than compiled (and, for
Workers, bundled by Wrangler at deploy time).
