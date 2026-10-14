/**
 * `wine-domain/filterConfig.ts` — the framework-neutral half of the wine panel's static
 * configuration.
 *
 * @remarks
 * **Why this is a separate module from `filters/filterConfig.ts`.** That file exports one React
 * hook (`useBaselineBounds`), and a hook at module scope means the whole module imports `react` and
 * `@filter-enginez/react-signals`. ES imports are not tree-shaken at the *source* boundary a
 * non-React bundle cares about: a Svelte route reaching for `SLIDER_FIELD_GETTERS` would pull React
 * and `@preact/signals-core` into its graph, which is exactly the taint the `-core` / `-domain`
 * subpath firewall exists to prevent (see `docs/architecture.md` §17b in the engine repository,
 * https://github.com/mlilli/filter-enginez).
 *
 * So everything here is the part that is genuinely just data + pure functions — chip vocabularies,
 * slider field getters, snap steps, fallback bounds, and the selection-equality helper. The React
 * side re-exports all of it, so the two React apps are unaffected and there is ONE definition.
 *
 * The one dependency is `@filter-enginez/react-ui/bounds`, which despite the package name is a
 * deliberately import-free subpath — no React, no engine, no browser globals. See its docblock.
 *
 * @packageDocumentation
 */

import type { Wine, WineBody, WineColor, WineSweetness } from '@filter-enginez/mock-data/wine';

import { createSliderScale, type NumericBounds, type SliderScale, type SliderScaleSpec } from '@filter-enginez/react-ui/bounds';

import { shortlistVocabulary } from '../../vocabulary/index.js';
import { formatVintage, parseVintage } from './vintage.js';

// ─── Static option vocabularies ──────────────────────────────────────────────
// Hand-ordered to match the design system's natural progressions, not alphabetical.

export const COLOR_ORDER: readonly WineColor[] = ['red', 'white', 'rosé', 'sparkling', 'dessert', 'fortified'];
export const BODY_ORDER: readonly WineBody[] = ['light', 'medium-light', 'medium', 'medium-full', 'full'];
export const SWEETNESS_ORDER: readonly WineSweetness[] = ['bone-dry', 'dry', 'off-dry', 'medium-sweet', 'sweet', 'dessert'];

/**
 * Stable empty-selection array for the "no rule registered yet" fallback. Using one shared
 * constant instead of an inline `?? []` keeps `engineSelected` referentially stable across
 * renders, so React's seed-and-adopt re-sync (`useSeedAndAdopt`) doesn't see a brand-new `[]`
 * every render — which it would read as an external change each time, until React stops the loop
 * with "Too many re-renders".
 *
 * The same reasoning applies to Svelte's `$derived` and Vue's `computed`: a fresh array every
 * evaluation defeats the dependency comparison in all three.
 */
export const EMPTY_SELECTION: readonly never[] = [];

/**
 * Order-sensitive shallow member equality for selection arrays (length, then element identity).
 * Lets the optimistic re-sync keep local state when the engine's value already matches it, so a
 * referentially-new-but-equal array never replaces the selection the user just painted.
 *
 * @param a - The first selection.
 * @param b - The second selection.
 * @returns `true` when both hold the same members in the same order.
 */
export function sameSelection<T>(a: readonly T[], b: readonly T[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Per-slider field-getter map — pulls the numeric value from a `Wine` for the histogram of
 * each range filter. Keyed by the rule id so each slider only iterates its own field.
 */
export const SLIDER_FIELD_GETTERS = {
	abv: (w: Wine): number => w.abv,
	points: (w: Wine): number => w.points,
	price: (w: Wine): number => w.priceUsd,
	vintage: (w: Wine): number => w.vintage,
} as const;

/**
 * Per-slider field id — the union of slider rule ids.
 */
export type SliderFieldId = keyof typeof SLIDER_FIELD_GETTERS;

/**
 * Per-slider snap granularity for the baseline pass in `deriveBaselineBounds`.
 *
 * **Snapping is disabled (`0` for every field).** By design, the slider shows the actual data min/max
 * with no breathing-room widening. A widened baseline causes confusing UX — e.g., padding `price` by 5
 * would turn an actual corpus min of `$4` into a baseline of `-1`, which the `$0` formatter would then
 * display as `$0`. Honest tight bounds are better. Kept as a record so per-field snapping is a
 * one-value change.
 *
 * A non-zero value means "round outward onto this grid"; `0` disables it.
 */
export const SLIDER_STEPS: Record<SliderFieldId, number> = {
	abv: 0,
	points: 0,
	price: 0,
	vintage: 0,
} as const;

/**
 * Safety-net bounds used only before the engine's sourceData is available (early-paint moment,
 * source-data-empty edge case). Nothing is hardcoded once data loads — the derivation supplants these
 * on every render after boot.
 *
 * The numbers are the extents of the 150,000-wine tier every deployed wine page boots, so on those
 * pages the track does not move when the corpus lands. `facets.test.ts` derives them from the
 * generator and fails if they drift.
 *
 * A PLACEHOLDER, not a ceiling: `deriveBaselineBounds` does not clamp to these, which is what keeps
 * every bottle reachable whatever corpus lands.
 */
export const FALLBACK_BOUNDS = {
	abv: { max: 22, min: 5.5 },
	points: { max: 100, min: 80 },
	price: { max: 3242, min: 4 },
	vintage: { max: 2025, min: 1911 },
} as const satisfies Record<SliderFieldId, NumericBounds>;

/**
 * The grid each slider field's VALUES fall on, as generated into the corpus.
 *
 * @remarks
 * Feeds `sliderBucketCount` / `scaledBucketCount`, which never ask for finer bars than the data has
 * positions, and softens the log scales (see {@link SLIDER_SCALE_SPECS}). Read off the generator:
 * `priceUsd` is whole dollars, `points` whole numbers, `abv` one decimal, `vintage` a year. (The local
 * real review corpus carries cents; on a whole-dollar grid its price bars are merely a little coarser.)
 *
 * **Not the same numbers as a slider `step`**, which is drag granularity — see `sliderBucketCount`'s
 * own remarks.
 */
export const FIELD_VALUE_STEPS: Record<SliderFieldId, number> = {
	abv: 0.1,
	points: 1,
	price: 1,
	vintage: 1,
} as const;

/**
 * How each wine slider lays its values on the track — the one declaration all six apps read.
 *
 * @remarks
 * **Price and vintage are heavy-tailed, so they are log-scaled** (`createSliderScale` in
 * `@filter-enginez/react-ui/bounds` documents the scale). Half of all wines cost under $30 and a few
 * cost thousands, so price is anchored at its minimum; nearly every vintage is from the last twenty
 * years and a few are a century old, so vintage is anchored at its maximum. On a linear track either
 * would squeeze almost every wine into a sliver at one end.
 *
 * **Points and ABV stay linear.** Scores spread across 80–100 without a tail, and alcohol clusters
 * around 13% with fortified wines a separate, visible group near 20% — a log track would distort
 * both rather than reveal anything.
 */
export const SLIDER_SCALE_SPECS: Readonly<Record<SliderFieldId, SliderScaleSpec>> = {
	abv: { kind: 'linear' },
	points: { kind: 'linear' },
	price: { anchor: 'min', kind: 'log' },
	vintage: { anchor: 'max', kind: 'log' },
};

/**
 * Build one wine slider's scale over its baseline.
 *
 * @param field - The slider's field id.
 * @param baseline - The slider's baseline bounds — the same object passed to the slider.
 * @returns The scale to hand to the slider and to {@link wineSliderHistogram}.
 */
export function wineSliderScale(field: SliderFieldId, baseline: NumericBounds): SliderScale {
	return createSliderScale(SLIDER_SCALE_SPECS[field], baseline, FIELD_VALUE_STEPS[field]);
}

/**
 * How many varietal chips a chip-group panel shows.
 *
 * @remarks
 * The SvelteKit, Vue, Angular and vanilla panels render varietals as wrapping chips, and hundreds of
 * chips would push every section below off the panel. Sixty of the most-reviewed varieties cover
 * about nine wines in ten. The React panels render a scrolling checkbox list instead and show every
 * varietal, most-reviewed first, in the same order.
 */
export const VARIETAL_CHIP_LIMIT = 60;

/**
 * The varietal chips a chip-group panel renders.
 *
 * @remarks
 * The first {@link VARIETAL_CHIP_LIMIT} of the ranked vocabulary, plus any selected varietal beyond
 * them, so a rare grape selected through a shared link still has a chip to clear it from.
 *
 * @param rankedVarietals - The varietal vocabulary, most-reviewed first (`WineFacets.vocabularies`).
 * @param selected - The varietals currently selected.
 * @returns The chips to render, in rank order.
 */
export function visibleVarietalChips(rankedVarietals: readonly string[], selected: readonly string[]): readonly string[] {
	return shortlistVocabulary(rankedVarietals, selected, VARIETAL_CHIP_LIMIT);
}

/** How one wine slider shows its values and reads typed ones back. */
export interface WineSliderText {
	/** Value → readout text, for the header summary and the editable bound fields. */
	readonly format: (value: number) => string;
	/** Typed text → value; `NaN` for text that is not one, which the sliders revert. */
	readonly parse: (raw: string) => number;
}

/**
 * Read a number from typed text, ignoring the decorations its readout adds.
 *
 * @param raw - The typed text, e.g. `$1,250` or `13.5 %`.
 * @returns The number, or `NaN`.
 * @internal
 */
function parseDecoratedNumber(raw: string): number {
	return Number.parseFloat(raw.replace(/[$%,\s]/gu, ''));
}

/**
 * The readout format and the typed-text parser of each wine slider — shared, so every app shows
 * `$1,250`, `13.5%` and `NV` the same way and accepts the same text back.
 *
 * @remarks
 * Every parser strips what its formatter adds. A field that shows `$1,250` and parses with a bare
 * `parseFloat` reads it as `NaN` and reverts, which looks like the field refusing the user's edit.
 */
export const WINE_SLIDER_TEXT: Readonly<Record<SliderFieldId, WineSliderText>> = {
	abv: { format: (value) => `${value.toFixed(1)}%`, parse: parseDecoratedNumber },
	points: { format: (value) => value.toFixed(0), parse: parseDecoratedNumber },
	price: { format: (value) => `$${Math.round(value).toLocaleString('en-US')}`, parse: parseDecoratedNumber },
	vintage: { format: formatVintage, parse: parseVintage },
};

