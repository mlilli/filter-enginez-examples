/**
 * Ambient `rbush` types for this app's typechecker.
 *
 * @remarks
 * `svelte-check` resolves `@filter-enginez/core` to its SOURCE (via package `exports`) and recompiles
 * it, so it recompiles core's geo `SpatialIndex.ts` too — which imports the untyped `rbush@4`. The
 * library packages get `rbush` types from a `paths` mapping in `tsconfig.base.json`; this app extends
 * SvelteKit's generated tsconfig instead (and overriding `paths` here would clobber `$lib`/`$app`), so
 * we provide the same minimal surface as an ambient module declaration. The app never touches `rbush`
 * directly — this only satisfies the transitive recompile of core internals. (Mirrors
 * `packages/core/src/types/rbush.d.ts`.)
 */
declare module 'rbush' {
	export interface RBushBBox {
		readonly maxX: number;
		readonly maxY: number;
		readonly minX: number;
		readonly minY: number;
	}

	export default class RBush<T extends RBushBBox> {
		constructor(maxEntries?: number);
		all(): T[];
		clear(): this;
		insert(item: T): this;
		load(items: readonly T[]): this;
		remove(item: T, equalsFn?: (a: T, b: T) => boolean): this;
		search(bbox: { maxX: number; maxY: number; minX: number; minY: number }): T[];
	}
}
