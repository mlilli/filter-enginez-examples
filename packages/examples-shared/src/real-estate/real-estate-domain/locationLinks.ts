/**
 * `locationLinks` — how the real-estate location rule reads in a `?f=` link, including a link that
 * carries it as the engine's tree rule.
 *
 * @remarks
 * Every real-estate app commits a location selection as the same `InSetofSetsRule` over `locationId`
 * (`./locationRule.ts` says why). A link may instead carry location as a `HierarchicalRule`: the
 * engine's general-purpose tree rule, whose `field` was a function and so travels as the placeholder
 * `"<function>"`, which no app can turn back into a function. Decoded as is, that rule tests no field
 * at all and matches no listing. So every app decodes `?f=` through {@link withNormalizedLocationRule},
 * which rewrites it into the `InSetofSetsRule` the panels commit, computing each selected node's set
 * from the tree the link itself carries. The result does not depend on which corpus the receiving app
 * has loaded, and it is the rule a panel commits for the same selection over the same tree, so the link
 * loads, displays and re-encodes exactly like a link any of the six apps writes.
 *
 * The wine origin rule has the same arrangement (`../../wine/wine-domain/originLinks.ts`).
 *
 * Its own module, imported by `src/url/linkSerializer.ts` — the serializer every app's URL layer
 * builds on every route — so that it pulls in nothing but types and the id translation.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, RuleId, SerializedRule } from '@filter-enginez/core';
import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

import { toLocationFieldId } from './extractors.js';

/** The location facet's rule id. */
export const LOCATION_RULE_ID: RuleId = 'location';

/** The record field the location rule tests: each listing's `state/metro/neighborhood` path. */
export const LOCATION_FIELD = 'locationId';

/** The serialized `type` of the rule every app commits for location. */
const IN_SET_OF_SETS_TYPE = 'InSetofSetsRule';

/** The serialized `type` of the engine's tree rule, which a link may carry for location. */
const HIERARCHICAL_TYPE = 'HierarchicalRule';

/** A tree node as a decoded `HierarchicalRule` config carries it, once checked. */
interface LinkedTreeNode {
	/** The node's id, in picker space (`state:CO`). */
	readonly id: string;
	/** Its children, if any. */
	readonly children?: readonly LinkedTreeNode[];
}

/** A decoded `HierarchicalRule` config, once checked. */
interface LinkedHierarchicalConfig {
	/** The selected node ids. */
	readonly selected: readonly string[];
	/** The tree the ids are resolved in. */
	readonly tree: LinkedTreeNode;
}

/**
 * Whether a decoded value is a tree node: an object with a string id and, if it has children, an
 * array of tree nodes.
 *
 * @param value - Anything a link decoded to.
 * @returns `true` for a well-formed node.
 */
function isLinkedTreeNode(value: unknown): value is LinkedTreeNode {
	const candidate = value as { readonly id?: unknown; readonly children?: unknown } | null | undefined;

	return typeof candidate?.id === 'string'
		&& (candidate.children === undefined || (Array.isArray(candidate.children) && candidate.children.every(isLinkedTreeNode)));
}

/**
 * Whether a decoded rule config is a well-formed `HierarchicalRule` config.
 *
 * @param config - The serialized rule's `config`, straight from a link.
 * @returns `true` when it has a string array `selected` and a well-formed `tree`.
 */
function isLinkedHierarchicalConfig(config: unknown): config is LinkedHierarchicalConfig {
	const candidate = config as { readonly selected?: unknown; readonly tree?: unknown } | null | undefined;

	return Array.isArray(candidate?.selected)
		&& candidate.selected.every((id) => typeof id === 'string')
		&& isLinkedTreeNode(candidate.tree);
}

/**
 * Every id in a subtree in field space, the root first, in pre-order — the order
 * `buildLocationNodeSpecs` lists a node's ids in.
 *
 * @param node - The subtree's root.
 * @returns Its field-space id and every one beneath it.
 */
function subtreeFieldIds(node: LinkedTreeNode): readonly string[] {
	return [toLocationFieldId(node.id), ...(node.children ?? []).flatMap(subtreeFieldIds)];
}

/**
 * The field-space ids of the subtree rooted at the node with a given id.
 *
 * @param node - Where to search from.
 * @param rootId - The picker-space id of the subtree's root.
 * @returns The subtree's ids, or none when the tree has no such node.
 */
function findSubtreeFieldIds(node: LinkedTreeNode, rootId: string): readonly string[] {
	if (node.id === rootId) {
		return subtreeFieldIds(node);
	}
	for (const child of node.children ?? []) {
		const found = findSubtreeFieldIds(child, rootId);

		if (found.length > 0) {
			return found;
		}
	}

	return [];
}

/**
 * Rewrite one decoded rule into the location rule the apps commit, when it is a link's tree-rule
 * location.
 *
 * @remarks
 * Only a `HierarchicalRule` with a well-formed config is rewritten; every other rule, including a
 * malformed one, which the engine's own deserialization then answers for, passes through as is. The
 * `field` is not checked: the tree rule's field was a function, and the placeholder it travels as says
 * nothing about which one. A selected id the tree does not contain becomes an empty set, which matches
 * no listing; an empty selection becomes an empty set of sets, which matches every listing, as the
 * `HierarchicalRule`'s empty selection did.
 *
 * @param rule - One serialized rule from a decoded config.
 * @returns The rule to load.
 */
function normalizeSerializedLocationRule(rule: SerializedRule): SerializedRule {
	if (rule.type !== HIERARCHICAL_TYPE || !isLinkedHierarchicalConfig(rule.config)) {
		return rule;
	}
	const { selected, tree } = rule.config;

	return {
		config: { set: selected.map((id) => findSubtreeFieldIds(tree, id)) },
		field: LOCATION_FIELD,
		type: IN_SET_OF_SETS_TYPE,
	};
}

/**
 * Read a decoded filter state's location rule in the form every app commits.
 *
 * @remarks
 * See the module docblock. Rules with any other id are returned untouched, so this is safe to apply
 * to every dataset's links; a config with nothing to rewrite is returned as the same object.
 *
 * @param config - A config decoded from `?f=`.
 * @returns The config, its `location` rule (if any) normalized.
 */
export function normalizeLocationRule(config: FilterEngineConfig): FilterEngineConfig {
	if (!config.rules.some((entry) => entry.id === LOCATION_RULE_ID)) {
		return config;
	}

	return {
		...config,
		rules: config.rules.map((entry) =>
			entry.id === LOCATION_RULE_ID ? { id: entry.id, rule: normalizeSerializedLocationRule(entry.rule) } : entry,
		),
	};
}

/**
 * A `?f=` serializer whose `decode` also normalizes the location rule ({@link normalizeLocationRule}).
 *
 * @remarks
 * Applied by `createLinkSerializer`, which every app decodes links with — on first load, when the
 * format toggle re-encodes the address bar, and on the server routes. `encode` is the serializer's own.
 *
 * @param serializer - The serializer to wrap.
 * @returns The wrapped serializer.
 */
export function withNormalizedLocationRule(serializer: EngineStateSerializer): EngineStateSerializer {
	return {
		decode: (serialized) => normalizeLocationRule(serializer.decode(serialized)),
		encode: (config) => serializer.encode(config),
		name: serializer.name,
	};
}
