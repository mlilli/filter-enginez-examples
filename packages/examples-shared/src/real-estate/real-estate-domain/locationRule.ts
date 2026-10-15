/**
 * `locationRule` — the one rule every real-estate app commits for a location selection, and how a
 * panel reads its selection back.
 *
 * @remarks
 * ## One rule type in all six apps: `InSetofSetsRule` over `locationId`
 *
 * A `?f=` link is how a filter state travels: the address bar holds it, the Copy link button copies
 * it, and each app's Compare button hands it to `/compare`, which links it into all six apps. So a
 * location selection has to be a rule that survives that trip, and the same rule, with the same
 * serialization, whichever app made it. The rule is an `InSetofSetsRule` over the listing's
 * `locationId` field, holding one set per selected node: the node's own id and every id beneath it, in
 * field space and pre-order ({@link LocationNodeSpec.leafIds}). In order of weight:
 *
 * 1. **It round-trips.** It names its field by string. The engine's tree rule, `HierarchicalRule`,
 *    would need a function to turn a listing's `state` / `metroArea` / `neighborhood` into a tree id,
 *    and a function field serializes as the placeholder `"<function>"`: a link carrying it decodes
 *    into a rule that tests no field and matches no listing.
 * 2. **It is the rule the panel's predictive disable simulates.** The bundle queries location as an
 *    `inSetOfSets` chip group over the same specs (`./bundle.ts`), so a node's count is precisely what
 *    clicking it yields.
 * 3. **It carries the selection and nothing else.** A `HierarchicalRule` carries its whole tree in its
 *    config, so the `?f=` value would hold every location in the corpus.
 *
 * Over one tree the two rules select the same listings: a `HierarchicalRule` matches a node "and all
 * its descendants", and a node's set is that node and all its descendants.
 *
 * Links that carry location as a `HierarchicalRule` still decode, into this same rule: see
 * `./locationLinks.ts`. The wine origin rule is built the same way (`wine-domain/originRule.ts`).
 *
 * @packageDocumentation
 */

import { type FilterEngine, type FilterRule, inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';

import { type LocationNodeSpec } from './extractors.js';
import { LOCATION_FIELD, LOCATION_RULE_ID } from './locationLinks.js';

/**
 * The location rule for a selection.
 *
 * @remarks
 * One set per selected node, in the specs' own (pre-)order rather than the selection's, so the same
 * selection produces the same rule — and the same `?f=` — however the picker happened to list it.
 *
 * @param selection - The picker's compact selection: node ids, the highest selected per branch.
 * @param specs - The flattened tree ({@link LocationNodeSpec}); a node with no spec contributes nothing.
 * @returns The rule.
 */
export function buildListingLocationRule(
	selection: readonly string[],
	specs: readonly LocationNodeSpec[],
): InSetofSetsRule<string> {
	const selected = new Set(selection);

	return inSetofSets<string>(
		LOCATION_FIELD,
		specs.filter((spec) => selected.has(spec.value)).map((spec) => spec.leafIds),
	);
}

/**
 * Write a location selection to an engine: the rule for a non-empty selection, no rule for an empty
 * one.
 *
 * @remarks
 * Removing rather than committing an empty set keeps "nothing selected" identical in every app: no
 * `location` entry in the config, so no `location` entry in the link.
 *
 * @param core - The engine to write.
 * @param selection - The picker's compact selection.
 * @param specs - The flattened tree.
 */
export function writeLocationSelection(
	core: Pick<FilterEngine<unknown>, 'addRule' | 'removeRule'>,
	selection: readonly string[],
	specs: readonly LocationNodeSpec[],
): void {
	if (selection.length === 0) {
		core.removeRule(LOCATION_RULE_ID);

		return;
	}
	core.addRule(LOCATION_RULE_ID, buildListingLocationRule(selection, specs));
}

/**
 * Recover the picker's node selection from the committed location rule.
 *
 * @remarks
 * **The inverse of {@link buildListingLocationRule}.** The rule stores one id set per selected node and
 * nothing says which node produced which set, so each committed set is matched back against the specs
 * by set identity, order-independently: a set that has been through JSON and the rule registry carries
 * no ordering guarantee. Built specs never share a set, because each one carries its node's own id.
 *
 * A set matching no spec is skipped rather than throwing: the rule can come from a link naming
 * locations this corpus does not contain, and the honest rendering is the nodes that DO exist. Reads
 * the config structurally, so an absent rule, or a rule of another shape under the location id, reads
 * as nothing selected.
 *
 * @param rule - The engine's `location` rule, if any.
 * @param specs - The flattened tree. **Empty before boot**, which yields an empty selection.
 * @returns The node ids to mark selected, in the committed sets' own order.
 */
export function deriveLocationSelection(
	rule: FilterRule | undefined,
	specs: readonly LocationNodeSpec[],
): readonly string[] {
	const valueBySet = new Map(specs.map((spec) => [idSetKey(spec.leafIds), spec.value] as const));

	return committedIdSets(rule).flatMap((committed) => {
		const value = valueBySet.get(idSetKey(committed));

		return value === undefined ? [] : [value];
	});
}

/**
 * The id sets a location rule holds, read structurally.
 *
 * @param rule - The engine's `location` rule, if any.
 * @returns Its `config.set` when that is a list of string lists; otherwise none.
 */
function committedIdSets(rule: FilterRule | undefined): readonly (readonly string[])[] {
	const committed: unknown = (rule?.config as { readonly set?: unknown } | undefined)?.set;

	return isIdSetList(committed) ? committed : [];
}

/**
 * Whether a value is a list of string lists.
 *
 * @param value - Anything.
 * @returns `true` for `string[][]`.
 */
function isIdSetList(value: unknown): value is readonly (readonly string[])[] {
	return Array.isArray(value)
		&& value.every((entry: unknown) => Array.isArray(entry) && entry.every((id: unknown) => typeof id === 'string'));
}

/**
 * An order-independent key for a set of ids.
 *
 * @param ids - The ids.
 * @returns The ids, sorted and joined with a separator no location id contains.
 */
function idSetKey(ids: readonly string[]): string {
	return [...ids].sort().join('\u0000');
}
