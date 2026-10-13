/**
 * `createMirrorStore` — dataset-agnostic factory for a redux-bridge mirror store.
 *
 * @remarks
 * Every dataset route stands up its own single-slice Redux store that MIRRORS its engine (read-only
 * metadata: `resultCount`, `activeRuleIds`, `mode`, `lastChangeRuleId`, `version` — never the result
 * array, which the grid reads straight from the engine). This captures the wiring once; each
 * dataset's `store.ts` provides only its typed `useSelector` / `useDispatch`.
 *
 * See the wine `store.ts` for the full rationale on `includeResults: false`, the prepended
 * forwarding middleware, and why we mirror `engine.core` (the sync contract) rather than the facade.
 *
 * @packageDocumentation
 */

import type { FilterEngine } from '@filter-enginez/core';

import {
	attachEngineToStore,
	createFilterEngineMiddleware,
	createFilterEngineSlice,
	type FilterEngineMirrorState,
} from '@filter-enginez/redux-bridge';
import { configureStore } from '@reduxjs/toolkit';

/** The combined Redux state of a single-slice mirror store. */
export interface MirrorRootState<T> {
	readonly filters: FilterEngineMirrorState<T>;
}

/**
 * Build + wire a mirror store for a resolved engine core. Returns the store + the bridge `detach`
 * handle (call it on route teardown).
 *
 * @param engineCore - The engine to mirror + forward to (typically `bundle.engine.core`).
 */
export function createMirrorStore<T>(engineCore: FilterEngine<T>): {
	readonly detach: () => void;
	readonly store: ReturnType<typeof buildMirrorStore<T>>;
} {
	const slice = createFilterEngineSlice<T>('filters', { includeResults: false });
	const store = buildMirrorStore<T>(engineCore, slice);
	const detach = attachEngineToStore(store, engineCore, { slice });

	return { detach, store };
}

/**
 * Configure the store for a given engine core + slice. Split out so its return type can be named
 * without a circular reference.
 *
 * @internal
 */
function buildMirrorStore<T>(
	engineCore: FilterEngine<T>,
	slice: ReturnType<typeof createFilterEngineSlice<T>>,
) {
	const forwardingMiddleware = createFilterEngineMiddleware<T>({ engine: engineCore });

	return configureStore({
		// Prepend the forwarding middleware so it swallows `FILTER_ENGINE/forward/*` intents (which
		// carry live, non-serializable `FilterRule` instances) before `serializableCheck` inspects
		// them — they never reach the reducer, so there's nothing to serialize.
		middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(forwardingMiddleware),
		reducer: { [slice.name]: slice.reducer },
	});
}
