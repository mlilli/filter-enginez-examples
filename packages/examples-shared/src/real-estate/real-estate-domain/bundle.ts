/**
 * `real-estate-domain/bundle` — the real-estate panel's predictive-disable query.
 *
 * @remarks
 * The generic readers (`chipExclusionMap`, `chipProjectedCounts`, `chipDisabledSet`, `fieldBounds`)
 * and the fetch loop (`createBundleFetcher`) are shared and live in `filter-bundle/`. What is real
 * estate's own is the QUERY: which facets get predictive-disable data at all, and with which candidate
 * kind. A facet omitted here does not error — it silently renders all-enabled while every other facet
 * keeps working, which is why the shape is worth stating in one place both panels read.
 *
 * ### Three candidate kinds, and why each facet gets the one it does
 *
 *   - **`inSetOfSets` for location.** Each tree node is simulated against the FULL set of `locationId`
 *     values selecting it would activate. A branch queried with only its own id would match no listing
 *     — listings carry leaf paths — so every state and metro would read as permanently unavailable
 *     while the neighborhoods beneath them worked fine.
 *   - **`inSet` for the three flat string facets.** Clicking one WIDENS the facet, so the engine drops
 *     that facet's own rule while projecting: "would adding condo to my current type selection empty
 *     the results" is a question about the OTHER filters.
 *   - **`containsAll` for must-have features.** Clicking one NARROWS an existing requirement, so the
 *     engine keeps the rule active and projects each candidate on top of what is already checked.
 *     Without the distinction "solar" would look available while "garage" is checked, even when no
 *     listing has both.
 *
 * ### The two facets deliberately absent
 *
 * **Geo** is absent and still governs everything here: the engine evaluates every OTHER active rule
 * when projecting a candidate, generically and with no rule-type switch, so a 15-mile Denver radius is
 * what disables "Austin ISD". Querying the radius itself would mean projecting a continuous surface,
 * which has no candidate list.
 *
 * **Listed-date** is absent because a `DateRangeRule` preset resolves against `Date.now()` at
 * EVALUATION time — that is what keeps "last 7 days" meaning the last seven days rather than the seven
 * before page load. A count computed at bundle-fetch time would describe a slightly different window
 * than the rule will apply, so the honest thing is not to project at all.
 *
 * Framework-neutral: no React, no reactive surface. Every real-estate panel builds the same query from
 * the same helpers, which is what keeps their disable states identical over one corpus — the claim the
 * six-vertical demo exists to make.
 *
 * @packageDocumentation
 */

import { type NumericBounds, sliderBucketCount } from '@filter-enginez/react-ui/bounds';

import type { LocationNodeSpec } from './extractors.js';

import {
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
	SLIDER_FIELD_KEYS,
	SLIDER_VALUE_STEPS,
} from './filterConfig.js';

/**
 * Build the real-estate bundle query: five chip groups and six slider fields.
 *
 * @param baselines - Per-slider baseline bounds, so the engine knows each field's full extent.
 * @param vocabularies - The candidate values for each flat chip group.
 * @param locationNodeSpecs - The location tree flattened by `buildLocationNodeSpecs`.
 * @returns The query to hand to `applyFiltersAndQuery`.
 */
export function buildRealEstateBundleQuery(
	baselines: Record<RealEstateSliderFieldId, NumericBounds>,
	vocabularies: RealEstateChipVocabularies,
	locationNodeSpecs: readonly LocationNodeSpec[],
) {
	return {
		chipGroups: [
			{ candidates: locationNodeSpecs, field: 'locationId', kind: 'inSetOfSets' as const, ruleId: 'location' },
			{ candidates: vocabularies.schoolDistricts, field: 'schoolDistrict', kind: 'inSet' as const, ruleId: 'school-district' },
			{ candidates: vocabularies.propertyTypes, field: 'propertyType', kind: 'inSet' as const, ruleId: 'property-type' },
			{ candidates: vocabularies.statuses, field: 'status', kind: 'inSet' as const, ruleId: 'status' },
			{ candidates: vocabularies.features, field: 'features', kind: 'containsAll' as const, ruleId: 'must-have-features' },
		],
		// Built from the shared id list rather than written out, so adding a slider is one entry in
		// `filterConfig` instead of an entry there PLUS a line here that is easy to forget — and a
		// forgotten line here is the silent all-enabled failure described above.
		fields: REAL_ESTATE_SLIDER_FIELD_IDS.map((ruleId) => ({
			baselineMax: baselines[ruleId].max,
			baselineMin: baselines[ruleId].min,
			// Without this the engine falls back to 12 buckets, which it computes and ships either way.
			// Twelve fat columns also flatten the three fields where the distribution is the point:
			// price, square feet and lot size are all heavily skewed.
			bucketCount: sliderBucketCount(baselines[ruleId], SLIDER_VALUE_STEPS[ruleId]),
			fieldKey: SLIDER_FIELD_KEYS[ruleId],
			ruleId,
		})),
	};
}

/** The query shape {@link buildRealEstateBundleQuery} produces. */
export type RealEstateBundleQuery = ReturnType<typeof buildRealEstateBundleQuery>;
