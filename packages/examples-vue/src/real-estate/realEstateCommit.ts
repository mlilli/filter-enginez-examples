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
 * empty set still participates in the AND and matches nothing, so "deselect everything" would filter
 * the results to zero rather than clearing the facet — the single most likely thing to get wrong here,
 * and invisible in code review because the call looks reasonable.
 *
 * The same trap has a second form specific to this dataset: {@link ContainsAllRule} with an empty
 * `required` array IS neutral (everything contains all of nothing), so the must-have-features section
 * could get away with writing one. It still clears instead, so every facet behaves identically.
 *
 * Framework-free by construction — a near-verbatim port of the Svelte module, and deliberately so:
 * this is the file that decides what a click MEANS, and two verticals disagreeing about that would be
 * a real divergence rather than an idiomatic one.
 *
 * @packageDocumentation
 */

import type { FilterRule, RuleId } from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { markUserAction } from './realEstateBusy.js';

/**
 * Every facet rule id the panel can write.
 *
 * @remarks
 * Named in ONE place so "clear all" and the results header's per-chip reset cannot drift from the
 * panel. A literal list at either call site would silently go stale the next time a facet is added —
 * the new facet would survive a clear-all, quietly ANDing itself into every subsequent result, with no
 * control on screen to explain why the counts look wrong.
 *
 * Ordered to match the panel's render order, so a reader can check the two against each other.
 */
export const REAL_ESTATE_FACET_RULE_IDS: readonly RuleId[] = [
	'location',
	'geo-proximity',
	'school-district',
	'property-type',
	'status',
	'price',
	'square-feet',
	'bedrooms',
	'bathrooms',
	'year-built',
	'lot-size',
	'must-have-features',
	'listed-date',
	'text-search',
];

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
 * Drop every facet rule in one pass — what "clear all" calls.
 *
 * @remarks
 * One `markUserAction` for the whole sweep rather than one per rule: it is a single user gesture, and
 * bumping per rule would make the busy predicate count a burst of fourteen actions against one settle.
 *
 * @param engine - The real-estate engine.
 */
export function clearAllFacetRules(engine: SignalsEngine<Listing>): void {
	markUserAction();
	for (const ruleId of REAL_ESTATE_FACET_RULE_IDS) {
		engine.core.removeRule(ruleId);
	}
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
