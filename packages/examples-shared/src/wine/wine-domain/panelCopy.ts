/**
 * `wine-domain/panelCopy` — what every app's wine panel says, and the few choices behind its controls,
 * in one place.
 *
 * @remarks
 * Six apps render the wine panel. Spelled out per app, its labels, placeholders, option lists and
 * search settings drift silently: a tasting-notes placeholder worded differently in one app, a thumb
 * accessible name that differs between two, a price slider whose top commits `Infinity` in some apps
 * and a finite price in others. Every panel reads these instead, so a wording change or a new option
 * reaches all six at once.
 *
 * Framework-free, like the rest of `./wine-domain`.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from '@filter-enginez/react-ui/bounds';

import { type FilterRule, fuzzy, range } from '@filter-enginez/core';

import type { SliderFieldId } from './filterConfig.js';

/** A slider's visible label, and the accessible name its two thumbs are named after. */
export interface WineSliderCopy {
	/** The label above the slider, e.g. `Price (USD)`. */
	readonly label: string;
	/** The thumbs' accessible-name stem: `Filter by price` names `Filter by price lower bound`. */
	readonly sliderLabel: string;
}

/** Each wine slider's copy. */
export const WINE_SLIDER_COPY: Readonly<Record<SliderFieldId, WineSliderCopy>> = {
	abv: { label: 'ABV (%)', sliderLabel: 'Filter by ABV' },
	points: { label: 'Points', sliderLabel: 'Filter by points' },
	price: { label: 'Price (USD)', sliderLabel: 'Filter by price' },
	vintage: { label: 'Vintage', sliderLabel: 'Filter by vintage year' },
};

/** The `RangeRule` slider ids — every slider but vintage, which commits a set of years. */
export type WineRangeSliderId = Exclude<SliderFieldId, 'vintage'>;

/** The `Wine` field each `RangeRule` slider constrains. */
export const WINE_RANGE_FIELDS: Readonly<Record<WineRangeSliderId, string>> = {
	abv: 'abv',
	points: 'points',
	price: 'priceUsd',
};

/**
 * The sliders whose top means "no upper limit".
 *
 * @remarks
 * Price only. A bottle can always cost more than the dearest one in the corpus, so "$60 and up" is
 * what a thumb dragged to the top of the price track means: the rule's maximum is `Infinity`, the
 * pill reads `$60 — ∞`, and the `?f=` link carries the open bound (which survives JSON and reloads).
 * Points and ABV have natural ceilings, so their top is an ordinary finite bound.
 */
export const WINE_OPEN_ENDED_SLIDERS: ReadonlySet<WineRangeSliderId> = new Set<WineRangeSliderId>(['price']);

/**
 * The rule a `RangeRule` slider commits for a thumb position.
 *
 * @param ruleId - The slider.
 * @param next - The thumbs' values.
 * @param baseline - The slider's full track.
 * @returns The `RangeRule`, with an open maximum when an open-ended slider's top thumb is at the top.
 */
export function wineRangeRule(ruleId: WineRangeSliderId, next: NumericBounds, baseline: NumericBounds): FilterRule {
	const isOpenAtTop = WINE_OPEN_ENDED_SLIDERS.has(ruleId) && next.max >= baseline.max;

	return range(WINE_RANGE_FIELDS[ruleId], { max: isOpenAtTop ? Number.POSITIVE_INFINITY : next.max, min: next.min });
}

/** The two fuzzy searches. */
export type WineSearchId = 'notes' | 'winery';

/** One fuzzy search field's copy and Fuse settings. */
export interface WineSearchSpec {
	/** The field's accessible name. */
	readonly ariaLabel: string;
	/** The `Wine` field searched (the rule's `field`). */
	readonly field: string;
	/** Extra Fuse keys, for a search across several fields. */
	readonly keys?: readonly string[];
	/** The section heading. */
	readonly label: string;
	/** The field's placeholder. */
	readonly placeholder: string;
	/** Fuse's match threshold. */
	readonly threshold: number;
}

/** Each wine search field's copy and Fuse settings. */
export const WINE_SEARCHES: Readonly<Record<WineSearchId, WineSearchSpec>> = {
	notes: {
		ariaLabel: 'Search tasting notes',
		field: 'description',
		keys: ['description', 'tastingNotes'],
		label: 'Tasting notes search',
		placeholder: 'cherry, oak, tannin…',
		threshold: 0.45,
	},
	winery: {
		ariaLabel: 'Search wineries with typo tolerance',
		field: 'winery',
		label: 'Winery (typo-tolerant)',
		placeholder: 'Vandermark, Caruso, Hartmann...',
		threshold: 0.35,
	},
};

/**
 * The rule a wine search commits for a non-empty query.
 *
 * @remarks
 * An empty query is a removal, never a rule; the caller decides that before it gets here.
 *
 * @param searchId - The search field.
 * @param query - The trimmed, non-empty query.
 * @returns The `FuzzySearchRule`.
 */
export function wineSearchRule(searchId: WineSearchId, query: string): FilterRule {
	const { field, keys, threshold } = WINE_SEARCHES[searchId];

	return fuzzy(field, { ...(keys === undefined ? {} : { keys: [...keys]}), query, threshold });
}

/** The origin tree's accessible group name and the height it scrolls within. */
export const WINE_ORIGIN_TREE = {
	/** The tree's `role="group"` accessible name. */
	groupLabel: 'Origin',
	/** The tree's maximum height before it scrolls. */
	maxHeight: '16rem',
} as const;

/**
 * The options a chip group or menu offers: its hand-set order, keeping only values the corpus has.
 *
 * @remarks
 * Every chip group (color, body, sweetness) and the single-color menu list their values in the
 * design order (`red, white, rosé…`, `light … full`), not alphabetically, and leave out a value no
 * wine in the loaded tier carries, which could only ever be disabled.
 *
 * @typeParam V - The value type.
 * @param order - The hand-set order.
 * @param present - The values the corpus carries.
 * @returns The present values, in order.
 */
export function orderedPresentOptions<V extends string>(order: readonly V[], present: readonly string[]): readonly V[] {
	return order.filter((value) => present.includes(value));
}
