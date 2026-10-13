/**
 * `real-estate-domain/ruleSummaries` — the engine-coupled `instanceof`-based rule → active-filter-chip
 * summarizer for the real-estate results header (framework-neutral).
 *
 * @remarks
 * Walks the active-rule map and emits one plain {@link FilterSummary} per constraining rule, dropping
 * no-op / permissive rules, discriminating on `instanceof` against the concrete rule classes — live
 * rule instances don't carry a `type` field (that's a serialization artifact), so `instanceof` is the
 * honest discriminator.
 *
 * **Real-estate's summarizer is the widest in the repo.** On top of the Range / InSet / TextSearch
 * kinds books uses, it covers `HierarchicalRule` (the location tree), `GeoProximityRule` (radius, shown
 * in miles), `DateRangeRule` (the listed-date presets), and the custom {@link ContainsAllRule}
 * (must-have features).
 *
 * It lives here for the same reason `books-domain` and `wine-domain` have one: all six verticals render
 * real-estate chips from it, and per-app copies of a summarizer are how chip labels silently drift
 * apart between apps.
 *
 * @packageDocumentation
 */

import {
	DateRangeRule,
	type FilterRule,
	GeoProximityRule,
	HierarchicalRule,
	InSetRule,
	RangeRule,
	type RuleId,
	TextSearchRule,
} from '@filter-enginez/core';

import { type FilterSummary } from '../../summaries/ruleSummary.js';
import { ContainsAllRule } from './ContainsAllRule.js';
import { DATE_PRESET_SUMMARY_LABELS } from './filterConfig.js';
import { formatListingPrice, humanizeVocabularyValue } from './formatters.js';
import { describeMapCoords, type MetroCenterOption } from './metroCenters.js';
import { kmToMiles } from './units.js';

// Re-exported so every existing `real-estate-domain` import site keeps working. See that module for
// why the declaration is shared with books but NOT with react-ui.
export { type FilterSummary } from '../../summaries/ruleSummary.js';


// The lookup maps below are typed with an explicit `| undefined` value so index access yields
// `T | undefined` even where `noUncheckedIndexedAccess` is off — the `?? ruleId` fallbacks and
// `!== undefined` guards are then load-bearing rather than "unnecessary conditions".

/** Whole-dollar USD formatter for the price chip. */

/** Human labels for the InSet chip / checklist rules. */
const IN_SET_LABELS: Record<string, string | undefined> = {
	'property-type': 'Type',
	'school-district': 'School',
	status: 'Status',
};

/**
 * Human labels, formatters, and no-op extents for the range rules. A rule spanning at or beyond these
 * bounds doesn't constrain the corpus, so it produces no chip — this is what stops a slider sitting at
 * its baseline from cluttering the header with a chip the user can't meaningfully clear.
 */
const RANGE_META: Record<
	string,
	{ readonly fmt: (n: number) => string; readonly label: string; readonly maxGE: number; readonly minLE: number } | undefined
> = {
	bathrooms: { fmt: (n) => `${n.toFixed(0)} ba`, label: 'Baths', maxGE: 10, minLE: 0 },
	bedrooms: { fmt: (n) => `${n.toFixed(0)} bd`, label: 'Beds', maxGE: 10, minLE: 0 },
	'lot-size': { fmt: (n) => `${n.toFixed(2)} ac`, label: 'Lot', maxGE: 5, minLE: 0 },
	price: { fmt: (n) => formatListingPrice(n), label: 'Price', maxGE: 2_000_000, minLE: 0 },
	'square-feet': { fmt: (n) => `${n.toLocaleString()} sqft`, label: 'Sqft', maxGE: 10_000, minLE: 0 },
	'year-built': { fmt: (n) => n.toFixed(0), label: 'Year', maxGE: 2025, minLE: 1900 },
};

/** Human labels for the listed-date presets. */
/* The labels themselves live in `filterConfig` beside the preset values and the panel's short
 * spellings of them, so a preset cannot be added to the control without the chip knowing how to name
 * it. */

/**
 * Context a summary may need beyond the rule itself.
 *
 * @remarks
 * Optional in full, so a caller that has none still gets correct — if slightly terser — chips. Only
 * the geo rule uses it: a `GeoProximityRule` carries a center as bare coordinates, and turning
 * `39.7392, -104.9903` into "Greater Denver" needs the corpus-derived metro list, which a rule cannot
 * know about.
 */
export interface RuleSummaryOptions {
	/**
	 * The metro dropdown's options, for naming a geo rule's center.
	 *
	 * @remarks
	 * Omit it and the distance chip falls back to coordinates, which is honest rather than degraded —
	 * a radius centered on a dragged marker has no name either way.
	 */
	readonly metroCenters?: readonly MetroCenterOption[];
}

/**
 * Walk the active-rules map, producing a chip summary for every rule currently constraining the
 * result set.
 *
 * @param rules - The engine's active rules, keyed by id.
 * @param options - Optional context; see {@link RuleSummaryOptions}.
 * @returns One summary per constraining rule, in map iteration order. Permissive rules are omitted.
 */
export function buildRuleSummaries(
	rules: ReadonlyMap<RuleId, FilterRule>,
	options: RuleSummaryOptions = {},
): readonly FilterSummary[] {
	const summaries: FilterSummary[] = [];

	for (const [ruleId, rule] of rules) {
		const summary = summarizeRule(ruleId, rule, options);

		if (summary !== null) {
			summaries.push(summary);
		}
	}

	return summaries;
}

/**
 * Single-rule summarizer. Returns `null` when the rule is a no-op (imposes no constraint).
 *
 * @param ruleId - The rule's id, used for the label lookup and as the chip's remove key.
 * @param rule - The live rule instance.
 * @param options - Optional context; see {@link RuleSummaryOptions}.
 * @returns The chip summary, or `null` for a non-constraining rule.
 */
export function summarizeRule(
	ruleId: RuleId,
	rule: FilterRule,
	options: RuleSummaryOptions = {},
): FilterSummary | null {
	if (rule instanceof RangeRule) {
		return summarizeRangeRule(ruleId, rule);
	}
	if (rule instanceof InSetRule) {
		const set = rule.config.set;

		return set.length === 0
			? null
			: { isNumeric: false, label: IN_SET_LABELS[ruleId] ?? ruleId, ruleId, value: formatSetValue(set) };
	}
	if (rule instanceof HierarchicalRule) {
		const count = rule.config.selected.length;

		return count === 0
			? null
			: { isNumeric: false, label: 'Location', ruleId, value: `${count} area${count === 1 ? '' : 's'}` };
	}
	if (rule instanceof GeoProximityRule) {
		// "≤ 15 mi" alone answers half the question. A radius is meaningless without its center, and
		// the center is the half the user actually chose — they picked Denver and then adjusted the
		// number. Naming it also disambiguates the chip from the six numeric range chips beside it.
		const center = describeMapCoords(options.metroCenters ?? [], rule.config.center);

		return {
			isNumeric: true,
			label: 'Distance',
			ruleId,
			value: `≤ ${String(Math.round(kmToMiles(rule.config.radiusKm)))} mi of ${center}`,
		};
	}
	if (rule instanceof DateRangeRule) {
		const { preset } = rule.config;

		return preset === undefined
			? null
			: { isNumeric: false, label: 'Listed', ruleId, value: DATE_PRESET_SUMMARY_LABELS[preset] ?? preset };
	}
	if (rule instanceof ContainsAllRule) {
		const count = rule.config.required.length;

		return count === 0 ? null : { isNumeric: false, label: 'Features', ruleId, value: `${count} required` };
	}
	if (rule instanceof TextSearchRule) {
		const query = rule.config.query.trim();

		return query === '' ? null : { isNumeric: false, label: 'Search', ruleId, value: `"${query}"` };
	}

	return null;
}

/**
 * Summarize a `RangeRule` into a chip, or `null` when the range sits at its baseline no-op extent.
 * Split out to keep {@link summarizeRule} under the cyclomatic-complexity cap.
 *
 * @param ruleId - The rule's id.
 * @param rule - The live range rule.
 * @returns The chip summary, or `null` when the range doesn't constrain.
 */
function summarizeRangeRule(ruleId: RuleId, rule: RangeRule): FilterSummary | null {
	const { max, min } = rule.config;
	const isMaxOpen = !Number.isFinite(max);
	const meta = RANGE_META[ruleId];

	if (meta !== undefined && min <= meta.minLE && (max >= meta.maxGE || isMaxOpen)) {
		return null;
	}
	const format = meta?.fmt ?? ((n: number) => n.toLocaleString());
	const low = min <= -Number.MAX_VALUE ? '∞' : format(min);
	const high = isMaxOpen ? '∞' : format(max);

	return { isNumeric: true, label: meta?.label ?? ruleId, ruleId, value: `${low} — ${high}` };
}

/**
 * Format a set of selected values for a chip: a single value as-is, 2+ condensed to
 * `"First (+N more)"` so the chip stays compact.
 *
 * @param set - The selected values.
 * @returns The chip text, or `''` for an empty set.
 */
function formatSetValue(set: readonly unknown[]): string {
	/* v8 ignore next 3 -- unreachable via the only caller: `summarizeRule` returns null for an empty
	   set before it ever formats one, so this arm exists purely so the helper is safe if it is reused
	   from a caller without that guard. Kept rather than deleted because returning `''` here is a
	   correct answer, and removing it would make a second caller crash on `set[0]`. Mirrors
	   the identical arm in `books-domain/ruleSummaries.ts`. */
	if (set.length === 0) {
		return '';
	}
	const first = humanizeVocabularyValue(String(set[0]));

	if (set.length === 1) {
		return first;
	}

	return `${first} (+${set.length - 1} more)`;
}
