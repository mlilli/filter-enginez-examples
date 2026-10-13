/**
 * `wineBundle` — Svelte context plumbing for the wine panel's predictive-disable bundle.
 *
 * @remarks
 * Deliberately rune-free, and that is a decision rather than an accident. Runes in a module require
 * the `.svelte.ts` extension, which would be the first in this repo — and that extension matches BOTH
 * the shared preset's TypeScript glob (which enables type-aware rules) and the app's own
 * `.svelte.ts` glob (which sets `project: false` to turn them off). The result is a rule that demands
 * type information the parser was told not to produce, and eslint refuses to run at all.
 *
 * (Writing those globs out literally here would end this comment early — a `*` followed by a slash
 * closes a block comment wherever it appears, including inside a backtick span.)
 *
 * Rather than loosen the lint config for one file, the reactive state lives where it naturally
 * belongs: in the component that owns it. `<WineView>` holds the bundle in `$state.raw` and drives the
 * fetch loop; this module carries only the context key, the shape, and the accessors.
 *
 * **Why `$state.raw` matters over there.** The bundle carries `Uint32Array` result indices and
 * `Float64Array` histogram edges. Svelte's deep reactive proxy does not preserve typed-array
 * semantics, and proxying 130k indices is ruinously slow besides — the same trap that makes the ENGINE
 * need `$state.raw`, for the same reason.
 *
 * The context is read through a GETTER rather than handed over as a value: context is captured once at
 * component init, so a plain value would freeze at `null` and no section would ever see a bundle.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { NumericBounds, SliderFieldId } from '@filter-enginez/examples-shared/wine-domain';

import { getContext, setContext } from 'svelte';

/** The context key. A symbol so it cannot collide with a consumer's own context. */
const BUNDLE_KEY = Symbol('fe:wine-bundle');

/** What the panel's sections read. */
export interface WineBundleContext {
	/** Per-slider baseline bounds, so a section can fall back when the bundle has no answer. */
	readonly baselines: Record<SliderFieldId, NumericBounds>;
	/** The current bundle, or `null` before the first round trip resolves. A GETTER — see the docblock. */
	readonly current: () => FilterBundle | null;
}

/**
 * Publish the bundle context to descendants. Call during component initialization.
 *
 * @param context - The accessor bag the sections will read.
 */
export function setWineBundle(context: WineBundleContext): void {
	setContext<WineBundleContext>(BUNDLE_KEY, context);
}

/**
 * Read the bundle context from a descendant section.
 *
 * @returns The context, or `null` when no provider is above — which every reader treats as "no
 *   information", rendering controls enabled rather than disabled. Enabled-when-unsure is the
 *   recoverable direction: the user clicks and learns, where disabled-when-unsure means they never
 *   click and conclude the data is absent.
 */
export function getWineBundle(): WineBundleContext | null {
	return getContext<WineBundleContext | undefined>(BUNDLE_KEY) ?? null;
}
