/**
 * The `/real-estate` route's data: the booted real-estate engine behind the RxJS surface, and the
 * facets its panel draws.
 *
 * @remarks
 * Loaded on demand by the route's resolver in `app.routes.ts` (a dynamic `import()`), never imported
 * statically by anything on the startup graph, for the reason `books-route-data.ts` gives: this module
 * carries the engine.
 *
 * The narrow `./real-estate-boot-core` subpath, NOT `./real-estate-core` — the latter re-exports
 * `realEstateEngine.js`, which wraps the core in `createSignalsEngine` and would pull
 * `@preact/signals-core` into the one vertical that does not use it. Exactly the relationship
 * `./books-boot-core` has to `./books-core`, and the reason both bare boots exist at all.
 *
 * The facets are derived here, once, from the BOOTED corpus — the records the engine holds, which
 * is also what keeps the dataset itself out of this bundle: nothing on this path imports more than
 * the `Listing` type from it. See `real-estate-facets.ts` for why they are derived at the route.
 *
 * Importing `real-estate-facets.js` also transitively imports `real-estate-domain`, whose
 * `ContainsAllRule` self-registers with `ruleRegistry` as a module side effect. That registration is
 * what lets the must-have-features facet survive a `?f` round trip, and it happens because this
 * graph is imported at all — worth knowing before anyone "cleans up" an import that looks unused.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	bootRealEstateCore,
	type RealEstateBootMeta,
} from '@filter-enginez/examples-shared/real-estate-boot-core';
import { createRxJsEngine, type RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { readConfigFromUrl } from '../url/url-state.js';
import { deriveRealEstateFacets, type RealEstateFacets } from './real-estate-facets.js';

/**
 * What the `/real-estate` resolver puts on the route's `data`.
 *
 * @remarks
 * Carries more than the books equivalent because this panel needs more than an engine: fourteen
 * sections' worth of vocabularies, slider extents, a location hierarchy and metro centroids, all
 * derived from the booted corpus in one pass here rather than repeatedly in the panel.
 */
export interface RealEstateRouteData {
	/** The RxJS reactive surface over the booted core. */
	readonly engine: RxJsEngine<Listing>;
	/** Everything the panel needs that is not the engine. */
	readonly facets: RealEstateFacets;
	/** Boot metadata (record count, boot duration, tier) for the footer. */
	readonly meta: RealEstateBootMeta;
}

/** Memoized for the same reason `/books` is — one engine, one subscription graph, one corpus pass. */
let cachedRealEstateRouteData: Promise<RealEstateRouteData> | null = null;

/**
 * Boot the real-estate engine, wrap it in the RxJS surface and derive the panel's facets.
 *
 * @returns The engine, the derived facets and boot metadata, for the route's `data`.
 */
export async function loadRealEstateRouteData(): Promise<RealEstateRouteData> {
	cachedRealEstateRouteData ??= bootRealEstateCore().then(({ core, meta }) => {
		// Hydrate from a shared `?f` link BEFORE the engine is wrapped and anything subscribes — same
		// ordering, and the same reason, as `/books`.
		const urlConfig = readConfigFromUrl();

		if (urlConfig !== null) {
			try {
				core.loadConfig(urlConfig);
			} catch {
				// Malformed or incompatible link — open on the neutral corpus rather than failing the
				// navigation. A bad URL should never cost someone the page.
			}
		}

		return {
			engine: createRxJsEngine<Listing>(core),
			facets: deriveRealEstateFacets(core.getSourceData()),
			meta,
		};
	});

	return cachedRealEstateRouteData;
}
