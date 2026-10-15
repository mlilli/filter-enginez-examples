/**
 * Tests for reading a link's location rule in the form every real-estate app commits.
 *
 * @remarks
 * A link is untrusted input, so the rewrite is pinned case by case: which rules it touches (only a
 * `HierarchicalRule` under the `location` id, with a well-formed config), what it turns them into (the
 * sets `buildLocationNodeSpecs` gives the same nodes), and that everything else — including every
 * malformed shape — passes through for the engine's own deserialization to answer.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, SerializedRule } from '@filter-enginez/core';

import { describe, expect, it, vi } from 'vitest';

import { buildLocationNodeSpecs } from './extractors.js';
import { normalizeLocationRule, withNormalizedLocationRule } from './locationLinks.js';

/**
 * A tree as a link carries it (labels included, as `buildListingLocationTree` writes them): CO with one
 * metro of two neighborhoods, and WA with one of one.
 */
const LINKED_TREE = {
	children: [
		{
			children: [{
				children: [
					{ id: 'neighborhood:CO/Greater Denver/Highland', label: 'Highland' },
					{ id: 'neighborhood:CO/Greater Denver/LoDo', label: 'LoDo' },
				],
				id: 'metro:CO/Greater Denver',
				label: 'Greater Denver',
			}],
			id: 'state:CO',
			label: 'CO',
		},
		{
			children: [{
				children: [{ id: 'neighborhood:WA/Greater Seattle/Ballard', label: 'Ballard' }],
				id: 'metro:WA/Greater Seattle',
				label: 'Greater Seattle',
			}],
			id: 'state:WA',
			label: 'WA',
		},
	],
	id: 'location',
	label: 'Location',
};

/**
 * A config holding one location rule.
 *
 * @param rule - The serialized location rule.
 * @returns The config.
 */
function locationConfig(rule: SerializedRule): FilterEngineConfig {
	return { rules: [{ id: 'location', rule }], version: 1 };
}

/**
 * A tree-rule location over a function field, with the given config.
 *
 * @param config - The rule's config, as a link decoded it.
 * @returns The serialized rule.
 */
function hierarchicalLocation(config: unknown): SerializedRule {
	return { config, field: '<function>', type: 'HierarchicalRule' };
}

/**
 * The set-of-sets location rule every app commits.
 *
 * @param set - One set per selected node.
 * @returns The serialized rule.
 */
function setsLocation(set: readonly (readonly string[])[]): SerializedRule {
	return { config: { set }, field: 'locationId', type: 'InSetofSetsRule' };
}

describe('normalizeLocationRule', () => {
	it('rewrites a tree-rule location into one set per selected node, as the panels commit it', () => {
		const normalized = normalizeLocationRule(locationConfig(hierarchicalLocation({
			selected: ['state:CO', 'neighborhood:WA/Greater Seattle/Ballard'],
			tree: LINKED_TREE,
		})));

		expect(normalized).toEqual(locationConfig(setsLocation([
			['CO', 'CO/Greater Denver', 'CO/Greater Denver/Highland', 'CO/Greater Denver/LoDo'],
			['WA/Greater Seattle/Ballard'],
		])));
	});

	it('produces exactly the sets buildLocationNodeSpecs gives the same nodes', () => {
		// The parity the rewrite exists for: a rewritten link and a panel commit must be the same rule.
		const specs = buildLocationNodeSpecs(LINKED_TREE);
		const normalized = normalizeLocationRule(locationConfig(hierarchicalLocation({ selected: ['metro:CO/Greater Denver'], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule.config).toEqual({
			set: [specs.find((spec) => spec.value === 'metro:CO/Greater Denver')?.leafIds],
		});
	});

	it('turns a selected id the tree does not contain into an empty set, which matches no listing', () => {
		const normalized = normalizeLocationRule(locationConfig(hierarchicalLocation({ selected: ['state:TX'], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule).toEqual(setsLocation([[]]));
	});

	it('turns an empty selection into an empty set of sets, which matches every listing', () => {
		const normalized = normalizeLocationRule(locationConfig(hierarchicalLocation({ selected: [], tree: LINKED_TREE })));

		expect(normalized.rules[0]?.rule).toEqual(setsLocation([]));
	});

	it('returns a config with no location rule as the same object', () => {
		const config: FilterEngineConfig = {
			rules: [{ id: 'status', rule: { config: { set: ['active']}, field: 'status', type: 'InSetRule' }}],
			version: 1,
		};

		expect(normalizeLocationRule(config)).toBe(config);
	});

	it('leaves every other rule in a config with a location rule untouched', () => {
		const status: SerializedRule = { config: { set: ['active']}, field: 'status', type: 'InSetRule' };
		const normalized = normalizeLocationRule({
			rules: [
				{ id: 'status', rule: status },
				{ id: 'location', rule: hierarchicalLocation({ selected: ['state:WA'], tree: LINKED_TREE }) },
			],
			version: 1,
		});

		expect(normalized.rules[0]).toEqual({ id: 'status', rule: status });
		expect(normalized.rules[1]?.rule.type).toBe('InSetofSetsRule');
	});

	it('passes the committed set-of-sets rule through unchanged', () => {
		const rule = setsLocation([['WA', 'WA/Greater Seattle', 'WA/Greater Seattle/Ballard']]);

		expect(normalizeLocationRule(locationConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it.each([
		['a null config', null],
		['a selection that is not an array', { selected: 'state:CO', tree: LINKED_TREE }],
		['a selection holding a non-string', { selected: [7], tree: LINKED_TREE }],
		['a null tree', { selected: ['state:CO'], tree: null }],
		['a tree node without a string id', { selected: ['state:CO'], tree: { id: 7 }}],
		['children that are not an array', { selected: ['state:CO'], tree: { children: 'state:CO', id: 'location' }}],
		['a malformed child', { selected: ['state:CO'], tree: { children: [{ id: null }], id: 'location' }}],
	])('passes a tree rule with %s through for the engine to answer', (_label, config) => {
		const rule = hierarchicalLocation(config);

		expect(normalizeLocationRule(locationConfig(rule)).rules[0]?.rule).toBe(rule);
	});
});

describe('withNormalizedLocationRule', () => {
	it('normalizes on decode, delegates encode and keeps the serializer name', () => {
		const decoded = locationConfig(hierarchicalLocation({ selected: ['state:WA'], tree: LINKED_TREE }));
		const inner = {
			decode: vi.fn(() => decoded),
			encode: vi.fn(() => 'encoded'),
			name: 'human-readable' as const,
		};
		const wrapped = withNormalizedLocationRule(inner);

		expect(wrapped.decode('anything')).toEqual(locationConfig(setsLocation([['WA', 'WA/Greater Seattle', 'WA/Greater Seattle/Ballard']])));
		expect(inner.decode).toHaveBeenCalledWith('anything');
		expect(wrapped.encode(decoded)).toBe('encoded');
		expect(inner.encode).toHaveBeenCalledWith(decoded);
		expect(wrapped.name).toBe('human-readable');
	});
});
