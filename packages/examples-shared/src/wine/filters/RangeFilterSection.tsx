/**
 * `<RangeFilterSection />` — parameterized container for a continuous `RangeRule` slider.
 *
 * @remarks
 * One config-driven container for the Price / Points / ABV sections, which are near-identical save
 * for field and step. Every piece of copy and every commit decision comes from the shared wine
 * domain, as in every other app's panel: the label and the thumbs' accessible-name stem from
 * `WINE_SLIDER_COPY`, the readout format and typed-text parser from `WINE_SLIDER_TEXT`, and the rule
 * from `wineRangeRule`. Vintage is intentionally NOT covered here — it's a discrete InSet-of-years
 * masquerading as a slider, so it has its own `<VintageFilterSection />`.
 *
 * **Price's open top.** `wineRangeRule` commits `max: Infinity` when price's top thumb sits at the
 * top of the track (`WINE_OPEN_ENDED_SLIDERS`). An infinite max displays as the top of the track,
 * and the histogram's selection overlap uses the baseline max in its place.
 *
 * @packageDocumentation
 */

import type { RangeRule } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { type NumericBounds, RangeSlider } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { WINE_SLIDER_TEXT, wineSliderScale } from '../wine-domain/filterConfig.js';
import { WINE_SLIDER_COPY, wineRangeRule, type WineRangeSliderId } from '../wine-domain/panelCopy.js';
import { useBundleFieldMeta, useBundleSliderHistogram } from './filterBundle.js';
import { useBaselineBounds } from './filterConfig.js';
import { useLeaveExpressionMode } from './smartFilterSelection.js';

/**
 * Props for `<RangeFilterSection />`.
 */
export interface RangeFilterSectionProps {
	/** Rule id + bundle key for this slider (`price` / `points` / `abv`). */
	readonly ruleId: WineRangeSliderId;
	/** Step granularity. */
	readonly step: number;
}

/**
 * A continuous range-rule slider section.
 */
export const RangeFilterSection = (props: RangeFilterSectionProps): React.ReactElement => {
	const { ruleId, step } = props;
	const { format, parse } = WINE_SLIDER_TEXT[ruleId];
	const { label, sliderLabel } = WINE_SLIDER_COPY[ruleId];
	const engine = useFilterEngine<Wine>();
	// A facet edit drops any active preset first: see `smartFilterSelection.ts`.
	const leaveExpressionMode = useLeaveExpressionMode();
	const rule = useRule(ruleId) as RangeRule | undefined;
	const baseline = useBaselineBounds(ruleId);

	// Bundle slice for this field — bounds + pre-bucketed histogram computed on the worker in the
	// single round-trip kicked off at the panel root. `null` during the first render window after
	// boot; we fall back to baseline bounds + empty histogram in that case.
	const fieldMeta = useBundleFieldMeta(ruleId);
	const available: NumericBounds = fieldMeta !== null && fieldMeta.bounds.min !== null
		? { max: fieldMeta.bounds.max as number, min: fieldMeta.bounds.min }
		: baseline;

	const min = rule?.config.min ?? baseline.min;
	const max = rule?.config.max ?? baseline.max;
	// An open (infinite) max overlaps the histogram as the baseline max.
	const selectionMax = Number.isFinite(max) ? max : baseline.max;
	// The field's declared scale (log for price, linear for points and ABV) and the bars sliced for it,
	// both from the declarations every app's wine panel reads.
	const scale = useMemo(() => wineSliderScale(ruleId, baseline), [ruleId, baseline]);
	const histogram = useBundleSliderHistogram(ruleId, baseline, min, selectionMax);

	const handleChange = useCallback((next: { max: number; min: number; }): void => {
		leaveExpressionMode();
		// The slider already painted its committed thumb position (internal state), so no optimistic
		// paint here — just flip the loader, then call the engine a frame later.
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, wineRangeRule(ruleId, next, baseline)),
			markBusy: markUserAction,
		});
	}, [engine, ruleId, baseline, leaveExpressionMode]);

	// Wrapped in a <section>, like every other facet. The shared panel CSS targets
	// `.fe-filter-panel section` for the rhythm between filters, so a bare slider would silently
	// opt out of it.
	return (
		<section>
			<RangeSlider
				label={label}
				baseline={baseline}
				available={available}
				step={step}
				valueMin={min}
				valueMax={max}
				onChange={handleChange}
				format={format}
				parse={parse}
				histogram={histogram}
				scale={scale}
				ariaLabel={sliderLabel}
			/>
		</section>
	);
};
