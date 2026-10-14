/**
 * `wineBundle` — Vue provide/inject plumbing for the wine panel's predictive-disable bundle.
 *
 * @remarks
 * The wine twin of `realEstateBundle.ts`, and deliberately its own module rather than a generic one:
 * the two carry different baseline key types, and a shared generic would trade a real type for a cast
 * at every one of two dozen read sites.
 *
 * Thirteen sections read the bundle and exactly one fetcher may exist, so the fetch loop lives in
 * `<WineView>` and the result travels down.
 *
 * ### A `shallowRef`, handed over directly
 *
 * Svelte's counterpart publishes a GETTER (`current: () => bundle`) because Svelte context is captured
 * once at component init, so a plain value would freeze at `null` and no section would ever see a
 * bundle. Vue has no such problem — a ref IS the live handle — so `current` is the ref itself and
 * sections read `current.value`.
 *
 * **`shallowRef`, never `ref`.** The bundle carries `Uint32Array` result indices and `Float64Array`
 * histogram edges. Vue's deep reactive proxy neither preserves typed-array semantics nor survives
 * 150k entries at any acceptable speed — the same trap that makes the ENGINE need `shallowRef`. This
 * is Vue's `$state.raw`.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { NumericBounds, SliderFieldId } from '@filter-enginez/examples-shared/wine-domain';

import { inject, type InjectionKey, provide, type ShallowRef } from 'vue';

/** What the panel's sections read. */
export interface WineBundleContext {
	/** Per-slider baseline bounds, so a section can fall back when the bundle has no answer yet. */
	readonly baselines: Record<SliderFieldId, NumericBounds>;
	/** The current bundle, or `null` before the first round trip resolves. */
	readonly current: ShallowRef<FilterBundle | null>;
}

/** The injection key. A symbol, so it cannot collide with a consumer's own provide. */
const BUNDLE_KEY: InjectionKey<WineBundleContext> = Symbol('fe:wine-bundle');

/**
 * Publish the bundle context to descendants. Call during `setup()`.
 *
 * @param context - The bag the sections will read.
 */
export function provideWineBundle(context: WineBundleContext): void {
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
export function injectWineBundle(): WineBundleContext | null {
	return inject(BUNDLE_KEY, null);
}
