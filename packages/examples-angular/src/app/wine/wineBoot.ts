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

import { FULL_TIER_SIZE } from '@filter-enginez/examples-shared/wine-core';

/**
 * Records the wine route boots with.
 *
 * @remarks
 * The full tier, 150,000 wines, which routes to the worker: the worker builds the local real corpus
 * where one is linked, and otherwise generates the synthetic tier, exactly as in the five Vite apps.
 * Read from `wine-core` rather than restated, so Angular cannot boot a different tier from the others.
 *
 * **Set this to `10_000` to boot the default tier on the main thread** — the Angular equivalent of
 * `VITE_WINE_TIER=default`. `bootSignalsEngine` sends `size === threshold` to the main thread by its
 * boundary rule.
 */
export const WINE_DATASET_SIZE: number = FULL_TIER_SIZE;

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
