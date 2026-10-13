/**
 * The boot-derived facet metadata every wine control needs, and its DI token.
 *
 * @remarks
 * The wine twin of `real-estate-facets.ts`: four values — chip vocabularies, the origin tree, its
 * flattened node specs, and the four slider baselines — all derived once from the BOOTED corpus, then
 * republished into component-scoped DI beside the engine itself. That file argues the DI-over-inputs
 * case at length and it applies unchanged here; what follows is only what wine does differently.
 *
 * ### Derived from the WORKER's corpus, and that is not the same as "the booted corpus"
 *
 * Real estate boots on the main thread, so its resolver reads `core.getSourceData()` and is done. Wine
 * runs 130k records behind Comlink, so the corpus lives in the worker and reaching it is an awaited
 * `getSourceData()` round trip — one transfer of the whole corpus, which is why {@link deriveWineFacets}
 * takes the records rather than the engine and the caller decides when to pay for them.
 *
 * The alternative is worse than it looks. `buildOriginTree()` defaults to the bundled 10k import, so a
 * tree built from it would silently omit every region that exists only in the 130k the worker actually
 * holds — a picker missing entries, with correct-looking counts on the ones it shows.
 *
 * `FALLBACK_BOUNDS` has the same trap in the other direction. It is a pre-boot PLACEHOLDER, not a
 * ceiling: using it as the live baseline would make every wine over $400, and every vintage outside
 * 2008–2024, unreachable the moment someone touched those sliders.
 *
 * ### The vocabularies are capped nowhere
 *
 * `varietal` runs to hundreds of entries and the panel slices it to 60 for display. That slice belongs
 * to the panel, not here, because the heading reports the FULL size — "Varietal (312)" over sixty
 * chips is the honest rendering, and it needs both numbers.
 *
 * @packageDocumentation
 */


import { inject, InjectionToken, type Provider } from '@angular/core';
import { deriveWineFacets, type WineFacets } from '@filter-enginez/examples-shared/wine-domain';

// Re-exported so every import site in this app reaches them through this file, which is where an
// Angular reader looks. The DERIVATION lives in `examples-shared/wine-domain` because it is pure,
// engine-free and identical for every vertical that serves wine. What stays here is the part that is
// genuinely Angular's — the token and its two helpers.
export { deriveWineFacets, type WineFacets };

/** The token the route provides and the panel's consumers inject. */
export const WINE_FACETS = new InjectionToken<WineFacets>('filter-enginez.WineFacets');

/**
 * Publish the derived facets to a component's descendants.
 *
 * @remarks
 * A FACTORY rather than a value, matching `provideRealEstateFacets`. On that route the reason is the
 * resolver; here it is stronger — the boot happens inside the page, so at the moment this providers
 * array is written the corpus has not been fetched yet. The factory runs in an injection context when
 * the view is created, which the page's `@if` guarantees is after boot.
 *
 * @param factory - Produces the facets; runs once per injector, inside an injection context.
 * @returns The provider.
 */
export function provideWineFacets(factory: () => WineFacets): Provider {
	return { provide: WINE_FACETS, useFactory: factory };
}

/**
 * Read the derived facets.
 *
 * @remarks
 * Required, unlike `injectWineBundle()`. The bundle is an ENHANCEMENT whose absence means "no
 * information yet"; these are the panel's raw materials, and a section rendering without them would
 * show an empty vocabulary — which reads as "the corpus has no red wines" rather than as a wiring bug.
 *
 * @returns The facets.
 */
export function injectWineFacets(): WineFacets {
	return inject(WINE_FACETS);
}
