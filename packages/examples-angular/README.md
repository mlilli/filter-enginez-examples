# `@filter-enginez/examples-angular`

The Angular demo app — the consumer of the engine's **RxJS reactive surface**.

Angular 22 · Angular CLI (`@angular/build`) · **zoneless** · standalone components · dev server on
**`http://127.0.0.1:4200`** · live at [angular.filterenginez.com](https://angular.filterenginez.com).

---

## What this vertical is for

The other five apps (React ×2, SvelteKit, Vue, vanilla) read the engine through `@filter-enginez/reactive-signals`. This
one reads it through
[`@filter-enginez/reactive-rxjs`](https://github.com/mlilli/filter-enginez/blob/main/packages/reactive-rxjs/README.md)
and binds it with
[`@filter-enginez/angular-rxjs`](https://github.com/mlilli/filter-enginez/blob/main/packages/angular-rxjs/README.md),
which makes it the proof that the engine's **Adapter + Facade** split (formally Bridge) is real: the engine abstraction
and the reactive-surface implementation vary independently.

The write path is unchanged. `engine.core.addRule(...)` here is byte-identical to the vanilla app's; only reads are
framework-shaped.

## Routes

| Route           | What it shows                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `/`             | Landing hub over the shared `fe-landing__*` styles                                                        |
| `/books`        | The books panel with predictive disable, results header, shareable URL state, format toggle and copy link |
| `/books-server` | The same panel, header and cards over an HTTP-backed engine; the browser runs no filtering                |
| `/real-estate`  | Property listings: geo-radius search on a Leaflet map, a location hierarchy and must-have features        |
| `/wine`         | About 130,000 wine reviews filtered in a Web Worker, with its own boot progress screen                    |
| `/compare`      | One filter state, linked across every app that serves the dataset                                         |
| Anything else   | The shared "filtered to zero" 404 page over `examples-shared/notfound-core`                               |

The landing hub's "How the engine works" link leads to
[filterenginez.com/how-it-works](https://filterenginez.com/how-it-works), the one page all six demos share; this app's
`/about` redirects there.

Every dataset route keeps its filter state in a shareable URL; `/books`, `/real-estate` and `/wine` also offer undo,
redo and time travel through the devtools panel.

## Running it

```bash
pnpm --filter @filter-enginez/examples-angular dev        # ng serve → :4200
pnpm --filter @filter-enginez/examples-angular build      # ng build → dist/
pnpm --filter @filter-enginez/examples-angular typecheck  # ngc — includes TEMPLATE type-checking
pnpm --filter @filter-enginez/examples-angular test       # ng test — component specs on the Vitest runner
pnpm --filter @filter-enginez/examples-angular lint       # eslint + angular-eslint (ts + templates)
```

## Six decisions worth knowing

### 1. Zoneless

`provideZonelessChangeDetection()`, and no `zone.js` in `polyfills`. `zone.js` exists to _infer_ that something may have
changed by patching async browser APIs; neither of this app's read paths needs the inference. `AsyncPipe` calls
`markForCheck()` itself on each emission, and `toSignal` produces a real signal the framework tracks. So the zone would
be about 30 KB earning nothing, and on the worker-backed wine route, where every filter is a Comlink round trip,
zone-patched messaging would trigger change detection on each one.

### 2. `async` pipe primary, `toSignal` documented

Reads are `engine.<field>$ | async`. One component demonstrates `toSignal(stream$, { requireSync: true })` as the
alternative, which is legal here specifically because of `reactive-rxjs`'s replay contract: every stream is a
`BehaviorSubject` seeded from live engine state, so there is always a synchronous current value. (`events$` is the
exception — a plain `Subject`, notification not state. Never `requireSync` that one.)

### 3. The engine boots in a route resolver

Angular's DI providers are synchronous; the books boot is not. The Angular-idiomatic reconciliation is a **route
resolver**, which may return a promise and blocks activation until it settles. So `/books` resolves the booted engine
into route data and the page republishes it into component-scoped DI via `provideFilterEngineFactory`. Two things fall
out of that: the landing page paints instantly and never waits on a corpus it doesn't use, and by the time any books
component constructs, `injectFilterEngine()` is guaranteed live — no boot flags, no null checks. `/real-estate` and
`/books-server` follow the same pattern. `/wine` is the exception: a 130k-record worker boot takes seconds, so the page
boots itself and renders its own progress instead of blocking navigation.

### 4. Two tsconfigs, and `noEmit` is the tricky one

`tsconfig.json` (`noEmit: true`) is what `typecheck` runs; `tsconfig.app.json` (`noEmit: false`) is what the builder
runs. That split is not cosmetic. The Angular application builder compiles through an emitting `NgtscProgram`, and
handing it a `noEmit` config yields a program containing nothing — which it then reports as:

```text
✘ [ERROR] File 'src/main.ts' not found in TypeScript compilation. [plugin angular-compiler]
```

That reads like a `files`/`include` problem and is not one. `ngc` builds an ordinary TS program and passes either way,
so **`typecheck` does not catch this — `ng build` is the real gate**, and CI runs it as part of `pnpm build`.

### 5. This app typechecks workspace packages against source, not `dist`

Its `tsconfig.json` omits the `references` array the React, Vue and vanilla apps carry. Project references make
TypeScript redirect workspace imports (`examples-shared`, `brand`) onto built `.d.ts`; the Angular compiler instead
needs to see the _sources_ of what it compiles, and those packages' `exports` maps point at `./src`. Practical upshot:
**no `turbo run build` needed before working here.** The engine packages arrive as packed tarballs whose `exports` point
at compiled `dist/`, so they need no `paths` mapping.

### 6. `/books-server` filters in another process entirely

The `/books-server` route mounts the **same** `<fe-books-filter-panel>`, `<fe-results-header>` and `<fe-book-card>` as
`/books`, over an engine built from `createHttpFilterEngine` → `createRxJsEngineFromAsync`. The browser runs no
filtering: every mutation round-trips to the `@filter-enginez/examples-server` Node process. That the components are
imported unchanged is the demonstration — the async engine abstraction composes with the **RxJS** surface, not just the
signals one.

Exactly one line of shared code knows which engine it's on. The sync `.core` shim an async engine exposes **throws** on
`applyFiltersAndQuery`, so the panel's `bundle` routes through `engine.asyncEngine.applyFiltersAndQuery` when an async
engine is present; otherwise `safeApplyBundleFromCore` would catch the throw and return `null`, and predictive disable
would stop while the page still looked fine. The React apps carry the same branch.

Two operational notes: the route needs the server running (`pnpm dev:api`, port 8787) and renders an offline screen with
that command when it isn't; and `ng serve` proxies `/api` → `:8787` via `proxy.config.json`, so the browser stays
same-origin and the server needs no CORS.

## Testing

Component specs run through `ng test` (`@angular/build:unit-test` on the **Vitest** runner — same assertion library and
reporter as the rest of the repository, no Karma). They live beside their components as `*.spec.ts` and are driven by
`tsconfig.spec.json`, which needs `noEmit: false` for the same reason `tsconfig.app.json` does — see decision 4.

End-to-end coverage lives in `tests/e2e/angular-*.spec.ts`, with the app registered as a Playwright `webServer` on 4200.
Those specs target the failure modes a build cannot see: a deep link rendering the landing page (a missing
`<base href>`), a status pill latching on "computing" (a busy tracker marked but never resolved), and predictive disable
going quiet on the async engine. All three compile cleanly under `ng build`, `ngc` and ESLint and are obvious in a
browser within seconds; a green build says the code compiles, not that the app works.

## See also

- [`@filter-enginez/angular-rxjs`](https://github.com/mlilli/filter-enginez/blob/main/packages/angular-rxjs/README.md) —
  the DI bindings this app consumes
- [`@filter-enginez/reactive-rxjs`](https://github.com/mlilli/filter-enginez/blob/main/packages/reactive-rxjs/README.md)
  — the stream surface + replay contract
- [`@filter-enginez/ui-styles`](../ui-styles/) — the `fe-*` CSS every vertical renders over
