/**
 * `real-estate-domain/filterConfig` — the panel's slider geometry and chip vocabularies, framework-neutral.
 *
 * @remarks
 * The clamps, steps and vocabulary derivations every real-estate panel needs, in one place. Written
 * inline at each panel's call sites they would be correct and impossible to share — every panel would
 * restate them, and the first time someone widened the price clamp only one panel would move.
 *
 * The counterpart to `wine-domain/filterConfig`, with one deliberate difference. Wine keeps its
 * rounding grid and its drag granularity APART (`SLIDER_STEPS` is all zeros there; `DRAG_STEPS` is
 * separate) because padding a $4 corpus minimum outward by 5 would display it as $0. Real estate
 * uses ONE number for both, matching React: its clamps are already round, so rounding the corpus
 * extents onto the drag grid produces the tidy track ends a price slider wants rather than
 * `$47,300 – $1,984,000`.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { NumericBounds } from '@filter-enginez/react-ui/bounds';

import { uniqueSorted } from '../../vocabulary/index.js';

/** The six range-slider facets, in panel order. */
export type RealEstateSliderFieldId =
	| 'bathrooms'
	| 'bedrooms'
	| 'lot-size'
	| 'price'
	| 'square-feet'
	| 'year-built';

/** Every slider facet, in panel order — for iterating without restating the union. */
export const REAL_ESTATE_SLIDER_FIELD_IDS: readonly RealEstateSliderFieldId[] = [
	'price',
	'square-feet',
	'bedrooms',
	'bathrooms',
	'year-built',
	'lot-size',
];

/**
 * How each slider reads its value off a listing.
 *
 * @remarks
 * The rule ids and the `Listing` field names deliberately do not match (`price` → `priceUsd`,
 * `lot-size` → `lotSizeAcres`). Rule ids are URL-visible and kebab-cased; field names are the corpus
 * schema. Mapping between them in one table beats threading both spellings through every call site.
 */
export const SLIDER_FIELD_GETTERS: Record<RealEstateSliderFieldId, (listing: Listing) => number> = {
	bathrooms: (listing) => listing.bathrooms,
	bedrooms: (listing) => listing.bedrooms,
	'lot-size': (listing) => listing.lotSizeAcres,
	price: (listing) => listing.priceUsd,
	'square-feet': (listing) => listing.squareFeet,
	'year-built': (listing) => listing.yearBuilt,
};

/**
 * The `Listing` field each slider's rule and bundle query name.
 *
 * @remarks
 * A bundle query names its fields by STRING, because it has to survive Comlink to a worker and JSON
 * to a server. So this table is not a convenience — it is the only way the projection can be
 * expressed once the query leaves the main thread.
 */
export const SLIDER_FIELD_KEYS: Record<RealEstateSliderFieldId, string> = {
	bathrooms: 'bathrooms',
	bedrooms: 'bedrooms',
	'lot-size': 'lotSizeAcres',
	price: 'priceUsd',
	'square-feet': 'squareFeet',
	'year-built': 'yearBuilt',
};

/**
 * Outer limits for each slider's track, used when the corpus is narrower than the sensible range.
 *
 * @remarks
 * `deriveBaselineBounds` widens these to fit the corpus and never narrows them, so a track always
 * spans at least this much. That matters for the mock corpus specifically: a 10k sample may contain no
 * 9-bedroom listing, and a bedrooms slider topping out at 6 would tell the user the data stops there.
 */
export const SLIDER_CLAMPS: Record<RealEstateSliderFieldId, NumericBounds> = {
	bathrooms: { max: 10, min: 0 },
	bedrooms: { max: 10, min: 0 },
	'lot-size': { max: 5, min: 0 },
	price: { max: 2_000_000, min: 0 },
	'square-feet': { max: 10_000, min: 0 },
	'year-built': { max: 2025, min: 1900 },
};

/**
 * Drag granularity, and the grid the derived baseline is rounded outward onto.
 *
 * @remarks
 * One number serving both jobs — see the module docblock for why real estate can do that and wine
 * cannot. `lot-size` at `0.1` is the only fractional step; the acreage readout formats to two decimals
 * so a tenth-acre drag is legible.
 */
export const SLIDER_STEPS: Record<RealEstateSliderFieldId, number> = {
	bathrooms: 1,
	bedrooms: 1,
	'lot-size': 0.1,
	price: 10_000,
	'square-feet': 100,
	'year-built': 1,
};

/**
 * The grid each field's VALUES fall on in the corpus — a different table from {@link SLIDER_STEPS},
 * and the one the histogram bucket counts derive from.
 *
 * @remarks
 * **These two tables must not be merged, however alike they look.** `SLIDER_STEPS` is what a drag
 * snaps to; this is what the data actually contains. They disagree on four of the six fields, and in
 * both directions:
 *
 * | field         | drag step | value grid | why they differ                                  |
 * | ------------- | --------- | ---------- | ------------------------------------------------ |
 * | `price`       | 10,000    | 1          | dragging by $10k is usable; prices are to the $1 |
 * | `square-feet` | 100       | 1          | same reasoning, one order of magnitude down      |
 * | `lot-size`    | 0.1       | 0.01       | acreage generates to two decimals                |
 * | `bathrooms`   | 1         | **0.5**    | `Math.round(x * 2) / 2` — half-baths are real    |
 *
 * `bathrooms` is the one that punishes reaching for `SLIDER_STEPS`: its 0–10 track holds 21 half-step
 * positions, so the integer answer of 11 buckets pairs every half-bath with a whole one and renders a
 * comb of alternating heights. Values read off `mock-data/src/real-estate/generate.ts`; if the
 * generator's rounding changes, this table changes with it.
 */
export const SLIDER_VALUE_STEPS: Record<RealEstateSliderFieldId, number> = {
	bathrooms: 0.5,
	bedrooms: 1,
	'lot-size': 0.01,
	price: 1,
	'square-feet': 1,
	'year-built': 1,
};

/**
 * The listed-date presets, with both of the labels they are shown under.
 *
 * @remarks
 * The two labels are not redundant. Inside the panel the chip sits under a "Listed within" header, so
 * `'7 days'` reads correctly and the short form keeps five chips on one line. In the active-filter bar
 * the chip stands alone next to filters from every other facet, where `'7 days'` says nothing about
 * WHAT is seven days old — so it needs `'Last 7 days'`. Both spellings existed already, in two files
 * that shared only the `value` strings between them, which is the half most likely to be mistyped and
 * the half that silently does nothing when it is (a `DateRangeRule` with an unknown preset simply
 * fails to constrain).
 *
 * The values themselves are the engine's relative-preset vocabulary — resolved against `Date.now()`
 * at EVALUATION time, which is what keeps "last 7 days" meaning the last seven days rather than the
 * seven before page load.
 */
export const DATE_PRESETS = [
	{ chipLabel: '7 days', summaryLabel: 'Last 7 days', value: 'last-7-days' },
	{ chipLabel: '30 days', summaryLabel: 'Last 30 days', value: 'last-30-days' },
	{ chipLabel: '90 days', summaryLabel: 'Last 90 days', value: 'last-90-days' },
	{ chipLabel: 'This month', summaryLabel: 'This month', value: 'this-month' },
	{ chipLabel: 'This year', summaryLabel: 'This year', value: 'this-year' },
] as const;

/** One preset's `value` — a `DateRangeRule` relative preset this panel offers. */
export type DatePresetValue = (typeof DATE_PRESETS)[number]['value'];

/** The presets in the `{ label, value }` shape every preset control consumes. */
export const DATE_PRESET_OPTIONS: readonly { readonly label: string; readonly value: DatePresetValue }[] =
	DATE_PRESETS.map((preset) => ({ label: preset.chipLabel, value: preset.value }));

/** Preset value → the standalone phrasing used on an active-filter chip. */
export const DATE_PRESET_SUMMARY_LABELS: Record<string, string | undefined> = Object.fromEntries(
	DATE_PRESETS.map((preset) => [preset.value, preset.summaryLabel]),
);

/**
 * Narrow an arbitrary preset string to one this panel offers.
 *
 * @remarks
 * The engine's `DateRangeRule` accepts presets the panel does not render (`all-time`, for one), and a
 * rule can arrive from a shared URL or a JSON config rather than from a click. Showing no chip as
 * active is the honest rendering of "the engine holds a preset with no control here", and it beats
 * the alternative of highlighting a chip that does not correspond to the active filter.
 *
 * @param preset - The engine's current preset, or `null` when no rule is set.
 * @returns The preset if this panel offers it, otherwise `null`.
 */
export function coerceDatePreset(preset: string | null): DatePresetValue | null {
	return DATE_PRESETS.find((candidate) => candidate.value === preset)?.value ?? null;
}

/** The four flat chip / checkbox vocabularies the panel offers. */
export interface RealEstateChipVocabularies {
	/** Every feature appearing on any listing — the must-have-features chips. */
	readonly features: readonly string[];
	/** Every property type — the property-type chips. */
	readonly propertyTypes: readonly string[];
	/** Every school district — the high-cardinality checkbox list. */
	readonly schoolDistricts: readonly string[];
	/** Every listing status — the status chips. */
	readonly statuses: readonly string[];
}

/**
 * Derive every chip vocabulary from the booted corpus, in one pass per facet.
 *
 * @remarks
 * Sorted, so chip order is stable across boots — an unsorted `Set` iteration would reorder the panel
 * whenever the corpus stream happened to arrive in a different order, which reads as a rendering bug.
 *
 * @param corpus - The booted listings.
 * @returns The four vocabularies.
 */
export function deriveRealEstateVocabularies(corpus: readonly Listing[]): RealEstateChipVocabularies {
	return {
		features: uniqueSorted(corpus.flatMap((listing) => listing.features)),
		propertyTypes: uniqueSorted(corpus.map((listing) => listing.propertyType)),
		schoolDistricts: uniqueSorted(corpus.map((listing) => listing.schoolDistrict)),
		statuses: uniqueSorted(corpus.map((listing) => listing.status)),
	};
}

/**
 * Distinct values of a string series, sorted for stable UI ordering.
 *
 * @param values - The raw series.
 * @returns The distinct values, ascending.
 */
// The shared implementation drops empty values and sorts with `localeCompare`, not a default
// `.sort()` (UTF-16 code-unit order), so `San Mateo Union` comes before `SFUSD` — the order a person
// would expect, rather than uppercase `F` beating lowercase `a`. See the subpath's docblock.
//
// Re-exported so every `from './filterConfig.js'` import resolves. The `import` above
// is separate and necessary: a re-export forwards the name to consumers without binding it in this
// module's own scope, and the four `uniqueSorted(...)` calls below are in this module.
export { uniqueSorted };

