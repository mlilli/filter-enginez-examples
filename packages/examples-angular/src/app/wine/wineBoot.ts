/**
 * Angular's two answers to the questions `bootWineEngine` asks its caller.
 *
 * @remarks
 * `@filter-enginez/examples-shared/wine-core` is bundler-neutral: it takes both of
 * its bundler-specific inputs as options rather than importing them. Vite verticals satisfy them from
 * `./wine-worker-spawn` and the `VITE_WINE_TIER` default. Angular can do neither, and the two reasons
 * are different.
 *
 * ## The spawn
 *
 * `@angular/build` recognizes `new Worker(new URL('./x.worker', import.meta.url), { type: 'module' })`
 * and code-splits it. The URL argument has to be a literal, inline at the call site — the same
 * static-analysis constraint Vite's `?worker` has, expressed differently — so this cannot be
 * parameterized or moved behind an indirection without the builder losing sight of it and serving the
 * worker as an ordinary module.
 *
 * `type: 'module'` is required rather than idiomatic. Comlink and the engine's import graph are ESM;
 * a classic worker cannot `import` at all.
 *
 * ## The tier
 *
 * There is no `import.meta.env` here. `@angular/build` defines none of Vite's constants, so
 * `resolveDatasetSize()` inside `wine-core` would throw on a property read of `undefined` — which is
 * why that default is evaluated lazily and why this module must supply a value.
 *
 * The tier is therefore a **source constant**, and deliberately not an invented environment pipeline.
 * Flipping it is a one-line edit, documented below; building an `environment.ts` layer for a single
 * boolean would be more machinery than the thing it configures. If a build-time override is ever
 * wanted, `ng build --define` is the supported route and needs no code change here.
 *
 * @packageDocumentation
 */

/**
 * Records the wine route boots with.
 *
 * @remarks
 * `129_907` is the full Kaggle corpus and routes to the worker; `10_000` is the bundled default tier
 * and routes to the main thread, because `bootSignalsEngine` sends `size === threshold` to the main
 * thread by its boundary rule.
 *
 * **Set this to `10_000` to develop without the full corpus.** The 130k NDJSON is generated locally
 * (`pnpm regen:wine:real`) and symlinked (`pnpm link:wine-corpus`); without it the worker's fallback
 * chain lands on the bundled tier anyway, but it does so after two failed fetches and a boot screen
 * that looks stuck. This is the Angular equivalent of `VITE_WINE_TIER=default`.
 */
export const WINE_DATASET_SIZE = 129_907;

/**
 * Spawn the wine corpus worker, the Angular way.
 *
 * @remarks
 * A FUNCTION rather than an instance: `bootWineEngine` only spawns on the worker tier, and the
 * main-thread path must not construct a worker it will never message.
 *
 * **Returns `Worker`, not `WorkerLike`.** `worker-bridge` is not a dependency of this app — it arrives
 * transitively through `examples-shared`, exactly as it does for SvelteKit — so naming its type here
 * would mean adding a package.json edge and a tsconfig reference for one import. A DOM `Worker`
 * satisfies `WorkerLike` structurally (that interface is four methods, declared minimally so the
 * bridge stays isomorphic), so the assignment at the `bootWineEngine` call site type-checks without
 * the edge.
 *
 * @returns A freshly spawned worker.
 */
export function spawnWineWorker(): Worker {
	return new Worker(new URL('./wine.worker', import.meta.url), { type: 'module' });
}
