/**
 * Types for `tree-shaking.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so the apps' Vite configs load it as it is, and typed lint cannot read
 * types out of an unchecked `.mjs`, the same seam as `font-preloads.d.mts`. The rule's type is
 * structural, since `vite` does not resolve from this directory; it is assignable to Rolldown's
 * module-side-effects rule.
 *
 * @packageDocumentation
 */

/** One module rule: the modules whose path matches `test`, and whether they have side effects. */
export interface ModuleSideEffectsRule {
	readonly sideEffects: boolean;
	readonly test: RegExp;
}

/** The brand package's two barrels, declared free of side effects. */
export declare const SIDE_EFFECT_FREE_BARRELS: readonly ModuleSideEffectsRule[];
