/**
 * `originLinks` — how the wine origin rule reads in a `?f=` link, including a link that carries it
 * as the engine's tree rule.
 *
 * @remarks
 * Every wine app commits an origin selection as the same `InSetofSetsRule` over `originId`
 * (`./originRule.ts` says why). A link may instead carry origin as a `HierarchicalRule` over
 * `originId`, the engine's general-purpose tree rule, and such a link reads the same: every app
 * decodes `?f=` through {@link withNormalizedOriginRule}, which rewrites that rule into the
 * `InSetofSetsRule` the panels commit, computing each selected node's set from the tree the link
 * itself carries. The result does not depend on which corpus the receiving app has loaded, and it is
 * the rule a panel commits for the same selection over the same tree, so the link loads, displays and
 * re-encodes exactly like a link any of the six apps writes.
 *
 * Its own module, imported by `src/url/linkSerializer.ts` — the serializer every app's URL layer
 * builds on every route — so that it pulls in nothing but types.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, RuleId, SerializedRule } from '@filter-enginez/core';
import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

/** The origin facet's rule id — one of `WINE_FACET_RULE_IDS`. */
export const ORIGIN_RULE_ID: RuleId = 'origin';

/** The record field the origin rule tests: each wine's pipe-joined origin path. */
export const ORIGIN_FIELD = 'originId';

/** The serialized `type` of the rule every app commits for origin. */
const IN_SET_OF_SETS_TYPE = 'InSetofSetsRule';

/** The serialized `type` of the engine's tree rule, which a link may carry for origin. */
const HIERARCHICAL_TYPE = 'HierarchicalRule';

/** A tree node as a decoded `HierarchicalRule` config carries it, once checked. */
interface LinkedTreeNode {
	/** The node's id. */
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
 * Every id in a subtree, the root first, in pre-order — the order `buildOriginNodeSpecs` lists a
 * node's {@link OriginNodeSpec.leafIds} in.
 *
 * @param node - The subtree's root.
 * @returns Its id and every id beneath it.
 */
function subtreeIds(node: LinkedTreeNode): readonly string[] {
	return [node.id, ...(node.children ?? []).flatMap(subtreeIds)];
}

/**
 * The ids of the subtree rooted at the node with a given id.
 *
 * @param node - Where to search from.
 * @param rootId - The id of the subtree's root.
 * @returns The subtree's ids, or none when the tree has no such node.
 */
function findSubtreeIds(node: LinkedTreeNode, rootId: string): readonly string[] {
	if (node.id === rootId) {
		return subtreeIds(node);
	}
	for (const child of node.children ?? []) {
		const found = findSubtreeIds(child, rootId);

		if (found.length > 0) {
			return found;
		}
	}

	return [];
}

/**
 * Rewrite one decoded rule into the origin rule the apps commit, when it is a link's tree-rule origin.
 *
 * @remarks
 * Only `HierarchicalRule` over `originId` with a well-formed config is rewritten; every other rule —
 * including a malformed one, which the engine's own deserialization then answers for — passes through
 * as is.
 * A selected id the tree does not contain becomes an empty set, which matches no wine, exactly as the
 * `HierarchicalRule` matched none for it; an empty selection becomes an empty set of sets, which
 * matches every wine, as the `HierarchicalRule`'s empty selection did.
 *
 * @param rule - One serialized rule from a decoded config.
 * @returns The rule to load.
 */
function normalizeSerializedOriginRule(rule: SerializedRule): SerializedRule {
	if (rule.type !== HIERARCHICAL_TYPE || rule.field !== ORIGIN_FIELD || !isLinkedHierarchicalConfig(rule.config)) {
		return rule;
	}
	const { selected, tree } = rule.config;

	return {
		config: { set: selected.map((id) => findSubtreeIds(tree, id)) },
		field: ORIGIN_FIELD,
		type: IN_SET_OF_SETS_TYPE,
	};
}

/**
 * Read a decoded filter state's origin rule in the form every app commits.
 *
 * @remarks
 * See the module docblock. Rules with any other id are returned untouched, so this is safe to apply
 * to every dataset's links; a config with nothing to rewrite is returned as the same object.
 *
 * @param config - A config decoded from `?f=`.
 * @returns The config, its `origin` rule (if any) normalized.
 */
export function normalizeOriginRule(config: FilterEngineConfig): FilterEngineConfig {
	if (!config.rules.some((entry) => entry.id === ORIGIN_RULE_ID)) {
		return config;
	}

	return {
		...config,
		rules: config.rules.map((entry) =>
			entry.id === ORIGIN_RULE_ID ? { id: entry.id, rule: normalizeSerializedOriginRule(entry.rule) } : entry,
		),
	};
}

/**
 * A `?f=` serializer whose `decode` also normalizes the origin rule ({@link normalizeOriginRule}).
 *
 * @remarks
 * Every app wraps its tagged serializer in this wherever it decodes a link — on first load, when the
 * format toggle re-encodes the address bar, and on the server routes — so a link carrying the tree
 * rule loads, displays and re-encodes exactly like a link made today. `encode` is the serializer's own.
 *
 * @param serializer - The serializer to wrap: url-state-router's tagged serializer, in practice.
 * @returns The wrapped serializer.
 */
export function withNormalizedOriginRule(serializer: EngineStateSerializer): EngineStateSerializer {
	return {
		decode: (serialized) => normalizeOriginRule(serializer.decode(serialized)),
		encode: (config) => serializer.encode(config),
		name: serializer.name,
	};
}
