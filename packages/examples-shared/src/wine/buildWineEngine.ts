/**
 * `buildWineEngine` — construct a wine `FilterEngine` from a corpus, the single source of truth
 * for engine construction shared by both boot paths.
 *
 * @remarks
 * The worker path (`wine.worker.ts`) and the main-thread path (`wineEngine.ts`'s `createMainEngine`)
 * must build the *identical* engine or the two boot modes would silently diverge. Both funnel
 * through this one call.
 *
 * **No pre-loaded rules.** By design the engine starts empty — filter rules
 * are added organically by the UI on first interaction so the devtools action log shows real
 * `addRule` / `changeRule` / `removeRule` entries. So construction is just `sourceData`, no config
 * spread (matching `wine.worker.ts`). Bitmap acceleration is initialized by each caller before
 * building (the worker in its boot phase; the main-thread path in `createMainEngine`).
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine } from '@filter-enginez/core';

/**
 * Build a wine engine over the given corpus.
 *
 * @param wines - The wine records to load as source data.
 * @returns A constructed sync `FilterEngine<Wine>` (no rules pre-registered).
 */
export function buildWineEngine(wines: readonly Wine[]): FilterEngine<Wine> {
	return createFilterEngine<Wine>({ sourceData: wines });
}
