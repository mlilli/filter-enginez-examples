/**
 * Tests for reading a link's origin rule in the form every wine app commits.
 *
 * @remarks
 * A link is untrusted input, so the rewrite is pinned case by case: which rules it touches (only a
 * `HierarchicalRule` over `originId` under the `origin` id, with a well-formed config), what it turns
 * them into (the sets `buildOriginNodeSpecs` would give the same nodes), and that everything else —
 * including every malformed shape — passes through for the engine's own deserialization to answer.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, SerializedRule } from '@filter-enginez/core';

import { describe, expect, it, vi } from 'vitest';

import { normalizeOriginRule, withNormalizedOriginRule } from './originLinks.js';

/** A tree as a link carries it: US with two states (Oregon with one region), and France as a leaf. */
const LINKED_TREE = {
	children: [
		{
			children: [{ children: [{ id: 'US|Oregon|Willamette Valley' }], id: 'US|Oregon' }, { id: 'US|California' }],
			id: 'US',
		},
		{ id: 'France' },
	],
	id: 'origin',
};

/**
 * A config holding one origin rule.
 *
 * @param rule - The serialized origin rule.
 * @returns The config.
 */
function originConfig(rule: SerializedRule): FilterEngineConfig {
	return { rules: [{ id: 'origin', rule }], version: 1 };
}

/**
 * A tree-rule origin over `originId`, with the given config.
 *
 * @param config - The rule's config, as a link decoded it.
 * @returns The serialized rule.
 */
function hierarchicalOrigin(config: unknown): SerializedRule {
	return { config, field: 'originId', type: 'HierarchicalRule' };
}

/**
 * The set-of-sets origin rule every app commits.
 *
 * @param set - One set per selected node.
 * @returns The serialized rule.
 */
function setsOrigin(set: readonly (readonly string[])[]): SerializedRule {
	return { config: { set }, field: 'originId', type: 'InSetofSetsRule' };
}

describe('normalizeOriginRule', () => {
	it('rewrites a tree-rule origin into one set per selected node: the node and everything beneath it, pre-order', () => {
		const normalized = normalizeOriginRule(originConfig(hierarchicalOrigin({ selected: ['US', 'France'], tree: LINKED_TREE })));

		expect(normalized).toEqual(
			originConfig(setsOrigin([['US', 'US|Oregon', 'US|Oregon|Willamette Valley', 'US|California'], ['France']])),
		);
	});

	it('finds a selected node below the first level, and past a sibling subtree that does not hold it', () => {
		const normalized = normalizeOriginRule(originConfig(hierarchicalOrigin({ selected: ['US|California'], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule).toEqual(setsOrigin([['US|California']]));
	});

	it('gives a selected id the tree lacks an empty set, which matches no wine, as the tree rule matched none', () => {
		const normalized = normalizeOriginRule(originConfig(hierarchicalOrigin({ selected: ['Atlantis'], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule).toEqual(setsOrigin([[]]));
	});

	it('turns an empty selection into an empty set of sets, which matches every wine, as the tree rule did', () => {
		const normalized = normalizeOriginRule(originConfig(hierarchicalOrigin({ selected: [], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule).toEqual(setsOrigin([]));
	});

	it('leaves every other rule — and the rest of the config — exactly as decoded', () => {
		const color: SerializedRule = { config: { set: ['red']}, field: 'color', type: 'InSetRule' };
		const config: FilterEngineConfig = {
			expression: { ruleId: 'origin', type: 'rule' },
			label: 'mixed',
			rules: [
				{ id: 'color', rule: color },
				{ id: 'origin', rule: hierarchicalOrigin({ selected: ['France'], tree: LINKED_TREE }) },
			],
			version: 1,
		};
		const normalized = normalizeOriginRule(config);

		expect(normalized.rules[0]?.rule).toBe(color);
		expect(normalized.rules[1]?.rule).toEqual(setsOrigin([['France']]));
		expect(normalized.expression).toBe(config.expression);
		expect(normalized.label).toBe('mixed');
	});

	it('returns a config with no origin rule as the same object', () => {
		const config: FilterEngineConfig = { rules: [{ id: 'color', rule: { config: { set: ['red']}, field: 'color', type: 'InSetRule' }}], version: 1 };

		expect(normalizeOriginRule(config)).toBe(config);
	});

	it('passes the set-of-sets rule every app commits through untouched', () => {
		const rule = setsOrigin([['France']]);

		expect(normalizeOriginRule(originConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it('rewrites only the origin facet: a tree rule over originId under another id passes through untouched', () => {
		const rule = hierarchicalOrigin({ selected: ['France'], tree: LINKED_TREE });
		const config: FilterEngineConfig = { rules: [{ id: 'origin', rule: setsOrigin([['US']]) }, { id: 'region-tree', rule }], version: 1 };

		expect(normalizeOriginRule(config).rules[1]?.rule).toBe(rule);
	});

	it('passes a tree rule over another field through untouched', () => {
		const rule: SerializedRule = { config: { selected: ['France'], tree: LINKED_TREE }, field: 'region', type: 'HierarchicalRule' };

		expect(normalizeOriginRule(originConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it.each([
		['a null config', null],
		['a config that is not an object', 'France'],
		['no selection', { tree: LINKED_TREE }],
		['a selection that is not an array', { selected: 'France', tree: LINKED_TREE }],
		['a selection holding a non-string', { selected: ['France', 7], tree: LINKED_TREE }],
		['no tree', { selected: ['France']}],
		['a tree whose root id is not a string', { selected: ['France'], tree: { id: 7 }}],
		['a tree whose children are not an array', { selected: ['France'], tree: { children: { id: 'France' }, id: 'origin' }}],
		['a tree with a malformed node below the root', { selected: ['France'], tree: { children: [{ id: 'France' }, { label: 'US' }], id: 'origin' }}],
		['a tree with a null node', { selected: ['France'], tree: { children: [null], id: 'origin' }}],
	])('passes a tree rule with %s through untouched, for the engine to answer', (_case, config) => {
		const rule = hierarchicalOrigin(config);

		expect(normalizeOriginRule(originConfig(rule)).rules[0]?.rule).toBe(rule);
	});
});

describe('withNormalizedOriginRule', () => {
	it('normalizes what the wrapped serializer decodes, and leaves its encode and name alone', () => {
		const decoded = originConfig(hierarchicalOrigin({ selected: ['France'], tree: LINKED_TREE }));
		const inner = { decode: vi.fn(() => decoded), encode: vi.fn(() => 'h~encoded'), name: 'tagged:human-readable' };
		const serializer = withNormalizedOriginRule(inner);

		expect(serializer.decode('h~link')).toEqual(originConfig(setsOrigin([['France']])));
		expect(inner.decode).toHaveBeenCalledWith('h~link');
		expect(serializer.encode(decoded)).toBe('h~encoded');
		expect(inner.encode).toHaveBeenCalledWith(decoded);
		expect(serializer.name).toBe('tagged:human-readable');
	});
});
