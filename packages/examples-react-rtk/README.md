# @filter-enginez/examples-react-rtk

The React + Redux Toolkit demo app. It runs the engine through `react-signals` and mirrors each dataset's engine state
into a read-only Redux slice with `redux-bridge`, so components can read filter metadata with ordinary `useSelector`
calls. Dev server: `http://127.0.0.1:5174`. Live at [react-rtk.filterenginez.com](https://react-rtk.filterenginez.com).

## Routes

| Route           | What it shows                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `/`             | Landing hub: one card per dataset route                                                                      |
| `/wine`         | 150,000 synthetic wine reviews filtered in a Web Worker through `worker-bridge`; smart-filter presets        |
| `/books`        | About 10,000 books on the main thread: curated, range, chip and fuzzy-search filters with predictive disable |
| `/books-config` | The same books corpus with the whole panel generated from a JSON `FilterEngineConfig`                        |
| `/books-server` | The books UI over an HTTP engine; every filter round-trips to `examples-server` (run `pnpm dev:api` first)   |
| `/real-estate`  | Property listings: geo-radius search on a map, a metro-to-neighborhood hierarchy and must-have features      |
| `/docs`         | The shared documentation pages: rule and algorithm reference, playground and API index                       |

How the engine works is explained at [filterenginez.com/how-it-works](https://filterenginez.com/how-it-works), the one
page all six demos share; this app's `/about` redirects there.

Every dataset route keeps its filter state in a shareable URL (`url-state-router`, with a format toggle and copy-link
button) and mirrors its engine into its own Redux store, which the result count reads. Every dataset route except
`/books-config` also offers undo, redo and time travel through the devtools panel.

## Running it

```bash
pnpm dev:rtk                 # from the repository root
pnpm dev:rtk:default         # wine on the bundled 10,000-record tier, on the main thread
pnpm dev:rtk:fresh           # rebuild Vite's dependency pre-bundle first
```

The full wine tier needs the local corpus linked (see the [README](../../README.md#local-only-data)); without it the app
falls back to the 10,000-record tier.
