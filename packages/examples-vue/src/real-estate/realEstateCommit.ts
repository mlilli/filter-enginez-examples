/**
 * `realEstateCommit` — the one place a real-estate filter mutation is written to the engine.
 *
 * @remarks
 * Every section commits through here rather than calling `engine.core` directly, so two invariants
 * hold by construction rather than by being remembered thirteen times.
 *
 * **1. The busy version bumps BEFORE the write.** `markUserAction` is what lets the "computing"
 * indicator light on the same frame the user clicks. Real estate is a main-thread tier so the gap is
 * usually imperceptible — but the contract is identical to wine's, so the indicator behaves the same
 * way whichever tier hosts the engine.
 *
 * **2. Clearing a facet REMOVES its rule.** It never writes an empty one. An `InSetRule` with an
 * empty set matches every item, so the results would look the same, but the rule would stay
 * registered with no control showing it: in the `?f=` link, and in the devtools log as a change rather
 * than a removal. The call looks reasonable in code review, which is why it is decided here once.
 *
 * The same holds for {@link ContainsAllRule}: with an empty `required` array it is neutral too
 * (everything contains all of nothing), and the must-have-features section still clears instead, so
 * every facet behaves identically.
 *
 * Framework-free by construction — a near-verbatim port of the Svelte module, and deliberately so:
 * this is the file that decides what a click MEANS, and two verticals disagreeing about that would be
 * a real divergence rather than an idiomatic one.
 *
 * "Clear all" is not here: the results header calls the shared `clearAllFilters` from
 * `@filter-enginez/examples-shared/selection`, one `clearRules` that every dataset in every app makes,
 * so no list of facet ids exists to drift from the panel.
 *
 * @packageDocumentation
 */

import type { FilterRule, RuleId } from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { markUserAction } from './realEstateBusy.js';

/**
 * Add or replace a rule.
 *
 * @param engine - The real-estate engine.
 * @param ruleId - The rule's stable id.
 * @param rule - The rule instance.
 */
export function commitRule(engine: SignalsEngine<Listing>, ruleId: RuleId, rule: FilterRule): void {
	markUserAction();
	engine.core.addRule(ruleId, rule);
}

/**
 * Remove a rule entirely — the correct way to clear a facet.
 *
 * @param engine - The real-estate engine.
 * @param ruleId - The rule to drop.
 */
export function clearRule(engine: SignalsEngine<Listing>, ruleId: RuleId): void {
	markUserAction();
	engine.core.removeRule(ruleId);
}

/**
 * Apply a rule when the selection is non-empty, otherwise clear it.
 *
 * @remarks
 * The pattern every chip, checkbox-list and tree section needs. `build` is only called for a non-empty
 * selection, so it never has to defend against the empty case.
 *
 * @typeParam V - The selected value type.
 * @param engine - The real-estate engine.
 * @param ruleId - The rule's stable id.
 * @param values - The current selection.
 * @param build - Builds the rule from a NON-EMPTY selection.
 */
export function commitSelection<V extends string>(
	engine: SignalsEngine<Listing>,
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
 * Drop one facet — what a results-header chip's × calls.
 *
 * @param engine - The real-estate engine.
 * @param ruleId - The facet to remove.
 */
export function removeFacet(engine: SignalsEngine<Listing>, ruleId: RuleId): void {
	clearRule(engine, ruleId);
}
