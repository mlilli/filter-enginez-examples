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
import type { NumericBounds } from '@filter-enginez/react-ui/bounds';

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
 * source-data-empty edge case). By design nothing is hardcoded once data
 * loads — the derivation supplants these on every render after boot. The numbers reflect
 * plausible defaults so the slider doesn't render as a degenerate single-point line during the
 * brief pre-derivation window.
 *
 * A PLACEHOLDER, not a ceiling: `deriveBaselineBounds` does not clamp to these, which is what
 * keeps the $800 bottles and the 1945 vintages reachable once the corpus lands.
 */
export const FALLBACK_BOUNDS = {
	abv: { max: 25, min: 5 },
	points: { max: 100, min: 80 },
	price: { max: 400, min: 0 },
	vintage: { max: 2024, min: 2008 },
} as const satisfies Record<SliderFieldId, NumericBounds>;
