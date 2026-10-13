/**
 * Tests for the real-estate slider geometry, field mappings and chip vocabularies.
 *
 * @remarks
 * These are lookup tables and three small pure functions, so the interesting assertions are not "does
 * `uniqueSorted` sort" — they are the INVARIANTS BETWEEN the tables, because that is where the failure
 * mode lives and it is a silent one.
 *
 * `SLIDER_FIELD_GETTERS`, `SLIDER_FIELD_KEYS`, `SLIDER_CLAMPS` and `SLIDER_STEPS` are four records
 * keyed by the same union, read by four different consumers: the getters build baselines from the
 * corpus, the keys name fields for the bundle query (which crosses Comlink and JSON, so it must be a
 * string), the clamps bound the track, the steps round it. A key present in one and missing from
 * another does not throw — it produces a slider whose track is right and whose predictive-disable is
 * absent, or vice versa. `REAL_ESTATE_SLIDER_FIELD_IDS` is what every loop iterates, so anything it
 * omits simply never renders.
 *
 * The getter/key pairing is the one worth stating out loud: the rule ids and the `Listing` field names
 * deliberately do NOT match (`price` → `priceUsd`, `lot-size` → `lotSizeAcres`), so a copy-paste slip
 * between the two tables reads as plausible in review and shows up as one slider silently filtering
 * the wrong column.
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { describe, expect, it } from 'vitest';

import {
	coerceDatePreset,
	DATE_PRESET_OPTIONS,
	DATE_PRESET_SUMMARY_LABELS,
	DATE_PRESETS,
	deriveRealEstateVocabularies,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_FIELD_KEYS,
	SLIDER_STEPS,
	uniqueSorted,
} from './filterConfig.js';

/**
 * A listing carrying every field the slider getters and the vocabulary derivation read.
 *
 * @remarks
 * `overrides` is a loose record rather than `Partial<Listing>` on purpose: several of these tests need
 * vocabulary values that are deliberately NOT in the corpus unions (`'a'` is not a `ListingFeature`),
 * because what is under test is the derivation's set/sort behavior rather than the schema's. The cast
 * at the boundary is the one this file's fixtures already need for the fields they omit.
 */
function listing(overrides: Record<string, unknown> = {}): Listing {
	return {
		bathrooms: 2,
		bedrooms: 3,
		features: ['garage'],
		lotSizeAcres: 0.25,
		priceUsd: 500_000,
		propertyType: 'single-family',
		schoolDistrict: 'Denver Public Schools',
		squareFeet: 2000,
		status: 'active',
		yearBuilt: 2000,
		...overrides,
	} as unknown as Listing;
}

describe('the slider tables agree with each other', () => {
	it('gives every id in the iteration order a getter, a field key, a clamp and a step', () => {
		// The iteration list is what every loop walks, so an id missing from any of the four records is
		// a facet that renders half-configured rather than one that fails.
		for (const ruleId of REAL_ESTATE_SLIDER_FIELD_IDS) {
			expect(SLIDER_FIELD_GETTERS[ruleId], `${ruleId} getter`).toBeTypeOf('function');
			expect(SLIDER_FIELD_KEYS[ruleId], `${ruleId} field key`).toBeTypeOf('string');
			// Asserted field-by-field rather than with `expect.any(Number)`, whose return type is `any`
			// and trips the typed-lint rules this package enables.
			expect(SLIDER_CLAMPS[ruleId].max, `${ruleId} clamp max`).toBeTypeOf('number');
			expect(SLIDER_CLAMPS[ruleId].min, `${ruleId} clamp min`).toBeTypeOf('number');
			expect(SLIDER_STEPS[ruleId], `${ruleId} step`).toBeTypeOf('number');
		}
	});

	it('carries no extra keys in any table beyond the iteration order', () => {
		const expected = [...REAL_ESTATE_SLIDER_FIELD_IDS].sort();

		for (const table of [SLIDER_FIELD_GETTERS, SLIDER_FIELD_KEYS, SLIDER_CLAMPS, SLIDER_STEPS]) {
			expect(Object.keys(table).sort()).toEqual(expected);
		}
	});

	it('reads each slider off the same listing field its bundle key names', () => {
		// The load-bearing one. Rule ids are kebab-cased and URL-visible; field names are the corpus
		// schema, and the two deliberately differ — so this is the assertion that catches a getter
		// wired to the wrong column, which no type can catch (they are all `number`).
		const source = listing({
			bathrooms: 3.5,
			bedrooms: 4,
			lotSizeAcres: 1.75,
			priceUsd: 1_250_000,
			squareFeet: 3100,
			yearBuilt: 1997,
		});

		for (const ruleId of REAL_ESTATE_SLIDER_FIELD_IDS) {
			const viaGetter = SLIDER_FIELD_GETTERS[ruleId](source);
			const viaFieldKey = (source as unknown as Record<string, number>)[SLIDER_FIELD_KEYS[ruleId]];

			expect(viaGetter, `${ruleId} getter vs field key`).toBe(viaFieldKey);
		}
	});

	it('bounds every clamp the right way round', () => {
		for (const ruleId of REAL_ESTATE_SLIDER_FIELD_IDS) {
			expect(SLIDER_CLAMPS[ruleId].min, ruleId).toBeLessThan(SLIDER_CLAMPS[ruleId].max);
		}
	});
});

describe('date presets', () => {
	it('offers every declared preset to the control, in declaration order', () => {
		expect(DATE_PRESET_OPTIONS.map((option) => option.value)).toEqual(DATE_PRESETS.map((preset) => preset.value));
		expect(DATE_PRESET_OPTIONS.map((option) => option.label)).toEqual(
			DATE_PRESETS.map((preset) => preset.chipLabel),
		);
	});

	it('summarizes every preset the control can select', () => {
		// A preset the chip group offers but the summarizer cannot name produces a chip reading the raw
		// `last-7-days` slug in the results header.
		for (const preset of DATE_PRESETS) {
			expect(DATE_PRESET_SUMMARY_LABELS[preset.value], preset.value).toBe(preset.summaryLabel);
		}
	});

	it('accepts a preset this panel offers', () => {
		expect(coerceDatePreset('last-30-days')).toBe('last-30-days');
	});

	it('rejects a preset the engine supports but this panel does not render', () => {
		// `all-time` is a real `DateRangeRule` preset, and a rule can arrive from a shared URL or a JSON
		// config rather than from a click. Returning `null` renders NO chip as active, which is the
		// honest reading of "the engine holds a preset with no control here" — the alternative is
		// highlighting a chip that does not correspond to the active filter.
		expect(coerceDatePreset('all-time')).toBeNull();
	});

	it('rejects the absent rule', () => {
		expect(coerceDatePreset(null)).toBeNull();
	});
});

describe('deriveRealEstateVocabularies', () => {
	it('derives all four facets from the corpus', () => {
		const vocabularies = deriveRealEstateVocabularies([
			listing({ features: ['garage', 'solar'], propertyType: 'condo', schoolDistrict: 'B', status: 'sold' }),
			listing({ features: ['pool'], propertyType: 'single-family', schoolDistrict: 'A', status: 'active' }),
		]);

		expect(vocabularies).toEqual({
			features: ['garage', 'pool', 'solar'],
			propertyTypes: ['condo', 'single-family'],
			schoolDistricts: ['A', 'B'],
			statuses: ['active', 'sold'],
		});
	});

	it('flattens features rather than listing each listing\'s array', () => {
		// `features` is the one facet whose corpus values are arrays, so it needs `flatMap` where the
		// other three need `map`. A plain `map` would yield stringified arrays as chip candidates.
		const { features } = deriveRealEstateVocabularies([listing({ features: ['a', 'b']})]);

		expect(features).toEqual(['a', 'b']);
	});

	it('returns empty vocabularies for an empty corpus', () => {
		// The pre-boot state every panel renders through: four empty chip groups, not a crash.
		expect(deriveRealEstateVocabularies([])).toEqual({
			features: [],
			propertyTypes: [],
			schoolDistricts: [],
			statuses: [],
		});
	});
});

describe('uniqueSorted, as this slice re-exports it', () => {
	// **The general contract is tested once, at `src/vocabulary/index.test.ts`.** A second copy of
	// that contract here would only pass under either implementation unless it used a value where
	// case or accent decides the order.
	//
	// What is worth asserting HERE is the thing specific to this dataset: the order on screen.

	it('orders school districts case-insensitively', () => {
		// A bare `.sort()` uses UTF-16 code-unit order, which files every capital before every lowercase
		// letter: `SFUSD` would sort BEFORE `San Mateo Union` — uppercase `F` (70) beats lowercase `a`
		// (97) — and a reader scanning the S's for an all-caps acronym would find it two places earlier
		// than expected. Of this slice's four vocabularies, this is the only one where the two orders
		// differ.
		expect(uniqueSorted(['Seattle Public', 'SFUSD', 'San Mateo Union'])).toEqual([
			'San Mateo Union',
			'Seattle Public',
			'SFUSD',
		]);
	});

	it('drops an empty district rather than rendering a blank chip', () => {
		// Defensive rather than load-bearing: no vocabulary in either corpus contains an empty value. A
		// blank chip is pressable, unlabelled, and filters on `''`, which matches nothing and reads as a
		// broken corpus.
		// Note the order: `Seattle Public` precedes `SFUSD` under locale collation, because the
		// deciding characters are `e` and `F` and case is compared last — easy to get backwards, which
		// is the argument for asserting real values here rather than abstract ones.
		expect(uniqueSorted(['Seattle Public', '', 'SFUSD'])).toEqual(['Seattle Public', 'SFUSD']);
	});
});
