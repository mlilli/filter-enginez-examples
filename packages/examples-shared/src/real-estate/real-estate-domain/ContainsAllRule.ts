/**
 * `ContainsAllRule` — a serializable "the array field contains ALL of a required set" filter, and a
 * worked example of the engine's consumer-extension contract.
 *
 * @remarks
 * The real-estate "must-have features" filter is an AND over `Listing.features` (a `string[]`): a
 * listing passes only if its features include every selected one. A `PredicateRule` would not do: a
 * predicate's closure can't serialize, so its state couldn't round-trip through JSON config / the URL.
 * This registry-registered subclass can: its config is a plain `{ required: string[] }`, so it
 * serializes with the default `FilterRule.serialize()` and revives through `ruleRegistry.deserialize`
 * (which constructs via `new ContainsAllRule(field, config)`, running the `action` class-field
 * initializer).
 *
 * **The built-in equivalent.** `inSet('features', { arrayMatch: 'all', set: required })` matches the
 * same listings: every array that holds all the selected values, everything for an empty selection,
 * and no empty array for a non-empty one. The two differ only on a field that is not an array, which
 * `InSetRule` compares as a single value and this rule rejects; `features` is always an array. This
 * rule stays because it is the repo's worked example of the extension contract (the
 * `ruleTypeName` static, the registry, the bundle's `containsAll` chip kind and the results-header
 * summarizer branch a custom rule needs), and because `?f=` links already carry it by this name.
 *
 * @packageDocumentation
 */

import { type FieldExtractor, FilterRule, type FilterRuleAction, ruleRegistry } from '@filter-enginez/core';

/** Serializable config for {@link ContainsAllRule}. */
export interface ContainsAllRuleConfig {
	/** Every value the item's array field must contain (AND). Empty means "no constraint". */
	readonly required: readonly string[];
}

/**
 * Passes items whose array-valued field contains every value in `config.required`.
 *
 * @example
 *   engine.addRule('must-have-features', new ContainsAllRule('features', { required: ['pool', 'garage'] }));
 */
export class ContainsAllRule extends FilterRule {
	/**
	 * Minifier-proof wire name — see {@link FilterRule.ruleTypeName}. **This is the half of the
	 * consumer-extension contract that a custom rule is most likely to omit**, so this class being
	 * the repo's worked example matters: without it, `serialize()` would emit the mangled class
	 * identifier in a production build and the must-have-features filter would silently stop
	 * restoring from a `?f` link. `ruleRegistry.register` below rejects a name that disagrees with it.
	 */
	static override readonly ruleTypeName = 'ContainsAllRule';

	config: ContainsAllRuleConfig;

	/** Passes an item only when its array field contains every value in {@link config}.required. */
	override action: FilterRuleAction = (item, rule): boolean => {
		const { required } = (rule as ContainsAllRule).config;

		if (required.length === 0) {
			return true;
		}
		const value = this.getFieldValue(item);

		if (!Array.isArray(value)) {
			return false;
		}
		const present = value as readonly unknown[];

		return required.every((needed) => present.includes(needed));
	};

	/**
	 * @param field - Extracts the array to test (e.g. `'features'`).
	 * @param config - The required-values set. `ruleRegistry.deserialize` passes the serialized
	 *   config object here, so the shape must match what `serialize()` writes back.
	 */
	constructor(field: FieldExtractor, config: ContainsAllRuleConfig) {
		super(field);
		this.config = config;
	}
}

// Register so JSON-config / URL-state / worker-bridge serialization can revive it. Guarded against
// double-registration on a Vite HMR re-evaluation of this module (the registry throws on duplicates).
/* v8 ignore next 3 -- the false arm fires only on a Vite HMR re-evaluation of this module, which no
   test environment reproduces: a module registry evaluates a module once per process, so the second
   registration this guards against cannot happen under vitest. Verified by the dev server rather
   than by a test — without it, editing this file mid-session throws a duplicate-registration error
   and takes the whole route down until a full reload. */
if (!ruleRegistry.has('ContainsAllRule')) {
	ruleRegistry.register('ContainsAllRule', ContainsAllRule);
}
