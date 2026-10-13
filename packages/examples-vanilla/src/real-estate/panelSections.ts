/**
 * `real-estate/panelSections` — the six `RangeRule` sliders, plus the baselines they and the bundle
 * query share.
 *
 * @remarks
 * Kept out of `panel.ts` for the same reason Vue has `<RangeFacetSection>` and Svelte its namesake:
 * written inline, six near-identical blocks is the shape that pushes a panel past the
 * 500-line cap, and — more to the point — the shape where the fifth copy quietly disagrees with the
 * other four.
 *
 * There is no per-slider component here, though, because there is nothing for one to own. The reactive
 * verticals give each slider a component that derives its handle position and owns its commit; this
 * panel repaints every control from the engine's committed rule map on each change, so a slider's
 * position IS `rules.get('price')?.config` and the six of them are a loop rather than six instances
 * of a component. That is the framework-less dividend, and it is why this module exports a
 * facet GROUP instead of a facet.
 *
 * Everything that varies — label, field, formatter, parser, step, clamp, rounding grid — comes from
 * `RANGE_FACETS` / `SLIDER_STEPS` / `SLIDER_CLAMPS` in `real-estate-domain`. Nothing about the six is
 * restated here, so adding a seventh facet is an entry in that table and no edit to this file.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	type FilterBundle,
	type FilterRule,
	range,
	type RangeRule,
	type RuleId,
} from '@filter-enginez/core';
import {
	deriveBaselineBounds,
	fieldBounds,
	fieldHistogram,
	type NumericBounds,
	RANGE_FACETS,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';

import type { FacetCommit } from './geoSection.js';

import { createRangeSlider } from '../controls/rangeSlider.js';
import { el } from '../dom.js';

/** Per-slider full-corpus track extents, keyed by rule id. */
export type SliderBaselines = Record<RealEstateSliderFieldId, NumericBounds>;

/** The six mounted sliders, as one unit. */
export interface SliderFacets {
	/** One `<section>` per slider, in `RANGE_FACETS` order — append them into the panel body. */
	readonly elements: readonly HTMLElement[];
	/**
	 * Re-apply every slider's committed range and its filtered-except-self zone.
	 *
	 * @param rules - The engine's active-rule map.
	 * @param bundle - The predictive-disable bundle, or `null` when unavailable.
	 */
	readonly update: (rules: ReadonlyMap<RuleId, FilterRule>, bundle: FilterBundle | null) => void;
}

/** Construction options for {@link createSliderFacets}. */
export interface SliderFacetsOptions {
	/** Full-corpus extents per slider, from {@link deriveSliderBaselines}. */
	readonly baselines: SliderBaselines;
	/** The panel's single write path. */
	readonly commit: FacetCommit;
}

/**
 * Derive every slider's full-corpus track extent from the booted corpus.
 *
 * @remarks
 * From the BOOTED corpus rather than the bundled copy, so a streamed tier that differs from the
 * fallback produces tracks that actually match the data on screen. The clamps widen a track the corpus
 * is narrower than (a 10k sample may contain no 9-bedroom listing, and a slider topping out at 6 would
 * tell the user the data stops there); the steps round the derived extents outward onto the drag grid,
 * which is what produces tidy track ends rather than `$47,300 – $1,984,000`.
 *
 * @param corpus - The booted listings.
 * @returns Baseline bounds per slider.
 */
export function deriveSliderBaselines(corpus: readonly Listing[]): SliderBaselines {
	const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map(
		(fieldId) =>
			[
				fieldId,
				deriveBaselineBounds(
					corpus.map(SLIDER_FIELD_GETTERS[fieldId]),
					SLIDER_CLAMPS[fieldId],
					SLIDER_STEPS[fieldId],
				),
			] as const,
	);

	return Object.fromEntries(entries) as SliderBaselines;
}

/**
 * Build the six range sliders.
 *
 * @param options - The baselines and the panel's commit path.
 * @returns The mounted sliders plus their shared updater.
 */
export function createSliderFacets(options: SliderFacetsOptions): SliderFacets {
	const { baselines, commit } = options;

	const facets = RANGE_FACETS.map((facet) => ({
		facet,
		slider: createRangeSlider({
			ariaLabel: facet.sliderLabel,
			format: facet.format,
			label: facet.label,
			onChange: (next) => {
				commit(facet.ruleId, range(facet.field, { max: next.max, min: next.min }));
			},
			parse: facet.parse,
			step: SLIDER_STEPS[facet.ruleId],
		}),
	}));

	return {
		// A bare `<section>` rather than the `section()` helper: that helper renders an `<h3>` label, and
		// the slider already draws its own label in its header row. The wrapper exists only so the
		// panel's `section` rhythm rule reaches it, exactly as the other verticals' markup does.
		elements: facets.map(({ slider }) => el('section', { children: [slider.element]})),

		update: (rules, bundle) => {
			for (const { facet, slider } of facets) {
				const baseline = baselines[facet.ruleId];
				const rule = rules.get(facet.ruleId) as RangeRule | undefined;
				const valueMax = rule?.config.max ?? baseline.max;
				const valueMin = rule?.config.min ?? baseline.min;

				slider.update({
					// `null` covers three cases a slider cannot tell apart — no bundle yet, the field was
					// not queried, and no result occupies the field at all. In all three the whole track
					// reads as available, which is the honest "we don't know yet"; dimming it would claim
					// there is nothing there.
					available: fieldBounds(bundle, facet.ruleId) ?? baseline,
					baseline,
					// One step finer than `available`: where inside that zone the data actually sits.
					// `undefined` renders no overlay, which is the right pre-bundle state.
					histogram: fieldHistogram(bundle, facet.ruleId, valueMin, valueMax),
					valueMax,
					valueMin,
				});
			}
		},
	};
}
