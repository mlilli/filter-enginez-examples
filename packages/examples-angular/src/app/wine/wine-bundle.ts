/**
 * `wine-bundle` — DI plumbing for the wine panel's predictive-disable bundle.
 *
 * @remarks
 * The Angular twin of Vue's `wineBundle.ts` and Svelte's context module. Exactly one fetcher may
 * exist, and thirteen sections read its result, so the fetch loop lives in the panel and the bundle
 * travels down.
 *
 * ## Why DI here, when real estate passes inputs
 *
 * `<fe-real-estate-filter-panel>` is ONE component: its fourteen sections are inline template blocks,
 * so its bundle is a private field every section already sees, and there is nothing to thread.
 *
 * Wine cannot be one component — thirteen sections plus the preset block would put the file well past
 * the 500-line cap — so its sections are real components, and each of them needs the bundle. Threading
 * it as inputs means the panel re-deriving four values per bundle purely to hand them to four
 * children, and every section growing an input it does nothing with but forward. Angular's hierarchical
 * injector is the framework's own answer to that, and it is what Vue's `provide`/`inject` and Svelte's
 * `setContext` are doing in their idioms. So this is convergence with the other verticals, not a
 * divergence from real estate.
 *
 * The engine arrives the same way already (`injectFilterEngine()`), so a section takes DI for the two
 * ambient things and inputs for the things that genuinely differ per section.
 *
 * ## `baselines` is a plain value, `current` is a signal
 *
 * The baselines are derived once from the booted corpus and never change; the bundle is replaced on
 * every settle. Making the fixed half a signal would suggest it moves.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { NumericBounds, SliderFieldId } from '@filter-enginez/examples-shared/wine-domain';

import { inject, InjectionToken, type Provider, type Signal } from '@angular/core';

/** What the panel's sections read. */
export interface WineBundleContext {
	/** Per-slider baseline bounds, so a section has a full-corpus track before the first round trip. */
	readonly baselines: Record<SliderFieldId, NumericBounds>;
	/** The current bundle, or `null` before the first round trip resolves. */
	readonly current: Signal<FilterBundle | null>;
}

/** The token the panel provides and its sections inject. */
export const WINE_BUNDLE = new InjectionToken<WineBundleContext>('filter-enginez.WineBundle');

/**
 * Publish the bundle context to a component's descendants.
 *
 * @remarks
 * A FACTORY rather than a value, for the same reason `provideWineFacets` is one — and here there is a
 * second reason worth stating, because it is an Angular constraint people rediscover: a component's
 * `providers` array is evaluated BEFORE its class instance exists, so it cannot reference a field. The
 * holder signal therefore lives on `WineBootStore` and the factory reads it.
 *
 * @param factory - Produces the context; runs once per injector, inside an injection context.
 * @returns The provider, for a component's `providers` array.
 */
export function provideWineBundle(factory: () => WineBundleContext): Provider {
	return { provide: WINE_BUNDLE, useFactory: factory };
}

/**
 * Read the bundle context from a section.
 *
 * @remarks
 * **Optional deliberately.** A section rendered with no panel above it — which is every isolation
 * test — must treat the absence as "no information" and render its controls ENABLED. Enabled-when-unsure
 * is the recoverable direction: the user clicks and learns the answer. Disabled-when-unsure means they
 * never click, and conclude the data is missing.
 *
 * @returns The context, or `null` when nothing provided one.
 */
export function injectWineBundle(): WineBundleContext | null {
	return inject(WINE_BUNDLE, { optional: true });
}
