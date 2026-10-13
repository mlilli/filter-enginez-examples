/**
 * Tests for the real-estate predictive-disable query.
 *
 * @remarks
 * `buildRealEstateBundleQuery` returns a plain object, so the temptation is to snapshot it and move
 * on. These assert the three things a snapshot would happily lock in while they were wrong, because
 * every one of them fails SILENTLY — a malformed query does not throw, it produces a facet that
 * renders all-enabled while every other facet keeps working, which looks exactly like "the bundle has
 * not settled yet".
 *
 *   1. **Every slider is queried.** The `fields` array is built by mapping
 *      `REAL_ESTATE_SLIDER_FIELD_IDS`, precisely so adding a slider is one entry in `filterConfig`
 *      rather than an entry there PLUS a line here. This pins that it still is.
 *   2. **Each facet gets the right candidate KIND.** `inSetOfSets` for the location tree,
 *      `inSet` for the three flat facets, `containsAll` for must-have features. The distinction is the
 *      difference between "would adding this WIDEN to nothing" and "would adding this NARROW to
 *      nothing", and getting it wrong reads as plausible disable states that are simply untrue.
 *   3. **`fieldKey`, not rule id, names the field.** The query crosses Comlink to the worker tier and
 *      JSON to the server tier, so it names fields by string — and rule ids deliberately differ from
 *      corpus field names (`price` → `priceUsd`).
 *
 * Every real-estate panel builds from this one function; that is what keeps their disable states
 * identical over one corpus, which is the claim the six-vertical demo exists to make.
 */

import type { NumericBounds } from '@filter-enginez/react-ui/bounds';

import { describe, expect, it } from 'vitest';

import type { LocationNodeSpec } from './extractors.js';

import { buildRealEstateBundleQuery } from './bundle.js';
import {
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
	SLIDER_FIELD_KEYS,
} from './filterConfig.js';

/** Distinct baselines per slider, so a mis-keyed lookup shows up as a wrong number rather than a tie. */
const BASELINES = Object.fromEntries(
	REAL_ESTATE_SLIDER_FIELD_IDS.map((ruleId, index) => [ruleId, { max: 1000 + index, min: index }]),
) as Record<RealEstateSliderFieldId, NumericBounds>;

const VOCABULARIES: RealEstateChipVocabularies = {
	features: ['garage', 'solar'],
	propertyTypes: ['condo', 'single-family'],
	schoolDistricts: ['Denver Public Schools'],
	statuses: ['active', 'sold'],
};

const LOCATION_SPECS: readonly LocationNodeSpec[] = [
	{ leafIds: ['CO/Greater Denver/Highlands'], value: 'CO' },
	{ leafIds: ['CO/Greater Denver/Highlands'], value: 'CO/Greater Denver' },
];

/** The query under test, built from the fixtures above. */
function query(): ReturnType<typeof buildRealEstateBundleQuery> {
	return buildRealEstateBundleQuery(BASELINES, VOCABULARIES, LOCATION_SPECS);
}

describe('chip groups', () => {
	it('queries the five facets that have candidate lists, and only those', () => {
		expect(query().chipGroups.map((group) => group.ruleId)).toEqual([
			'location',
			'school-district',
			'property-type',
			'status',
			'must-have-features',
		]);
	});

	it('gives the location tree the set-of-sets kind', () => {
		// Each node is simulated against the FULL set of `locationId` values selecting it would activate.
		// A branch queried with only its own id matches no listing — listings carry leaf paths — so every
		// state and metro would read as permanently unavailable while the neighborhoods beneath them
		// worked fine.
		const location = query().chipGroups.find((group) => group.ruleId === 'location');

		expect(location).toMatchObject({ field: 'locationId', kind: 'inSetOfSets' });
		expect(location?.candidates).toBe(LOCATION_SPECS);
	});

	it('gives the three widening facets the plain in-set kind', () => {
		// Clicking one WIDENS the facet, so the engine drops that facet's own rule while projecting.
		const widening = query().chipGroups.filter((group) =>
			['property-type', 'school-district', 'status'].includes(String(group.ruleId)),
		);

		expect(widening.map((group) => group.kind)).toEqual(['inSet', 'inSet', 'inSet']);
		expect(widening.map((group) => group.field)).toEqual(['schoolDistrict', 'propertyType', 'status']);
	});

	it('gives must-have features the contains-all kind', () => {
		// The one CONJUNCTIVE facet: clicking one NARROWS an existing requirement, so the engine keeps
		// the rule active and projects each candidate on top of what is already checked. Without the
		// distinction "solar" looks available while "garage" is checked, even when no listing has both.
		expect(query().chipGroups.find((group) => group.ruleId === 'must-have-features')).toMatchObject({
			field: 'features',
			kind: 'containsAll',
		});
	});

	it('passes each vocabulary through to its own group', () => {
		const byRuleId = new Map(query().chipGroups.map((group) => [group.ruleId, group.candidates]));

		expect(byRuleId.get('school-district')).toBe(VOCABULARIES.schoolDistricts);
		expect(byRuleId.get('property-type')).toBe(VOCABULARIES.propertyTypes);
		expect(byRuleId.get('status')).toBe(VOCABULARIES.statuses);
		expect(byRuleId.get('must-have-features')).toBe(VOCABULARIES.features);
	});

	it('omits geo and listed-date, deliberately', () => {
		// Both absences are decisions, not gaps. GEO still governs every other facet — the engine
		// evaluates every OTHER active rule when projecting a candidate — but a radius is a continuous
		// surface with no candidate list. LISTED-DATE resolves against `Date.now()` at EVALUATION time,
		// so a count computed at fetch time would describe a different window than the rule applies.
		const ruleIds = query().chipGroups.map((group) => group.ruleId);

		expect(ruleIds).not.toContain('geo-proximity');
		expect(ruleIds).not.toContain('listed-date');
	});
});

describe('slider fields', () => {
	it('queries every slider in the shared iteration order', () => {
		// The `fields` array is a map over `REAL_ESTATE_SLIDER_FIELD_IDS` precisely so a new slider needs
		// no line here. A forgotten line would be the silent all-enabled failure.
		expect(query().fields.map((field) => field.ruleId)).toEqual([...REAL_ESTATE_SLIDER_FIELD_IDS]);
	});

	it('names each field by its corpus key, not its rule id', () => {
		// The query crosses Comlink and JSON, so fields are named by string. Rule ids are kebab-cased and
		// URL-visible; `price` is `priceUsd` in the corpus.
		for (const field of query().fields) {
			expect(field.fieldKey, String(field.ruleId)).toBe(SLIDER_FIELD_KEYS[field.ruleId]);
		}
	});

	it('carries each slider its own baseline extent', () => {
		for (const field of query().fields) {
			expect({ max: field.baselineMax, min: field.baselineMin }, String(field.ruleId)).toEqual(
				BASELINES[field.ruleId],
			);
		}
	});
});
