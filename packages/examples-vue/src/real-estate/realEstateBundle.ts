/**
 * `realEstateBundle` — Vue provide/inject plumbing for the real-estate panel's predictive-disable
 * bundle.
 *
 * @remarks
 * There is no Vue precedent for this: the books panel does predictive disable with one local
 * `computed` and no provide/inject at all, because books fetches its bundle in the same component that
 * reads it. Real estate cannot — fourteen sections read the bundle and exactly one fetcher may exist,
 * so the fetch loop lives in `<RealEstateView>` and the result has to travel down.
 *
 * ### A `shallowRef`, handed over directly
 *
 * Svelte's counterpart publishes a GETTER (`current: () => bundle`) because Svelte context is captured
 * once at component init, so a plain value would freeze at `null` and no section would ever see a
 * bundle. Vue has no such problem — a ref IS the live handle — so `current` is the ref itself and
 * sections read `current.value`.
 *
 * **`shallowRef`, never `ref`.** The bundle carries `Uint32Array` result indices and `Float64Array`
 * histogram edges. Vue's deep reactive proxy neither preserves typed-array semantics nor survives tens
 * of thousands of entries at any acceptable speed — the same trap that makes the ENGINE need
 * `shallowRef`, for the same reason. This is Vue's `$state.raw`.
 *
 * ### A `Symbol` key, not a string
 *
 * `InjectionKey<T>` over a symbol gives the inject site its type for free and cannot collide with a
 * consumer's own provide. A string key would type as `unknown` at every read.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { NumericBounds, RealEstateSliderFieldId } from '@filter-enginez/examples-shared/real-estate-domain';

import { inject, type InjectionKey, provide, type ShallowRef } from 'vue';

/** What the panel's sections read. */
export interface RealEstateBundleContext {
	/** Per-slider baseline bounds, so a section can fall back when the bundle has no answer yet. */
	readonly baselines: Record<RealEstateSliderFieldId, NumericBounds>;
	/** The current bundle, or `null` before the first round trip resolves. */
	readonly current: ShallowRef<FilterBundle | null>;
}

/** The injection key. A symbol, so it cannot collide with a consumer's own provide. */
const BUNDLE_KEY: InjectionKey<RealEstateBundleContext> = Symbol('fe:real-estate-bundle');

/**
 * Publish the bundle context to descendants. Call during `setup()`.
 *
 * @param context - The bag the sections will read.
 */
export function provideRealEstateBundle(context: RealEstateBundleContext): void {
	provide(BUNDLE_KEY, context);
}

/**
 * Read the bundle context from a descendant section.
 *
 * @returns The context, or `null` when no provider is above — which every reader must treat as "no
 *   information", rendering controls ENABLED rather than disabled. Enabled-when-unsure is the
 *   recoverable direction: the user clicks and learns the answer, whereas disabled-when-unsure means
 *   they never click and conclude the data is missing.
 */
export function injectRealEstateBundle(): RealEstateBundleContext | null {
	return inject(BUNDLE_KEY, null);
}
