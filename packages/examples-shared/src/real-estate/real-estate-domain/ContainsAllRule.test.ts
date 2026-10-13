/**
 * Tests for `ContainsAllRule` — the consumer-extension example, and the real-estate must-have-features
 * filter.
 *
 * @remarks
 * This rule exists because a `PredicateRule`'s closure cannot serialize, so its state could not
 * round-trip through JSON config or the URL. That makes SERIALIZATION the point of the class, not a
 * side feature — so the round-trip is tested through the real `ruleRegistry`, which is the path
 * JSON-config load, URL state, and the worker bridge all take. A rule that filters correctly but
 * revives wrong would produce a shared link that silently shows different results than the sender saw.
 *
 * The predicate itself is conjunctive — `array ⊇ required` — and that direction is what the whole
 * `containsAll` bundle-candidate kind was built around. `some` instead of `every` here would pass a
 * listing that has ANY required feature, which looks plausible on screen and is wrong in the
 * user-hostile direction: it offers results that do not meet the stated requirement.
 */

import { ruleRegistry } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { ContainsAllRule } from './ContainsAllRule.js';

/** A listing-shaped item carrying whatever `features` value a test needs. */
function listing(features: unknown): unknown {
	return { features, id: 'x' };
}

/**
 * Evaluate the rule against an item.
 *
 * @param required - The required feature set.
 * @param features - The item's `features` value.
 * @returns Whether the item passes.
 */
function passes(required: readonly string[], features: unknown): boolean {
	const rule = new ContainsAllRule('features', { required });

	return rule.action(listing(features), rule);
}

describe('the conjunctive predicate', () => {
	it('passes an item holding every required feature', () => {
		expect(passes(['pool', 'garage'], ['pool', 'garage', 'deck'])).toBe(true);
	});

	it('rejects an item missing ONE of several required features', () => {
		// The case that separates `every` from `some`. A listing with the pool but no garage does not
		// meet a "pool AND garage" requirement, and offering it would be worse than showing nothing:
		// the user asked for both.
		expect(passes(['pool', 'garage'], ['pool', 'deck'])).toBe(false);
	});

	it('rejects an item with none of them', () => {
		expect(passes(['pool', 'garage'], ['deck'])).toBe(false);
	});

	it('requires an exact value match rather than a substring', () => {
		// `includes` on an array is element equality, not substring. Worth pinning because the same
		// method name on a STRING would make this a substring test and quietly widen the filter.
		expect(passes(['pool'], ['pool-house'])).toBe(false);
		expect(passes(['pool'], ['swimming pool'])).toBe(false);
	});

	it('passes everything when nothing is required — an empty set is no constraint', () => {
		// The neutral state. This is what the panel holds before any feature is ticked, so getting it
		// wrong would empty the result set the moment the rule is registered.
		expect(passes([], ['deck'])).toBe(true);
		expect(passes([], [])).toBe(true);
		expect(passes([], undefined)).toBe(true);
	});

	it('rejects an item whose field is not an array', () => {
		// Real corpora are sparse. A listing with a missing or scalar `features` cannot satisfy a
		// non-empty requirement, and must not throw on the way to saying so.
		expect(passes(['pool'], undefined)).toBe(false);
		expect(passes(['pool'], null)).toBe(false);
		expect(passes(['pool'], 'pool')).toBe(false);
		expect(passes(['pool'], { pool: true })).toBe(false);
	});

	it('rejects an item with an empty features array when something is required', () => {
		expect(passes(['pool'], [])).toBe(false);
	});

	it('is order-independent', () => {
		expect(passes(['garage', 'pool'], ['pool', 'garage'])).toBe(true);
	});

	it('tolerates duplicates on either side', () => {
		expect(passes(['pool', 'pool'], ['pool'])).toBe(true);
		expect(passes(['pool'], ['pool', 'pool'])).toBe(true);
	});
});

describe('serialization round-trip', () => {
	it('serializes to a plain JSON-safe config', () => {
		const serialized = new ContainsAllRule('features', { required: ['pool', 'garage']}).serialize();

		// Must survive `JSON.stringify` untouched — this crosses the URL, the JSON config, and Comlink.
		expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
		expect(serialized).toMatchObject({ config: { required: ['pool', 'garage']}, field: 'features', type: 'ContainsAllRule' });
	});

	it('is registered under its own type name', () => {
		expect(ruleRegistry.has('ContainsAllRule')).toBe(true);
	});

	it('revives through the registry with its behavior intact', () => {
		// The whole reason this is a class rather than a PredicateRule. `deserialize` reconstructs via the
		// constructor, which re-runs the `action` class-field initializer — a revived rule that had
		// lost its action would silently pass everything.
		const original = new ContainsAllRule('features', { required: ['pool', 'garage']});
		const revived = ruleRegistry.deserialize(original.serialize());

		expect(revived).toBeInstanceOf(ContainsAllRule);
		expect(revived.action(listing(['pool', 'garage']), revived)).toBe(true);
		expect(revived.action(listing(['pool']), revived)).toBe(false);
	});

	it('survives a second round-trip unchanged', () => {
		const once = new ContainsAllRule('features', { required: ['pool']}).serialize();
		const twice = ruleRegistry.deserialize(once).serialize();

		expect(twice).toEqual(once);
	});

	it('revives an empty requirement as the neutral rule', () => {
		const revived = ruleRegistry.deserialize(new ContainsAllRule('features', { required: []}).serialize());

		expect(revived.action(listing(['anything']), revived)).toBe(true);
	});
});

describe('registration idempotence', () => {
	it('does not re-register on a repeat module evaluation', async () => {
		// The registry throws on duplicate type names, and Vite HMR re-evaluates this module on every
		// edit during development. Without the `has` guard, saving the file mid-session would crash the
		// dev server rather than hot-reloading.
		await expect(import('./ContainsAllRule.js')).resolves.toBeDefined();
		expect(ruleRegistry.has('ContainsAllRule')).toBe(true);
	});
});
