/**
 * The six real-estate range sliders as data, plus the number formatting they share.
 *
 * @remarks
 * Each of the six differs only in a label, a `Listing` field, a formatter and (for five of them) a
 * parser — so they are a table rather than sixty lines of near-identical markup per vertical. A
 * table means adding a facet is adding an entry, rather than editing a block that grows past what
 * anyone reads carefully.
 *
 * The `ruleId`s index `SLIDER_STEPS`, `SLIDER_CLAMPS` and `SLIDER_FIELD_GETTERS` next door, so
 * {@link RealEstateSliderFieldId} does the work of keeping this table and those in step.
 *
 * ### Why it lives HERE and not in each app
 *
 * There is nothing framework-shaped in it. A `format` is a display convention, and per-app copies of
 * a display convention diverge — that is how a chip comes to read `single-family` while the card
 * beside it reads `single family`, which is why `humanizeVocabularyValue` is shared too. A second
 * table would let one vertical's Lot size read `1.50 ac` while another's reads `1.5 ac`, over one
 * corpus, in a demo whose entire purpose is the side-by-side comparison.
 *
 * `sliderLabel` is named after what it labels rather than after the `aria-label` attribute it ends
 * up in — the convention every control in every vertical follows, for reasons Vue's
 * `<ResultGrid>` documents at length.
 *
 * @packageDocumentation
 */

import { type RealEstateSliderFieldId } from './filterConfig.js';
import { formatListingPrice } from './formatters.js';

/**
 * Read a number back out of a formatted slider readout.
 *
 * @remarks
 * The readouts are editable, so whatever `format` produced has to survive the round trip — and every
 * formatter here adds non-numeric characters (`$`, thousands separators, ` sqft`, ` bd`).
 * `parseFloat` alone stops at the first one and would read `$1,250,000` as `1`.
 *
 * Year-built is the one facet that omits it: a four-digit year carries no separators, so the default
 * `parseFloat` is already correct and passing a stripper would be noise.
 *
 * @param raw - The user's edited text.
 * @returns The numeric value, or `NaN` for text carrying no digits (which the slider rejects).
 */
export function parseNumeric(raw: string): number {
	return Number.parseFloat(raw.replace(/[^0-9.]/gu, ''));
}

/** One slider's UI-side configuration — everything a range section needs beyond the engine. */
export interface RangeFacetSpec {
	/** The `Listing` field the rule constrains, e.g. `priceUsd`. */
	readonly field: string;
	/** Value → display string. */
	readonly format: (value: number) => string;
	/** Slider label. */
	readonly label: string;
	/** Display string → value, for the editable readouts. Omit for the default `parseFloat`. */
	readonly parse?: (raw: string) => number;
	/** Rule id — also the key into the shared baselines, steps and bundle fields. */
	readonly ruleId: RealEstateSliderFieldId;
	/** Accessible name for the slider group. */
	readonly sliderLabel: string;
}

/** The six range facets, in panel render order. */
export const RANGE_FACETS: readonly RangeFacetSpec[] = [
	{
		field: 'priceUsd',
		format: formatListingPrice,
		label: 'Price',
		parse: parseNumeric,
		ruleId: 'price',
		sliderLabel: 'Price range',
	},
	{
		field: 'squareFeet',
		format: (value) => `${value.toLocaleString()} sqft`,
		label: 'Square feet',
		parse: parseNumeric,
		ruleId: 'square-feet',
		sliderLabel: 'Square-footage range',
	},
	{
		field: 'bedrooms',
		format: (value) => `${value.toFixed(0)} bd`,
		label: 'Bedrooms',
		parse: parseNumeric,
		ruleId: 'bedrooms',
		sliderLabel: 'Bedroom range',
	},
	{
		field: 'bathrooms',
		format: (value) => `${value.toFixed(0)} ba`,
		label: 'Bathrooms',
		parse: parseNumeric,
		ruleId: 'bathrooms',
		sliderLabel: 'Bathroom range',
	},
	{
		field: 'yearBuilt',
		format: (value) => value.toFixed(0),
		label: 'Year built',
		ruleId: 'year-built',
		sliderLabel: 'Year-built range',
	},
	{
		field: 'lotSizeAcres',
		format: (value) => `${value.toFixed(2)} ac`,
		label: 'Lot size',
		parse: parseNumeric,
		ruleId: 'lot-size',
		sliderLabel: 'Lot-size range',
	},
];
