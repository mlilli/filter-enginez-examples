/**
 * `originRule` — the one rule every wine app commits for an origin selection.
 *
 * @remarks
 * ## One rule type in all six apps: `InSetofSetsRule` over `originId`
 *
 * A `?f=` link is how a filter state travels between the apps — each app's Compare button hands it
 * to `/compare`, which links it into all six. So an origin selection has to be the same rule, with
 * the same serialization, whichever app made it. The rule is an `InSetofSetsRule` holding one set per
 * selected node: the node's own id and every id beneath it, in the tree's pre-order
 * ({@link OriginNodeSpec.leafIds}). Three reasons, in order of weight:
 *
 * 1. **It is the rule the panel's predictive disable simulates.** The bundle queries origin as an
 *    `inSetOfSets` chip group whose candidates are exactly those sets (`bundle.ts`), and the engine
 *    treats an `inSetOfSets` group as disjunctive: it drops the group's own rule and projects each
 *    candidate in its place. Committing the candidate the projection measured means a node's count
 *    is precisely what clicking it yields.
 * 2. **It carries the selection and nothing else.** A `HierarchicalRule` carries its whole `tree` in
 *    its config, so its serialization — the `?f=` value — would hold every origin in the corpus, a
 *    size set by the corpus rather than by what was picked, and a different tree in each data tier.
 * 3. **The shared wine domain is built on it.** `deriveOriginSelection` (`bundle.ts`) reads a selection back
 *    out of committed sets, and the summary chip counts them (`ruleSummaries.ts`).
 *
 * Over one tree the two rules select the same wines: a `HierarchicalRule` matches a node "and all its
 * descendants", and a node's set is that node and all its descendants.
 *
 * Links that carry origin as a `HierarchicalRule` still decode, into this same rule: see
 * `./originLinks.ts`.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { type FilterEngine, inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';

import { markUserAction } from '../engineBusyCore.js';
import { type OriginNodeSpec } from './bundle.js';
import { type WineEngineHost } from './commit.js';
import { ORIGIN_FIELD, ORIGIN_RULE_ID } from './originLinks.js';

/**
 * The origin rule for a selection.
 *
 * @remarks
 * One set per selected node, in the specs' own (pre-)order rather than the selection's, so the same
 * selection produces the same rule — and the same `?f=` — however the picker happened to list it.
 *
 * @param selection - The picker's compact selection: node ids, the highest selected per branch.
 * @param specs - The flattened tree ({@link OriginNodeSpec}); a node with no spec contributes nothing.
 * @returns The rule.
 */
export function buildWineOriginRule(selection: readonly string[], specs: readonly OriginNodeSpec[]): InSetofSetsRule<string> {
	const selected = new Set(selection);

	return inSetofSets<string>(
		ORIGIN_FIELD,
		specs.filter((spec) => selected.has(spec.value)).map((spec) => spec.leafIds),
	);
}

/**
 * Write an origin selection to an engine: the rule for a non-empty selection, no rule for an empty one.
 *
 * @remarks
 * Removing rather than committing an empty set keeps "nothing selected" identical in every app: no
 * `origin` entry in the config, so no `origin` entry in the link. Does not mark the busy tracker —
 * callers that schedule their own busy marking (React's `commitFilterMutation`) call this; everyone
 * else calls {@link commitOriginSelection}.
 *
 * @param core - The engine to write.
 * @param selection - The picker's compact selection.
 * @param specs - The flattened tree.
 */
export function writeOriginSelection(
	core: Pick<FilterEngine<Wine>, 'addRule' | 'removeRule'>,
	selection: readonly string[],
	specs: readonly OriginNodeSpec[],
): void {
	if (selection.length === 0) {
		core.removeRule(ORIGIN_RULE_ID);

		return;
	}
	core.addRule(ORIGIN_RULE_ID, buildWineOriginRule(selection, specs));
}

/**
 * Commit an origin selection the way every other wine facet commits: busy tracker first, then the write.
 *
 * @param engine - The wine engine facade.
 * @param selection - The picker's compact selection.
 * @param specs - The flattened tree.
 */
export function commitOriginSelection(engine: WineEngineHost, selection: readonly string[], specs: readonly OriginNodeSpec[]): void {
	markUserAction();
	writeOriginSelection(engine.core, selection, specs);
}
