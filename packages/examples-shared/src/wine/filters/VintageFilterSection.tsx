/**
 * `<VintageFilterSection />` — discrete-year vintage filter rendered as a range slider.
 *
 * @remarks
 * Vintage is configured in the engine as an `InSetRule<number>` (per `wineFilterConfig`), but users
 * think "wines from 2018-2022," not "pick individual years" — so we present a contiguous range
 * slider and materialize its `[min, max]` into the explicit set of years on each change. Spanning
 * the full baseline is treated as "no constraint" (empty set). This is why vintage can't share the
 * generic `<RangeFilterSection />` (which targets continuous `RangeRule`s).
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { inSet, type InSetRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { type HistogramBucket, type NumericBounds, RangeSlider } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { vintageBoundsFromSet, vintageYearsFromRange } from '../wine-domain/vintage.js';
import { bundleHistogramToBuckets, useBundleFieldMeta } from './filterBundle.js';
import { EMPTY_SELECTION, useBaselineBounds } from './filterConfig.js';

/**
 * The vintage range slider section.
 */
export const VintageFilterSection = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const baseline = useBaselineBounds('vintage');
	const fieldMeta = useBundleFieldMeta('vintage');
	const available: NumericBounds = fieldMeta !== null && fieldMeta.bounds.min !== null
		? { max: fieldMeta.bounds.max as number, min: fieldMeta.bounds.min }
		: baseline;

	// Vintage is stored as an InSetRule; treat the slider's [min, max] as a RANGE materialized into
	// the set of years on each change. Both conversions live in `wine-domain/vintage` so the Svelte
	// panel and the rule summaries share one definition of what a vintage selection is.
	const rule = useRule('vintage') as InSetRule<number> | undefined;
	const selected = rule?.config.set ?? EMPTY_SELECTION;
	const { max: currentMax, min: currentMin } = vintageBoundsFromSet(selected, baseline);

	// One bucket per year — per-vintage distribution view matching the actual discreteness.
	const histogram = useMemo<readonly HistogramBucket[]>(
		() => fieldMeta !== null
			? bundleHistogramToBuckets(fieldMeta.histogram, currentMin, currentMax)
			: [],
		[fieldMeta, currentMin, currentMax],
	);

	const handleChange = useCallback((next: { max: number; min: number; }): void => {
		// The slider already painted its committed position, so no optimistic paint — flip the
		// loader, then call the engine a frame later. Full-baseline span → "no constraint" (empty set).
		const years = vintageYearsFromRange(next, baseline);

		commitFilterMutation({
			callEngine: () => engine.core.addRule('vintage', inSet<number>('vintage', years)),
			markBusy: markUserAction,
		});
	}, [engine, baseline]);

	// Wrapped in a <section>, like every other facet. The shared panel CSS targets
	// `.fe-filter-panel section` for the rhythm between filters, so a bare slider silently
	// opts out of it — which is exactly how React ended up tighter than Svelte here.
	return (
		<section>
			<RangeSlider
				label="Vintage"
				baseline={baseline}
				available={available}
				step={1}
				valueMin={currentMin}
				valueMax={currentMax}
				onChange={handleChange}
				format={(n) => n.toFixed(0)}
				parse={(raw) => parseInt(raw.replace(/[\s,]/g, ''), 10)}
				histogram={histogram}
				ariaLabel="Vintage year range"
			/>
		</section>
	);
};
