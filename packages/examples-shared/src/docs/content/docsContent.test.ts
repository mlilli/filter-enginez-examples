/**
 * Tests for the docs content catalogs — shape + lookup helpers for the rule, algorithm, and API data.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { ALGORITHM_DOCS, findAlgorithmDoc } from './algorithmsContent.js';
import { API_GROUPS } from './apiContent.js';
import { findRuleDoc, RULE_DOCS } from './rulesContent.js';

describe('rule catalog', () => {
	it('lists 15 rules + CompositeRule with unique ids and complete fields', () => {
		expect(RULE_DOCS).toHaveLength(16);
		expect(new Set(RULE_DOCS.map((rule) => rule.id)).size).toBe(RULE_DOCS.length);

		for (const rule of RULE_DOCS) {
			expect(rule.name).toBeTruthy();
			expect(rule.simple).toBeTruthy();
			expect(rule.advanced).toBeTruthy();
			expect(rule.examples.length).toBeGreaterThan(0);
			expect(rule.figure.cells.length).toBeGreaterThan(0);
		}
	});

	it('marks PredicateRule as the only non-serializable rule', () => {
		const nonSerializable = RULE_DOCS.filter((rule) => !rule.serializable).map((rule) => rule.id);

		expect(nonSerializable).toEqual(['predicate']);
	});

	it('findRuleDoc resolves a known id and misses gracefully', () => {
		expect(findRuleDoc('in-set')?.name).toBe('InSetRule');
		expect(findRuleDoc('nope')).toBeUndefined();
		expect(findRuleDoc(undefined)).toBeUndefined();
	});

	it('every "see also" cross-link points at a real rule (never itself, never a dangling id)', () => {
		for (const rule of RULE_DOCS) {
			for (const relatedId of rule.seeAlso ?? []) {
				expect(relatedId, `${rule.id} → ${relatedId}`).not.toBe(rule.id);
				expect(findRuleDoc(relatedId), `${rule.id} → ${relatedId}`).toBeDefined();
			}
		}
	});
});

describe('algorithm catalog', () => {
	it('lists 8 algorithms with a figure + copy each', () => {
		expect(ALGORITHM_DOCS).toHaveLength(8);

		for (const algorithm of ALGORITHM_DOCS) {
			expect(algorithm.Figure).toBeTruthy();
			expect(algorithm.simple).toBeTruthy();
			expect(algorithm.advanced).toBeTruthy();
		}
	});

	it('findAlgorithmDoc resolves a known id and misses gracefully', () => {
		expect(findAlgorithmDoc('roaring-bitmaps')?.name).toBe('Roaring bitmaps');
		expect(findAlgorithmDoc('nope')).toBeUndefined();
		expect(findAlgorithmDoc(undefined)).toBeUndefined();
	});
});

describe('API reference', () => {
	it('has non-empty groups, each with entries carrying signatures', () => {
		expect(API_GROUPS.length).toBeGreaterThan(0);

		for (const group of API_GROUPS) {
			expect(group.title).toBeTruthy();
			expect(group.entries.length).toBeGreaterThan(0);
			for (const entry of group.entries) {
				expect(entry.name).toBeTruthy();
				expect(entry.signature).toBeTruthy();
			}
		}
	});
});
