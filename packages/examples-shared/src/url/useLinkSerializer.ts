/**
 * `useLinkSerializer` — the `?f=` serializer a React route hands `<FilterEngineUrlSync>`.
 *
 * @remarks
 * Every React route that keeps its filters in `?f=` renders the sync with the shared link serializer
 * (`./linkSerializer.ts`) for the format the header toggle chose, and the route's engine core as it
 * is. This hook is the serializer half.
 *
 * It is memoized on the format, and that is load-bearing rather than tidy: the sync keys its effects
 * on the serializer, so a new one each render would tear down its engine subscription and drop a
 * write still waiting out its debounce. A format switch is the one change that should rebuild it.
 *
 * @packageDocumentation
 */

import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

import { useMemo } from 'react';

import { createLinkSerializer } from './linkSerializer.js';
import { useUrlFormat } from './urlFormatStore.js';

/**
 * The shared link serializer for the format the header toggle chose, stable until the format changes.
 *
 * @returns The serializer.
 */
export function useLinkSerializer(): EngineStateSerializer {
	const format = useUrlFormat();

	return useMemo(() => createLinkSerializer(format), [format]);
}
