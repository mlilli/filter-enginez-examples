/**
 * `commit` — the one place a wine filter mutation is written to the engine, for every vertical.
 *
 * @remarks
 * Shared by SvelteKit, Vue, Angular and vanilla, so no vertical keeps its own hand-typed copy.
 * `WINE_FACET_RULE_IDS` in particular is the kind of list whose drift is silent: a list that has
 * drifted produces a preset switch that leaves one facet ANDed against the expression, narrowing the
 * results with no control on screen explaining why.
 *
 * Every section commits through here rather than calling `engine.core` directly, for two reasons that
 * only bite on the worker tier.
 *
 * **1. The busy version must bump BEFORE the write.** `markUserAction` is what makes the "computing"
 * indicator light on the same frame the user clicks. Bumping after the write — or forgetting it —
 * leaves the indicator dark through a round trip that can take hundreds of milliseconds over 130k
 * rows, so the UI looks frozen and the click looks ignored.
 *
 * **2. `engine.core` reads LAG on the worker tier.** A synchronous read taken right after a write
 * returns the PREVIOUS state, because the mutation has not round-tripped yet. That is why every wine
 * section holds its control in a WRITABLE derivation off its rule, where a main-thread panel can use a
 * read-only one: the section writes the control locally on the way in, calls through here, and the
 * derivation recomputes to the same value a round trip later. A read-only derivation would flicker
 * chips off and snap sliders backwards for the length of that trip. Centralizing the write makes the
 * ordering enforceable by convention rather than remembered thirteen times.
 *
 * Removing a rule is a separate call rather than `addRule` with an empty value: an `InSetRule` with an
 * empty set still participates in the AND and matches nothing, so "deselect everything" would filter
 * the results to zero instead of clearing the facet.
 *
 * ## Why the parameter is `{ core }` and not `SignalsEngine`
 *
 * Angular consumes the engine through `RxJsEngine`, not `SignalsEngine`. Both expose the identical
 * `readonly core: FilterEngine<T>`, so typing against that structural minimum lets every vertical
 * share these helpers unchanged, each passing its own facade.
 *
 * @packageDocumentation
 */

import type { CompositeRule, FilterEngine, FilterRule, RuleId } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { markUserAction } from '../engineBusyCore.js';

/**
 * The minimum a commit helper needs from a reactive facade.
 *
 * @remarks
 * Satisfied by `SignalsEngine<Wine>` and `RxJsEngine<Wine>` alike — see the note above. Deliberately
 * structural rather than a union of the two named types, so a sixth reactive surface needs no edit
 * here.
 */
export interface WineEngineHost {
	/** The imperative engine every reactive facade wraps. */
	readonly core: FilterEngine<Wine>;
}

/**
 * Every flat facet rule id, in one place.
 *
 * @remarks
 * A literal list at the call site would silently drift the next time a facet is added — the new facet
 * would survive a preset switch, ANDing itself with the expression, and the results would be narrower
 * than the preset describes with no control on screen explaining why.
 */
export const WINE_FACET_RULE_IDS: readonly RuleId[] = [
	'abv',
	'body',
	'color',
	// The exact-color `ValueRule`, distinct from the `color` chip group over the same field.
	'color-value',
	'notes',
	'origin',
	'points',
	// The six-operator `NumericComparisonRule` — all six operators, because the facet exists to
	// demonstrate the rule type, and one fixed operator would demonstrate very little of it.
	'points-compare',
	'price',
	'sweetness',
	'varietal',
	'vintage',
	'winery',
];

/**
 * Add or replace a rule.
 *
 * @param engine - The wine engine facade.
 * @param ruleId - The rule's stable id.
 * @param rule - The rule instance.
 */
export function commitRule(engine: WineEngineHost, ruleId: RuleId, rule: FilterRule): void {
	markUserAction();
	engine.core.addRule(ruleId, rule);
}

/**
 * Remove a rule entirely — the correct way to clear a facet.
 *
 * @param engine - The wine engine facade.
 * @param ruleId - The rule to drop.
 */
export function clearRule(engine: WineEngineHost, ruleId: RuleId): void {
	markUserAction();
	engine.core.removeRule(ruleId);
}

/**
 * Apply a rule when the selection is non-empty, otherwise clear it.
 *
 * @remarks
 * The pattern nearly every chip section needs, and the one most likely to be got wrong: an empty
 * `InSetRule` is not a neutral rule, it is a rule that matches nothing.
 *
 * @param engine - The wine engine facade.
 * @param ruleId - The rule's stable id.
 * @param values - The current selection.
 * @param build - Builds the rule from a non-empty selection.
 */
export function commitSelection<V extends string>(
	engine: WineEngineHost,
	ruleId: RuleId,
	values: readonly V[],
	build: (values: readonly V[]) => FilterRule,
): void {
	if (values.length === 0) {
		clearRule(engine, ruleId);

		return;
	}
	commitRule(engine, ruleId, build(values));
}

/**
 * Switch the engine into (or out of) expression mode.
 *
 * @remarks
 * Routed through here rather than called directly because a preset switch is the MOST expensive
 * operation on this route — it drops every flat rule and installs a composite tree — and without the
 * `markUserAction` it would leave the busy indicator dark for its whole worker round trip.
 *
 * @param engine - The wine engine facade.
 * @param expression - The expression tree, or `null` to return to flat-map mode.
 */
export function commitExpression(engine: WineEngineHost, expression: CompositeRule | null): void {
	markUserAction();
	engine.core.setExpression(expression);
}

/**
 * Remove every flat facet rule — the pre-step to entering expression mode.
 *
 * @param engine - The wine engine facade.
 */
export function clearAllFacetRules(engine: WineEngineHost): void {
	markUserAction();
	for (const ruleId of WINE_FACET_RULE_IDS) {
		engine.core.removeRule(ruleId);
	}
}

/**
 * Return the whole panel to neutral — every flat facet AND expression mode.
 *
 * @remarks
 * What the results header's "Clear all" calls. There is no local state left to clear: each section
 * adopts its own rule's removal, so writing the engine IS clearing the panel.
 *
 * The two writes are one operation on purpose. Splitting them at the call site is how a clear-all
 * comes to drop the facets while leaving a preset driving the results, with every control blank.
 *
 * **The debounced server tier coalesces this burst**, and that is safe: thirteen `removeRule`s plus a
 * `setExpression` are heterogeneous, which `serverEngine` escalates to a `reset` event — the one event
 * that refreshes the rule signal as well as the expression. A homogeneous burst would coalesce to
 * `expression` alone and never reach the facets. SvelteKit's `WineView.clearAll.test.ts` is the
 * regression guard.
 *
 * @param engine - The wine engine facade.
 */
export function clearAllWineFilters(engine: WineEngineHost): void {
	clearAllFacetRules(engine);
	commitExpression(engine, null);
}

/**
 * Remove one facet's rule, for the header's per-chip × control.
 *
 * @remarks
 * A thin alias for {@link clearRule}, named for the caller rather than the mechanism: the header
 * removes a FACET, and whether that happens to be one rule is an implementation detail it should not
 * have to know.
 *
 * @param engine - The wine engine facade.
 * @param ruleId - The facet to drop.
 */
export function removeFacet(engine: WineEngineHost, ruleId: RuleId): void {
	clearRule(engine, ruleId);
}
