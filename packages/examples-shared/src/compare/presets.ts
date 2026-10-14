/**
 * Hand-authored filter states, so the comparison page means something on a cold visit.
 *
 * @remarks
 * The page's primary entry is a link carrying a `?f=` someone produced by filtering. Its NAV entry
 * has no such thing, and with a dataset toggle a stateless arrival is empty in two directions at
 * once — a visitor following the landing site's "Compare" link would otherwise be told, twice, that
 * there is nothing to compare.
 *
 * **These are data that can rot**, and that is the honest cost of the decision. A renamed rule id or
 * a changed field name turns a preset into a silently empty result set rather than an error.
 * `core.test.ts` is the guard: every preset is loaded into a real engine over the real corpus and
 * must return a non-empty result. A rename fails there, at the gate, naming the preset.
 *
 * Each config is the shape `engine.loadConfig()` consumes — the same payload the `?f=` param carries.
 * They are written by hand rather than captured from a session so that the `label` reads as prose in
 * the URL when the readable format is selected.
 *
 * **The round trip is not symmetric.** These are NOT what
 * `engine.exportConfig()` would produce, because of that very `label`: `exportConfig` emits one only
 * when handed it in `options`, and `loadConfig` never reads the field — it is a display decoration on
 * the document, not engine state. (`examples-server`'s `gen-sample.ts` spreads a label on top of
 * `exportConfig(engine)` for exactly that reason.) So a preset loaded into a real engine and
 * re-exported comes back WITHOUT its label and with `exportConfig`'s own key order.
 *
 * That is correct behavior and worth stating plainly: a test must not assert that a state carried
 * into a dataset route survives that route's boot byte-for-byte. It cannot — a dataset route's `?f=`
 * mirrors its engine, and an engine cannot mirror back a field it never held.
 *
 * ## `RangeRule` needs BOTH bounds
 *
 * `RangeRuleConfig` declares `min: number` and `max: number`, neither optional. Omitting one leaves
 * it `undefined`, and `n >= undefined` is `false` for every `n`, so an "open-ended" range silently
 * matches nothing — no throw, no warning, an empty grid; the result-count assertion in `core.test.ts`
 * is what catches it. `RangeRule`'s own docblock suggests `{ min: 4, max: Infinity }` for the open-ended case, which is
 * right for a runtime rule and wrong here: `JSON.stringify(Infinity)` is `null`, so it cannot
 * survive the trip through `?f=`. Give both bounds concrete numbers.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import type { CompareDataset } from './links.js';

/** One ready-made state, offered when the page is opened without a `?f=`. */
export interface ComparePreset {
	/** The state itself, in `exportConfig()` shape. */
	readonly config: FilterEngineConfig;
	/** One line naming what the state is FOR — which rule types it puts on screen. */
	readonly description: string;
	/** Stable key, used for the radio group and as the selected-preset query param. */
	readonly id: string;
	/** Short button label. */
	readonly label: string;
}

/**
 * Books states.
 *
 * @remarks
 * Chosen to span rule TYPES rather than to be interesting individually: an `InSetRule` plus a
 * `RangeRule` in the first, a `BooleanRule` and an `ExistsRule` in the second, a three-rule
 * intersection in the third. A visitor stepping through them sees the serialized `?f=` grow, which
 * is the readable format earning its place.
 */
const BOOKS_PRESETS: readonly [ComparePreset, ...ComparePreset[]] = [
	{
		config: {
			label: 'fiction · published 2000–2025',
			rules: [
				{ id: 'genre', rule: { config: { set: ['fiction']}, field: 'genre', type: 'InSetRule' }},
				{
					id: 'publication-year',
					rule: { config: { max: 2025, min: 2000 }, field: 'publicationYear', type: 'RangeRule' },
				},
			],
			version: 1,
		},
		description: 'An InSetRule and a RangeRule — the two most common shapes, intersected.',
		id: 'modern-fiction',
		label: 'Modern fiction',
	},
	{
		config: {
			label: 'in print · rated 4.5+',
			rules: [
				{ id: 'in-print', rule: { config: true, field: 'isInPrint', type: 'BooleanRule' }},
				// `ExistsRule.config` is `undefined` by design — the field extractor fully determines the
				// behavior — so this is the shape `exportConfig()` emits, not an omission.
				{ id: 'has-rating', rule: { config: undefined, field: 'averageRating', type: 'ExistsRule' }},
				{
					id: 'rating',
					rule: { config: { max: 5, min: 4.5 }, field: 'averageRating', type: 'RangeRule' },
				},
			],
			version: 1,
		},
		description: 'BooleanRule and ExistsRule together — presence and value are different questions.',
		id: 'highly-rated',
		label: 'Highly rated',
	},
	{
		config: {
			label: 'fantasy paperbacks over 500pp',
			rules: [
				{
					id: 'format',
					rule: { config: { set: ['paperback']}, field: 'format', type: 'InSetRule' },
				},
				{ id: 'genre', rule: { config: { set: ['fantasy']}, field: 'genre', type: 'InSetRule' }},
				{
					id: 'page-count',
					rule: { config: { max: 1_000, min: 500 }, field: 'pageCount', type: 'RangeRule' },
				},
			],
			version: 1,
		},
		description: 'Three rules intersected — two chip facets narrowing a range.',
		id: 'long-fantasy',
		label: 'Long fantasy',
	},
];

/**
 * Real-estate states.
 *
 * @remarks
 * Deliberately avoids the geo-radius rule. `GeoProximityRule` carries a center point that reads as
 * noise in a readable URL and means nothing to someone who has not seen the map, and the page's job
 * is to make the transported state legible. The hierarchical location tree is skipped for the same
 * reason.
 */
const REAL_ESTATE_PRESETS: readonly [ComparePreset, ...ComparePreset[]] = [
	{
		config: {
			label: 'condos · active · under $750k',
			rules: [
				{
					id: 'price',
					rule: { config: { max: 750_000, min: 0 }, field: 'priceUsd', type: 'RangeRule' },
				},
				{
					id: 'property-type',
					rule: { config: { set: ['condo']}, field: 'propertyType', type: 'InSetRule' },
				},
				{ id: 'status', rule: { config: { set: ['active']}, field: 'status', type: 'InSetRule' }},
			],
			version: 1,
		},
		description: 'Two chip facets and a capped price — the everyday listing search.',
		id: 'starter-condo',
		label: 'Starter condo',
	},
	{
		config: {
			label: 'family homes · 4+ bd · built since 1990',
			rules: [
				{ id: 'bedrooms', rule: { config: { max: 10, min: 4 }, field: 'bedrooms', type: 'RangeRule' }},
				{
					id: 'property-type',
					rule: { config: { set: ['single-family']}, field: 'propertyType', type: 'InSetRule' },
				},
				{
					id: 'year-built',
					rule: { config: { max: 2_025, min: 1_990 }, field: 'yearBuilt', type: 'RangeRule' },
				},
			],
			version: 1,
		},
		description: 'Three rules over one dataset — the widest state the readable format stays legible at.',
		id: 'family-home',
		label: 'Family home',
	},
];

/**
 * Wine states.
 *
 * @remarks
 * **Flat rules only, deliberately — no expression.** Wine's own panel offers smart-filter presets
 * that write a `CompositeRule` through `setExpression`, and reusing one here would have been the
 * obvious move. It is the wrong one: this page's job is to make the transported state LEGIBLE, and
 * an expression tree in a readable URL is a nested blob that says nothing to a visitor. The flat
 * form also exercises the path all six panels render controls from, so the destination lights its
 * chips and sliders rather than showing a single synthetic "preset" pill.
 *
 * Rule ids are the panel's own (`wine-domain/commit.ts`'s `WINE_FACET_RULE_IDS`), not invented here.
 * A state that filters correctly while lighting no control is the failure this page exists to make
 * impossible.
 *
 * The origin hierarchy, the fuzzy searches and the `NumericComparisonRule` are all skipped for the
 * same reason real estate skips its geo radius: they either read as noise in a URL or depend on a
 * corpus-specific value that a smaller tier may not contain. Both states below use only fields every
 * wine carries.
 */
const WINE_PRESETS: readonly [ComparePreset, ...ComparePreset[]] = [
	{
		config: {
			label: 'bold reds · under $25 · 88+ points',
			rules: [
				{ id: 'color', rule: { config: { set: ['red']}, field: 'color', type: 'InSetRule' }},
				// Both bounds concrete. 100 is the scale's ceiling rather than a guess — see the module
				// docblock on why `Infinity` cannot survive the trip through `?f=`.
				{ id: 'points', rule: { config: { max: 100, min: 88 }, field: 'points', type: 'RangeRule' }},
				{ id: 'price', rule: { config: { max: 25, min: 0 }, field: 'priceUsd', type: 'RangeRule' }},
			],
			version: 1,
		},
		description: 'A chip facet and two capped ranges — the everyday "good value" search.',
		id: 'bold-reds',
		label: 'Bold reds',
	},
	{
		config: {
			label: 'crisp whites · dry · 90+ points',
			rules: [
				{ id: 'color', rule: { config: { set: ['white']}, field: 'color', type: 'InSetRule' }},
				{ id: 'points', rule: { config: { max: 100, min: 90 }, field: 'points', type: 'RangeRule' }},
				{ id: 'sweetness', rule: { config: { set: ['bone-dry', 'dry']}, field: 'sweetness', type: 'InSetRule' }},
			],
			version: 1,
		},
		description: 'Two chip facets over different fields, plus a score floor.',
		id: 'crisp-whites',
		label: 'Crisp whites',
	},
];

/**
 * Every preset, by dataset.
 *
 * @remarks
 * Each list is typed NON-EMPTY, for the same reason `COMPARE_DATASETS` is. `resolveCompareState`
 * falls back to `COMPARE_PRESETS[dataset][0]`, and under `noUncheckedIndexedAccess` that is
 * possibly-`undefined` — which forces a fallback arm that cannot be reached, since both lists are
 * literals with entries and `core.test.ts` requires at least two per dataset. An unreachable branch
 * fails the 100%-coverage gate, and that gate is the one a plain `pnpm test` run does not exercise.
 * The invariant is real — a dataset
 * offering no example state would render the comparison page useless on a cold visit — so it belongs in the
 * type rather than in an ignore comment.
 *
 * **`wine-server` REFERENCES `WINE_PRESETS` rather than forking it, and that is a correctness
 * argument before it is a DRY one.** Both server-tier routes filter the corpus
 * `@filter-enginez/examples-server` holds — `wines`, the 10,000-wine default tier — and `core.test.ts`
 * validates the wine presets against both that corpus and the 150,000-wine tier the browser routes
 * generate. A forked list would need the
 * identical "narrows, but not to zero" validation written a second time, and could drift from the
 * states the browser tier demonstrates — which would quietly undermine the one claim the
 * `wine-server` rows exist to make.
 */
export const COMPARE_PRESETS: Readonly<
	Record<CompareDataset, readonly [ComparePreset, ...ComparePreset[]]>
> = {
	books: BOOKS_PRESETS,
	'real-estate': REAL_ESTATE_PRESETS,
	wine: WINE_PRESETS,
	'wine-server': WINE_PRESETS,
};

/**
 * Look up one preset by id.
 *
 * @param dataset - Which dataset's presets to search.
 * @param id - The preset's {@link ComparePreset.id}.
 * @returns The preset, or `undefined` when the id is unknown — a stale bookmark should fall back to
 *   the default rather than throw at a visitor.
 */
export function findPreset(dataset: CompareDataset, id: string): ComparePreset | undefined {
	return COMPARE_PRESETS[dataset].find((preset) => preset.id === id);
}
