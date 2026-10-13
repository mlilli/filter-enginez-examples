/**
 * `smartFilters.ts` — curated "smart filter" presets for the wine demo's expression mode.
 *
 * @remarks
 * Each preset builds a `CompositeRule` expression the panel hands to `engine.setExpression(...)`,
 * switching the engine from flat-map (implicit-AND) mode into expression mode. Together they
 * exercise the full Boolean algebra the engine supports — `and` / `or` / `not` and **nesting** — and
 * reuse the concrete rule factories (`inSet`, `range`, `numCompare`, `value`), so the one demo shows
 * both expression composition and several rule types cooperating.
 *
 * Framework-agnostic (plain data + factory calls, no React), so all six wine apps share the same
 * preset definitions.
 *
 * {@link deriveSelectedPresetIds} is the inverse: it recovers which presets built a committed
 * expression, which is what lets a shared `?f` link restore the preset chips rather than the results
 * alone. It lives here because it can only stay correct beside the table it reverses.
 *
 * @packageDocumentation
 */

import type { WineColor, WineSweetness } from '@filter-enginez/mock-data/wine';

import { and, type CompositeRule, type FilterRule, inSet, not, numCompare, or, range, value } from '@filter-enginez/core';

/**
 * A named expression preset. `build()` returns a fresh `CompositeRule` each call (rules are mutable,
 * so presets must not share instances across engine boots).
 */
export interface WineSmartFilter {
	/** Stable id (used as the active-preset key + React list key). */
	readonly id: string;
	/** Button label. */
	readonly label: string;
	/** Short human-readable gloss of the expression (shown under the button / as a tooltip). */
	readonly description: string;
	/** Construct the preset's expression tree. */
	readonly build: () => CompositeRule;
}

/**
 * The wine smart-filter presets, in display order. Each demonstrates a different corner of the
 * expression algebra:
 *
 *   - **Bold reds under $25** — a flat `and` of three rule types (InSet ∧ Range ∧ NumericComparison).
 *   - **Crisp whites, nothing sweet** — `and` with a `not` (negation).
 *   - **Pinot, any style** — an `or` of `value` rules (disjunction).
 *   - **Cellar picks** — a nested `or` inside an `and`, with a `not` (composition + nesting).
 */
export const WINE_SMART_FILTERS: readonly WineSmartFilter[] = [
	{
		build: () => and(
			inSet<WineColor>('color', ['red']),
			range('priceUsd', { max: 25, min: 0 }),
			numCompare('points', { op: '>=', value: 88 }),
		),
		description: 'Red · ≤ $25 · ≥ 88 pts',
		id: 'bold-reds',
		label: 'Bold reds',
	},
	{
		build: () => and(
			inSet<WineColor>('color', ['white']),
			not(inSet<WineSweetness>('sweetness', ['medium-sweet', 'sweet', 'dessert'])),
		),
		description: 'White · not sweet',
		id: 'crisp-whites',
		label: 'Crisp whites',
	},
	{
		build: () => or(
			value<string>('varietal', 'Pinot Noir'),
			value<string>('varietal', 'Pinot Gris'),
			value<string>('varietal', 'Pinot Grigio'),
		),
		description: 'Noir · or · Gris · or · Grigio',
		id: 'pinot-any',
		label: 'Pinot',
	},
	{
		build: () => and(
			or(
				numCompare('points', { op: '>=', value: 93 }),
				range('priceUsd', { max: Number.POSITIVE_INFINITY, min: 60 }),
			),
			not(inSet<WineColor>('color', ['rosé', 'sparkling'])),
		),
		description: '(≥ 93 pts or ≥ $60) · not rosé/sparkling',
		id: 'cellar-picks',
		label: 'Cellar picks',
	},
];

/** Sentinel key for a rule that cannot be serialized. @internal */
const NO_STRUCTURAL_KEY = 'no-structural-key';

/**
 * A preset's structural identity — its serialized expression tree as a string.
 *
 * @remarks
 * `CompositeRule.serialize()` is recursive (it maps over `config.rules`), so this captures the whole
 * tree rather than just the root operator. Stringifying is safe as an identity because both sides of
 * every comparison are produced by the same serializer, so key order cannot differ.
 *
 * Verified against a real `?f` round-trip — `exportConfig` → JSON → `loadConfig` — for all four
 * presets, INCLUDING `cellar-picks`, whose `Number.POSITIVE_INFINITY` upper bound was the obvious
 * candidate to be mangled by `JSON.stringify` and is not.
 *
 * **Returns {@link NO_STRUCTURAL_KEY} for a rule it cannot serialize.** An expression that has
 * crossed a structured-clone / JSON boundary is a plain object shaped like a rule: the right `.config`
 * and no prototype, so calling `rule.serialize` would throw inside a reactive derivation and take a
 * whole panel down rather than failing to match. `createAsyncMirrorRefreshers` rehydrates the
 * expression on the async tiers; this guard stays because a rule that cannot be keyed is exactly what
 * {@link deriveSelectedPresetIds}'s contract calls "unrecognized".
 *
 * **A try/catch rather than `typeof rule.serialize === 'function'`**, which is not enough: the
 * recursion above means a live root wrapping wire-shaped children — precisely what a PARTIAL
 * rehydration produces — passes the duck-type and then throws from inside the call.
 * Only catching covers both depths.
 *
 * **A sentinel rather than `null`** so the function stays TOTAL and no caller needs a null check. A
 * real key is `JSON.stringify` output and therefore always begins with `{`, so a bare word cannot
 * collide: the sentinel simply never matches a preset, which is the semantics wanted. Returning `null`
 * instead would force a branch into the lookup table below that no test could reach, since `build()`
 * is always live.
 *
 * @param rule - Any rule; in practice a preset's `build()` output or a committed expression.
 * @returns Its structural key, or {@link NO_STRUCTURAL_KEY}.
 * @internal
 */
function structuralKey(rule: FilterRule): string {
	try {
		return JSON.stringify(rule.serialize());
	} catch {
		return NO_STRUCTURAL_KEY;
	}
}

/** Structural key → preset id, built once. @internal */
const PRESET_ID_BY_KEY: ReadonlyMap<string, string> = new Map(
	WINE_SMART_FILTERS.map((preset) => [structuralKey(preset.build()), preset.id]),
);

/**
 * Recover which presets produced a committed expression.
 *
 * @remarks
 * **The inverse of the panels' `applySelection`**, which commits `null` for an empty selection, the
 * preset itself for one, and `or(...)` of them for several. Without it a shared `?f` link carrying an
 * expression would restore the results correctly and leave every preset chip blank. An expression is a `CompositeRule`
 * tree and carries no preset id, so the id has to be recovered by matching structure.
 *
 * **Whole-expression match is tried FIRST, and the order is load-bearing.** `pinot-any` is itself an
 * `or` of three `ValueRule`s. Testing children first would decompose it and try to read those three
 * values as three presets — they match nothing, so the result would be an empty selection for a preset
 * that is plainly active. Trying the whole tree first means a single selection always wins before
 * decomposition is considered.
 *
 * Anything unrecognized returns empty rather than throwing: an expression can legitimately come from a
 * hand-written JSON config that no preset built, and the honest rendering of that is "no preset chip
 * is lit", not a crash or a wrong chip. **That includes a rule this cannot key at all** — see
 * {@link structuralKey}. A panel calling this inside a reactive derivation would otherwise be taken
 * down entirely by an expression it merely failed to recognize.
 *
 * @param expression - The engine's committed expression, or `null` in flat-map mode.
 * @returns The preset ids that built it, in the expression's own order. Empty when there is no
 *   expression, or when it was not built from presets. A result of length > 1 also means the panel's
 *   "Match any (OR)" mode was on.
 */
/**
 * Build the expression a set of selected presets represents — the inverse of
 * {@link deriveSelectedPresetIds}.
 *
 * @remarks
 * **This exists so the round trip is symmetrical in ONE place.** Both halves are shared by every wine
 * panel. Per-panel copies of a rule that has to agree exactly with `deriveSelectedPresetIds` —
 * including the single-selection special case below — are how a panel comes to light two chips for an
 * expression it did not build.
 *
 * **The one-preset case is not an optimization.** A single selection commits that preset's own
 * expression, NOT `or(thatOne)`. `deriveSelectedPresetIds` tries a whole-expression match before it
 * decomposes an `or`, so a lone preset wrapped in an `or` would still be recovered — but `pinot-any`
 * is itself an `or` of three `ValueRule`s, and wrapping it would produce a nested `or` whose
 * structural key matches nothing. The chip would go dark the moment it was clicked.
 *
 * Selection ORDER is ignored: presets are emitted in `WINE_SMART_FILTERS` order, so two panels that
 * selected the same presets by different routes commit byte-identical expressions — which is what
 * lets a `?f=` link round-trip across verticals.
 *
 * @param selectedIds - The preset ids currently selected. More than one means "Match any (OR)".
 * @returns The expression to commit, or `null` when nothing is selected (flat-map mode).
 */
export function buildSmartFilterExpression(selectedIds: readonly string[]): CompositeRule | null {
	const built = WINE_SMART_FILTERS
		.filter((preset) => selectedIds.includes(preset.id))
		.map((preset) => preset.build());
	const [first] = built;

	if (first === undefined) {
		return null;
	}

	return built.length === 1 ? first : or(...built);
}

export function deriveSelectedPresetIds(expression: CompositeRule | null): readonly string[] {
	if (expression === null) {
		return [];
	}
	const wholeMatch = PRESET_ID_BY_KEY.get(structuralKey(expression));

	if (wholeMatch !== undefined) {
		return [wholeMatch];
	}
	if (expression.config.op !== 'or') {
		return [];
	}
	const ids: string[] = [];

	for (const child of expression.config.rules) {
		const id = PRESET_ID_BY_KEY.get(structuralKey(child));

		// All-or-nothing: a partial match means this `or` was not built from presets, and lighting the
		// chips that happened to match would misrepresent an expression the panel cannot reproduce.
		if (id === undefined) {
			return [];
		}
		ids.push(id);
	}

	return ids;
}
