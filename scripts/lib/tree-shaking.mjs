/**
 * Tree-shaking rules the React apps' builds share: the workspace modules the bundler may skip when a
 * page uses nothing they define.
 *
 * @remarks
 * A bundler places each module in a chunk by who imports it, not by which of its exports are used.
 * `@filter-enginez/brand`'s entry (`src/index.ts`) re-exports every brand component, and so does its
 * loaders barrel (`src/loaders/index.ts`), and the package declares no `sideEffects`, so the bundler
 * must assume importing a barrel runs it. Every page that imports one brand component through the
 * barrel therefore imports all of them: the hub's header asks for the mark, and the startup chunk also
 * carried the Synaptic Orbit loader, which only the results header on the dataset pages draws.
 *
 * {@link SIDE_EFFECT_FREE_BARRELS} declares the two barrels free of side effects, which is true of
 * them: each is nothing but `export … from` statements (`tests/tooling/treeShaking.test.ts` holds them
 * to that). An import through a barrel then binds straight to the module that defines the name, and
 * each component lands in the chunks of the pages that draw it. The components themselves keep the
 * default: the bundler judges their own code.
 *
 * Rules rather than a function, so the bundler applies them without calling back into JavaScript. The
 * apps' `vite.config.ts` files pass them as `build.rolldownOptions.treeshake.moduleSideEffects`.
 *
 * Plain JavaScript, with its types in `tree-shaking.d.mts`, beside the other modules Vite configs load.
 *
 * @packageDocumentation
 */

/**
 * The brand package's two barrels, as module rules: a path ending in `brand/src/index.ts` or
 * `brand/src/loaders/index.ts`, with either path separator.
 */
export const SIDE_EFFECT_FREE_BARRELS = Object.freeze([
	Object.freeze({ sideEffects: false, test: /[/\\]brand[/\\]src[/\\](?:loaders[/\\])?index\.ts$/u }),
]);
