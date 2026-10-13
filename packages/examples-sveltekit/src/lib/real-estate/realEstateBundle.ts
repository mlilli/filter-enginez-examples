/**
 * `realEstateBundle` — Svelte context plumbing for the real-estate panel's predictive-disable bundle.
 *
 * @remarks
 * Deliberately rune-free, mirroring `wineBundle`. Runes in a module require the `.svelte.ts`
 * extension, which matches BOTH the shared preset's TypeScript glob (enabling type-aware lint rules)
 * and the app's own `.svelte.ts` glob (which sets `project: false` to turn them off) — producing a
 * rule that demands type information the parser was told not to produce, and eslint then refuses to
 * run at all. So the reactive state lives in the component that owns it: `<RealEstateView>` holds the
 * bundle in `$state.raw` and drives the fetch loop, and this module carries only the context key, the
 * shape, and the accessors.
 *
 * **`$state.raw` over there is load-bearing.** The bundle carries `Uint32Array` result indices and
 * `Float64Array` histogram edges; Svelte's deep reactive proxy does not preserve typed-array semantics
 * and is ruinously slow over tens of thousands of indices besides — the same trap that makes the
 * ENGINE need `$state.raw`, for the same reason.
 *
 * The context is read through a GETTER rather than handed over as a value: context is captured once at
 * component init, so a plain value would freeze at `null` and no section would ever see a bundle.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type {
	NumericBounds,
	RealEstateSliderFieldId,
} from '@filter-enginez/examples-shared/real-estate-domain';

import { getContext, setContext } from 'svelte';

/** The context key. A symbol, so it cannot collide with a consumer's own context. */
const BUNDLE_KEY = Symbol('fe:real-estate-bundle');

/* `RealEstateSliderFieldId` comes from `real-estate-domain`, where the slider clamps, steps and field
 * getters keyed by it also live — a union restated per app is a union that eventually disagrees with
 * the table it indexes. */

/** What the panel's sections read. */
export interface RealEstateBundleContext {
	/** Per-slider baseline bounds, so a section can fall back when the bundle has no answer yet. */
	readonly baselines: Record<RealEstateSliderFieldId, NumericBounds>;
	/** The current bundle, or `null` before the first round trip resolves. A GETTER — see the docblock. */
	readonly current: () => FilterBundle | null;
}

/**
 * Publish the bundle context to descendants. Call during component initialization.
 *
 * @param context - The accessor bag the sections will read.
 */
export function setRealEstateBundle(context: RealEstateBundleContext): void {
	setContext<RealEstateBundleContext>(BUNDLE_KEY, context);
}

/**
 * Read the bundle context from a descendant section.
 *
 * @returns The context, or `null` when no provider is above — which every reader must treat as "no
 *   information", rendering controls ENABLED rather than disabled. Enabled-when-unsure is the
 *   recoverable direction: the user clicks and learns the answer, whereas disabled-when-unsure means
 *   they never click and conclude the data is missing.
 */
export function getRealEstateBundle(): RealEstateBundleContext | null {
	return getContext<RealEstateBundleContext | undefined>(BUNDLE_KEY) ?? null;
}
