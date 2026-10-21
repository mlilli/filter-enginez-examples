/**
 * `useUrlSyncBindings` — the engine and serializer a React route hands `<FilterEngineUrlSync>`.
 *
 * @remarks
 * Every React route that keeps its filters in `?f=` renders the sync the same way: the shared link
 * serializer for the format the header toggle chose, and the route's engine core. This hook builds
 * that pair once per mount, through {@link createOwnUrlWrites}, so the sync never loads one of its own
 * earlier writes back over a newer state (see `ownUrlWrites.ts`).
 *
 * The guard lives as long as the component that calls the hook, so a format switch rebuilds only the
 * serializer, and the writes made under the old format are still recognized afterward.
 *
 * @packageDocumentation
 */

import type { FilterEngine } from '@filter-enginez/core';
import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

import { useMemo, useState } from 'react';

import { createLinkSerializer } from './linkSerializer.js';
import { createOwnUrlWrites } from './ownUrlWrites.js';
import { useUrlFormat } from './urlFormatStore.js';

/** The two props `<FilterEngineUrlSync>` needs besides the async reader. */
export interface UrlSyncBindings<T> {
	/** The engine core, with `loadConfig` guarded against the sync's own writes. */
	readonly engine: FilterEngine<T>;
	/** The shared link serializer for the chosen format, remembering what it writes. */
	readonly serializer: EngineStateSerializer;
}

/**
 * The guarded engine and link serializer for one mounted `<FilterEngineUrlSync>`.
 *
 * @param core - The route's engine core (`booted.engine.core`). Keep it stable across renders.
 * @returns The bindings, each stable until its input changes.
 */
export function useUrlSyncBindings<T>(core: FilterEngine<T>): UrlSyncBindings<T> {
	// `useState` with an initializer, not `useMemo`: the guard must outlive every re-render, and React
	// may discard a memoized value.
	const [ownWrites] = useState(() => createOwnUrlWrites());
	const format = useUrlFormat();
	const engine = useMemo(() => ownWrites.guardEngine(core), [core, ownWrites]);
	const serializer = useMemo(() => ownWrites.guardSerializer(createLinkSerializer(format)), [format, ownWrites]);

	return { engine, serializer };
}
