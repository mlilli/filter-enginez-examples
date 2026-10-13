/**
 * `filterConfig.ts` — the React-facing wine panel configuration surface.
 *
 * @remarks
 * Split in two so the non-React verticals (SvelteKit among them) can share the same configuration
 * without pulling in React.
 *
 * **Everything static lives in `../wine-domain/filterConfig.js` and is re-exported verbatim
 * from here.** This module adds exactly one thing: {@link useBaselineBounds}. That single hook is
 * the whole reason for the split — a hook at module scope makes the module import `react` and
 * `@filter-enginez/react-signals`, so any non-React vertical reaching for `SLIDER_FIELD_GETTERS`
 * would drag both into its bundle.
 *
 * The re-export keeps every existing React import path working unchanged, and keeps ONE definition
 * of each constant. Import from `../wine-domain/filterConfig.js` directly in framework-neutral code;
 * import from here only when you also want the hook.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { deriveBaselineBounds, type NumericBounds } from '@filter-enginez/react-ui';
import { useMemo } from 'react';

import { FALLBACK_BOUNDS, SLIDER_FIELD_GETTERS, SLIDER_STEPS, type SliderFieldId } from '../wine-domain/filterConfig.js';

export {
	BODY_ORDER,
	COLOR_ORDER,
	EMPTY_SELECTION,
	FALLBACK_BOUNDS,
	sameSelection,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
	type SliderFieldId,
	SWEETNESS_ORDER,
} from '../wine-domain/filterConfig.js';

/**
 * Derive the baseline (full-corpus) bounds for a specific slider's field. Cheap — one pass over
 * sourceData per field. Memoized on the sourceData reference so it only re-runs when the engine
 * swaps source data (typically never, post-boot).
 *
 * **Why a hook rather than a one-shot module constant.** sourceData is async-loaded inside the
 * worker boot path; the panel mounts BEFORE boot completes. Pulling baseline through a memoized
 * hook means each slider sees `FALLBACK_BOUNDS` on the first frame and the real derived bounds
 * on subsequent frames once sourceData arrives. No race, no flicker.
 *
 * @param fieldId - Which slider's field to derive.
 * @returns The baseline bounds, or the placeholder while the corpus is still loading.
 */
export function useBaselineBounds(fieldId: SliderFieldId): NumericBounds {
	const engine = useFilterEngine<Wine>();
	const sourceData = engine.core.getSourceData();

	return useMemo(() => {
		if (sourceData.length === 0) {
			return FALLBACK_BOUNDS[fieldId];
		}
		const getter = SLIDER_FIELD_GETTERS[fieldId];
		const values = sourceData.map(getter);

		// FALLBACK_BOUNDS is a pre-boot placeholder, not a ceiling — `deriveBaselineBounds` does
		// not clamp to it, which is what keeps the $800 wines and the 1945 vintages reachable.
		return deriveBaselineBounds(values, FALLBACK_BOUNDS[fieldId], SLIDER_STEPS[fieldId]);
	}, [fieldId, sourceData]);
}
