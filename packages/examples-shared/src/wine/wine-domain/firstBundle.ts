/**
 * The wine panel's first bundle, fetched before the panel first renders.
 *
 * @remarks
 * Every wine panel fetches its bundle (the projected counts on its chips, its histograms, which options
 * would leave nothing) in a loop that starts once the panel has rendered. So the panel's first frame had
 * bare chips ("red"), and a frame or two later they widened to "red (90,586)" and the row wrapped anew:
 * a layout shift of up to 0.0007 at a desktop width, wherever no prerendered snapshot stands over the
 * boot (a shared filtered link, a low-memory phone, a server-rendered route).
 *
 * So each route fetches that bundle between its boot (and the address's filter state) and its first
 * render, and hands it to its view: {@link fetchFirstWineBundle} for a route that passes it down
 * itself, {@link primeFirstWineBundle} and {@link primedFirstWineBundle} for the React panel, which reads
 * it beside the facets it already finds by corpus. The view's fetch loop then replaces it as usual. The
 * cost is one bundle round trip before the first render, which the boot screen (or the snapshot) covers.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { type BundleQueryable, fetchBundleOnce } from '../../filter-bundle/bundleFetcher.js';
import { buildWineBundleQuery } from './bundle.js';
import { type WineFacets, wineFacetsFor } from './facets.js';

/** An engine whose corpus the React panel can find its primed bundle by. */
export interface WineCorpusQueryable extends BundleQueryable {
	readonly core: BundleQueryable['core'] & {
		getSourceData(): readonly Wine[];
	};
}

/** Each corpus's primed first bundle, keyed like `wineFacetsFor`'s facets: by the engine's own array. */
const firstBundleByCorpus = new WeakMap<readonly Wine[], FilterBundle>();

/**
 * Fetch the bundle the wine panel would ask for first, for the engine's current state.
 *
 * @param engine - The booted engine, with the address's filter state already loaded.
 * @param facets - The corpus's facets: the panel's slider baselines, chip vocabularies and origin specs.
 * @returns The bundle, or `null` if the fetch failed: the view then starts without one, as before.
 */
export async function fetchFirstWineBundle(
	engine: BundleQueryable,
	facets: Pick<WineFacets, 'baselines' | 'originSpecs' | 'vocabularies'>,
): Promise<FilterBundle | null> {
	return fetchBundleOnce(engine, buildWineBundleQuery(facets.baselines, facets.vocabularies, facets.originSpecs));
}

/**
 * Fetch the first bundle and keep it for the panel over this engine's corpus to start from.
 *
 * @remarks
 * Called on every visit to the route, after the address's filter state is loaded, so what a panel
 * starts from is this visit's state and not a bundle kept from an earlier one. A failed fetch forgets
 * any earlier bundle for the corpus.
 *
 * @param engine - The booted engine.
 */
export async function primeFirstWineBundle(engine: WineCorpusQueryable): Promise<void> {
	const corpus = engine.core.getSourceData();
	const bundle = await fetchFirstWineBundle(engine, wineFacetsFor(corpus));

	if (bundle === null) {
		firstBundleByCorpus.delete(corpus);
	} else {
		firstBundleByCorpus.set(corpus, bundle);
	}
}

/**
 * The bundle {@link primeFirstWineBundle} kept for a corpus.
 *
 * @param corpus - The records the panel's engine holds.
 * @returns It, or `null` when none was primed.
 */
export function primedFirstWineBundle(corpus: readonly Wine[]): FilterBundle | null {
	return firstBundleByCorpus.get(corpus) ?? null;
}
