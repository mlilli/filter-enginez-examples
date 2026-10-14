/**
 * `<RangeFilterSection />` — parameterized container for a continuous `RangeRule` slider.
 *
 * @remarks
 * One config-driven container for the Price / Points / ABV sections, which are near-identical save
 * for field, step, and price's open-ended upper bound. Readout formatting and typed-text parsing
 * come from the shared `WINE_SLIDER_TEXT`, which every app's wine panel reads. Vintage
 * is intentionally NOT covered here — it's a discrete InSet-of-years masquerading as a slider, so
 * it has its own `<VintageFilterSection />`.
 *
 * **`openEnded` (price only).** When true, an un-set or maxed-out upper bound is the "no upper
 * limit" sentinel `+Infinity`: the rule defaults its max to Infinity, dragging the thumb to the
 * baseline max re-commits Infinity, and the histogram's selection overlap uses the baseline max in
 * place of Infinity. When false (points / abv) the max is an ordinary finite bound.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { range, type RangeRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { type NumericBounds, RangeSlider } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { WINE_SLIDER_TEXT, wineSliderScale } from '../wine-domain/filterConfig.js';
import { useBundleFieldMeta, useBundleSliderHistogram } from './filterBundle.js';
import { type SliderFieldId, useBaselineBounds } from './filterConfig.js';

/**
 * Props for `<RangeFilterSection />`.
 */
export interface RangeFilterSectionProps {
	/** Rule id + bundle key for this slider (`price` / `points` / `abv`). */
	readonly ruleId: SliderFieldId;
	/** The `Wine` data field the `RangeRule` constrains (e.g. `priceUsd`). */
	readonly fieldKey: string;
	/** Slider label. */
	readonly label: string;
	/** Accessible name for the slider group. */
	readonly ariaLabel: string;
	/** Step granularity. */
	readonly step: number;
	/** When true (price), the upper bound is open-ended (`+Infinity` sentinel). */
	readonly openEnded?: boolean;
}

/**
 * A continuous range-rule slider section.
 */
export const RangeFilterSection = (props: RangeFilterSectionProps): React.ReactElement => {
	const { ariaLabel, fieldKey, label, openEnded: isOpenEnded = false, ruleId, step } = props;
	const { format, parse } = WINE_SLIDER_TEXT[ruleId];
	const engine = useFilterEngine<Wine>();
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
	const max = rule?.config.max ?? (isOpenEnded ? Number.POSITIVE_INFINITY : baseline.max);
	// For the open-ended (price) case the histogram's selection overlap uses the baseline max in
	// place of the Infinity sentinel; otherwise the finite max is used directly.
	const selectionMax = isOpenEnded ? (Number.isFinite(max) ? max : baseline.max) : max;
	// The field's declared scale (log for price, linear for points and ABV) and the bars sliced for it,
	// both from the declarations every app's wine panel reads.
	const scale = useMemo(() => wineSliderScale(ruleId, baseline), [ruleId, baseline]);
	const histogram = useBundleSliderHistogram(ruleId, baseline, min, selectionMax);

	const handleChange = useCallback((next: { max: number; min: number; }): void => {
		// Open-ended: translate a maxed-out drag back into the Infinity sentinel so downstream code
		// keeps the "no upper bound" semantic.
		const ruleMax = isOpenEnded && next.max >= baseline.max ? Number.POSITIVE_INFINITY : next.max;

		// The slider already painted its committed thumb position (internal state), so no optimistic
		// paint here — just flip the loader, then call the engine a frame later.
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, range(fieldKey, { max: ruleMax, min: next.min })),
			markBusy: markUserAction,
		});
	}, [engine, ruleId, fieldKey, isOpenEnded, baseline.max]);

	// Wrapped in a <section>, like every other facet. The shared panel CSS targets
	// `.fe-filter-panel section` for the rhythm between filters, so a bare slider silently
	// opts out of it — which is exactly how React ended up tighter than Svelte here.
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
				ariaLabel={ariaLabel}
			/>
		</section>
	);
};
