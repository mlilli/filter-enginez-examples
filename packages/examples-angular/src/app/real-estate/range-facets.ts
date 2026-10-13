/**
 * The per-render half of a real-estate range slider's inputs.
 *
 * @remarks
 * The STATIC half — the six-row table of labels, fields, formatters and parsers — is not here. It is
 * `RANGE_FACETS` in `@filter-enginez/examples-shared/real-estate-domain`, shared with the Vue and
 * SvelteKit panels, because nothing about a label or a number format is framework-shaped. A local
 * copy here would be a second spelling of a display convention, which is how a lot size comes to read
 * `1.50 ac` in one vertical and `1.5 ac` in another, over the same corpus, in a set of apps whose whole
 * purpose is the side-by-side comparison.
 *
 * What genuinely IS Angular-only is {@link RangeFacetState}, and it is Angular-only for a structural
 * reason rather than an idiomatic one. Vue and Svelte give each slider a `<RangeFacetSection>` child
 * because each child owns its own handle position as local state. This panel derives every handle
 * from `activeRules$`, so there is no per-slider state to house and therefore no per-slider
 * component — the panel renders `<fe-range-slider>` six times inside one `@for`, and needs somewhere
 * to describe the row it computes for each pass.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterRule, RangeRule, RuleId } from '@filter-enginez/core';

import {
	fieldBounds,
	fieldHistogram,
	type HistogramBucket,
	type NumericBounds,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateSliderFieldId,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';

/**
 * One slider's LIVE configuration — everything the panel recomputes per engine change.
 *
 * @remarks
 * The panel builds a `Record<RealEstateSliderFieldId, RangeFacetState>` in a single `computed`, which
 * is what keeps the template free of per-row method calls — those would rerun on every
 * change-detection pass, six times over, for values that only move when the engine does.
 */
export interface RangeFacetState {
	/**
	 * The engine's filtered-except-self bounds, or the baseline when it has no answer.
	 *
	 * @remarks
	 * Falling back to the baseline covers three cases a slider cannot tell apart: no bundle yet, the
	 * field was not queried, and no current result occupies the field. In all three the whole track
	 * reads as available, which is the honest "we don't know yet" — dimming it would claim there is
	 * nothing there.
	 */
	readonly available: NumericBounds;
	/** The full-corpus track extent. Fixed at boot; the track never rescales under a drag. */
	readonly baseline: NumericBounds;
	/**
	 * The engine's distribution for this field, or `undefined` when it has none.
	 *
	 * @remarks
	 * One step finer than {@link available}: not where the data stops, but where inside that range it
	 * sits. `undefined` rather than `[]` because the slider renders an absent overlay as nothing and an
	 * empty one as a blank 38px band above the track.
	 */
	readonly histogram?: readonly HistogramBucket[];
	/** Drag granularity and the grid the baseline was rounded onto. */
	readonly step: number;
	/** Committed upper bound, or the baseline maximum when the facet carries no rule. */
	readonly valueMax: number;
	/** Committed lower bound, or the baseline minimum when the facet carries no rule. */
	readonly valueMin: number;
}

/**
 * Derive every slider's live inputs in one pass.
 *
 * @remarks
 * A pure function rather than a method on the panel, for two reasons. It keeps the panel under the
 * 500-line cap, which matters less than the second: with no `this` it is testable against a plain
 * bundle and a plain rule map, where a method would need a `TestBed` and a booted engine to reach.
 *
 * The panel wraps it in ONE `computed` — not six, and certainly not the thirty template method calls
 * the naive version would need, which would rerun on every change-detection pass for values that
 * only move when the engine does.
 *
 * Enumerated from `REAL_ESTATE_SLIDER_FIELD_IDS` rather than from `RANGE_FACETS`, so the shared id
 * list stays the single definition of what a slider facet IS and the table stays presentation.
 *
 * @param bundle - The latest predictive-disable bundle, or `null` before the first settles.
 * @param baselines - Full-corpus track extents, fixed at boot.
 * @param activeRules - The engine's current rules, the source of every committed handle position.
 * @returns One {@link RangeFacetState} per slider, keyed by rule id.
 */
export function deriveRangeFacetStates(
	bundle: FilterBundle | null,
	baselines: Record<RealEstateSliderFieldId, NumericBounds>,
	activeRules: ReadonlyMap<RuleId, FilterRule>,
): Record<RealEstateSliderFieldId, RangeFacetState> {
	const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map((ruleId) => {
		const baseline = baselines[ruleId];
		const rule = activeRules.get(ruleId) as RangeRule | undefined;
		const valueMax = rule?.config.max ?? baseline.max;
		const valueMin = rule?.config.min ?? baseline.min;

		return [
			ruleId,
			{
				available: fieldBounds(bundle, ruleId) ?? baseline,
				baseline,
				histogram: fieldHistogram(bundle, ruleId, valueMin, valueMax),
				step: SLIDER_STEPS[ruleId],
				valueMax,
				valueMin,
			},
		] as const;
	});

	return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, RangeFacetState>;
}
