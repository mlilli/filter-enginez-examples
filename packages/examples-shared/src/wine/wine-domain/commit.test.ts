/**
 * Tests for wine's commit helpers, and for `buildSmartFilterExpression`'s selection arithmetic.
 *
 * @remarks
 * ## Why this file exists at all
 *
 * These helpers live in `wine-domain` so the verticals can share them, and their callers are panels in
 * `examples-vue`, `examples-sveltekit` and `examples-angular` — none of whose vitest projects feed the
 * root coverage report. Code moved toward reuse loses its incidental coverage that way without a
 * single test being deleted.
 *
 * So they are tested directly, where they live.
 *
 * ## The fake is a spy bag, and that is the right shape here
 *
 * Every one of these functions is pure orchestration: it decides WHICH engine calls to make and in
 * what order, and makes no decision that depends on a result. A real engine would add a corpus, an
 * acceleration stack and a settle to assert around, and would not make a single assertion sharper.
 * `WineEngineHost` is structural precisely so this is legal.
 *
 * @packageDocumentation
 */

import { type CompositeRule, createFilterEngine, type FilterEngineConfig, type FilterRule, inSet, range, type RuleId } from '@filter-enginez/core';
import { wines } from '@filter-enginez/mock-data/wine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLinkSerializer } from '../../url/linkSerializer.js';
import { captureCurrentVersion, getIsEngineBusy, markResolvedAtLeast } from '../engineBusyCore.js';
import { buildSmartFilterExpression, deriveSelectedPresetIds, WINE_SMART_FILTERS } from '../smartFilters.js';
import {
	clearAllFacetRules,
	clearAllWineFilters,
	clearRule,
	commitExpression,
	commitRule,
	commitSelection,
	commitSmartFilterSelection,
	exitExpressionMode,
	removeFacet,
	removeWineFilterChip,
	WINE_FACET_RULE_IDS,
	type WineEngineHost,
} from './commit.js';
import { SMART_FILTER_CHIP_ID } from './ruleSummaries.js';

const addRule = vi.fn();
const clearRules = vi.fn();
const removeRule = vi.fn();
const setExpression = vi.fn();

/**
 * A structural stand-in for the engine facade.
 *
 * @returns The fake host.
 */
function fakeHost(): WineEngineHost {
	return { core: { addRule, clearRules, removeRule, setExpression }} as unknown as WineEngineHost;
}

beforeEach(() => {
	addRule.mockClear();
	clearRules.mockClear();
	removeRule.mockClear();
	setExpression.mockClear();
});

describe('commitRule / clearRule / removeFacet', () => {
	it('writes the rule under its id', () => {
		const rule = range('priceUsd', { max: 50, min: 10 });

		commitRule(fakeHost(), 'price', rule);

		expect(addRule).toHaveBeenCalledWith('price', rule);
	});

	it('clearRule REMOVES rather than writing a neutral rule', () => {
		// An empty or "neutral" rule would match the same items, but it would stay registered: in the
		// `?f=` link, in the devtools log as a change, and in the engine with no control showing it.
		clearRule(fakeHost(), 'price');

		expect(removeRule).toHaveBeenCalledWith('price');
		expect(addRule).not.toHaveBeenCalled();
	});

	it('removeFacet is clearRule under the name the header uses for it', () => {
		removeFacet(fakeHost(), 'varietal');

		expect(removeRule).toHaveBeenCalledWith('varietal');
	});
});

describe('commitSelection', () => {
	it('builds and writes a rule when the selection is non-empty', () => {
		const build = vi.fn((values: readonly string[]) => inSet<string>('color', values));

		commitSelection(fakeHost(), 'color', ['red'], build);

		expect(build).toHaveBeenCalledWith(['red']);
		expect(addRule).toHaveBeenCalledWith('color', expect.anything());
	});

	it('REMOVES the rule when the selection empties, and never builds one', () => {
		// Deselecting the last value leaves no rule behind, so the engine, the `?f=` link and the action
		// log all say "no filter here". The builder must not even be called, or a future builder with a
		// side effect would still run.
		const build = vi.fn((values: readonly string[]) => inSet<string>('color', values));

		commitSelection(fakeHost(), 'color', [], build);

		expect(removeRule).toHaveBeenCalledWith('color');
		expect(addRule).not.toHaveBeenCalled();
		expect(build).not.toHaveBeenCalled();
	});
});

describe('clearAllFacetRules / clearAllWineFilters', () => {
	it('drops every facet rule the panel can own', () => {
		clearAllFacetRules(fakeHost());

		const cleared = removeRule.mock.calls.map(([ruleId]) => ruleId as RuleId);

		expect(new Set(cleared)).toEqual(new Set(WINE_FACET_RULE_IDS));
		expect(setExpression).not.toHaveBeenCalled();
	});

	it('clearAllWineFilters is ONE clearRules, which drops every rule and the expression together', () => {
		// One engine action: one `RULES_CLEARED` in the log, one Undo back, one `reset` event. A
		// `removeRule` per facet plus a `setExpression` would be fourteen of each, and would miss a rule
		// under an id no facet lists.
		clearAllWineFilters(fakeHost());

		expect(clearRules).toHaveBeenCalledTimes(1);
		expect(removeRule).not.toHaveBeenCalled();
		expect(setExpression).not.toHaveBeenCalled();
	});

	it('clearAllWineFilters routes the clear through a supplied seam, and marks the action busy first', () => {
		const forward = vi.fn(() => {
			expect(getIsEngineBusy()).toBe(true);
		});

		markResolvedAtLeast(captureCurrentVersion());
		clearAllWineFilters(fakeHost(), forward);

		expect(forward).toHaveBeenCalledTimes(1);
		expect(clearRules).not.toHaveBeenCalled();
	});
});

describe('commitExpression', () => {
	it('forwards an expression, and forwards null to leave expression mode', () => {
		const host = fakeHost();
		const expression = buildSmartFilterExpression([WINE_SMART_FILTERS[0]?.id ?? '']);

		commitExpression(host, expression);
		expect(setExpression).toHaveBeenCalledWith(expression);

		commitExpression(host, null);
		expect(setExpression).toHaveBeenLastCalledWith(null);
	});
});

/** A real corpus slice for the tests that need a real engine round trip. */
const ROWS = wines.slice(0, 400);

/** The `?f=` codec every app's URL layer builds. */
const SERIALIZER = createLinkSerializer('human-readable');

/**
 * The `?f=` value a vertical writes for a preset selection, decoded the way a page restoring it does.
 *
 * @param presetIds - The presets the link holds.
 * @returns The decoded config.
 */
function restoredPresetLink(presetIds: readonly string[]): FilterEngineConfig {
	const donor = createFilterEngine({ sourceData: ROWS });

	donor.setExpression(buildSmartFilterExpression(presetIds));

	return SERIALIZER.decode(SERIALIZER.encode(donor.exportConfig()));
}

/**
 * The same link as engine 0.0.3 wrote it: its inline rules carry no `inline` mark, and are named only
 * by the reserved `__inline_<n>` ids the expression references.
 *
 * @param presetIds - The presets the link holds.
 * @returns The decoded config, without the marks.
 */
function restoredLegacyPresetLink(presetIds: readonly string[]): FilterEngineConfig {
	const config = restoredPresetLink(presetIds);

	return { ...config, rules: config.rules.map(({ id, rule }) => ({ id, rule })) };
}

describe('exitExpressionMode', () => {
	it('clears the expression and touches no flat rule', () => {
		exitExpressionMode(fakeHost());

		expect(setExpression).toHaveBeenCalledWith(null);
		expect(removeRule).not.toHaveBeenCalled();
		expect(clearRules).not.toHaveBeenCalled();
	});

	it('marks the action busy', () => {
		markResolvedAtLeast(captureCurrentVersion());
		exitExpressionMode(fakeHost());

		expect(getIsEngineBusy()).toBe(true);
	});
});

describe('a preset restored from ?f, then cleared, gives back the full corpus', () => {
	// "Pinot" is an OR of two varietals: if a restore registered its two leaves as flat rules, clearing
	// the expression would leave them ANDed together, matching nothing, with no pill to explain it.
	it.each([
		['a link written today', restoredPresetLink],
		['a link written by engine 0.0.3', restoredLegacyPresetLink],
	])('%s registers no flat rule, and leaving the preset filters nothing', (_label, link) => {
		const restored = createFilterEngine({ sourceData: ROWS });

		restored.loadConfig(link(['pinot-any']));
		expect(deriveSelectedPresetIds(restored.getExpression())).toEqual(['pinot-any']);
		expect(restored.getResultCount()).toBeLessThan(ROWS.length);
		expect([...restored.getRules().keys()]).toEqual([]);

		exitExpressionMode({ core: restored });
		expect(restored.getExpression()).toBeNull();
		expect([...restored.getRules().keys()]).toEqual([]);
		expect(restored.getResultCount()).toBe(ROWS.length);
	});

	it('Clear all after the restore gives back the full corpus too', () => {
		const restored = createFilterEngine({ sourceData: ROWS });

		restored.loadConfig(restoredLegacyPresetLink(['pinot-any']));
		clearAllWineFilters({ core: restored });

		expect(restored.getExpression()).toBeNull();
		expect(restored.getRules().size).toBe(0);
		expect(restored.getResultCount()).toBe(ROWS.length);
	});
});

describe('commitSmartFilterSelection', () => {
	const [FIRST, SECOND] = WINE_SMART_FILTERS;

	it('clears every flat facet rule BEFORE it sets the expression', () => {
		commitSmartFilterSelection(fakeHost(), [FIRST?.id ?? '']);

		expect(removeRule.mock.calls.length).toBe(WINE_FACET_RULE_IDS.length);
		expect(setExpression).toHaveBeenCalledTimes(1);
		expect(deriveSelectedPresetIds(setExpression.mock.calls[0]?.[0] as CompositeRule)).toEqual([FIRST?.id]);

		const lastRemoval = Math.max(...removeRule.mock.invocationCallOrder);
		const [expressionWrite] = setExpression.mock.invocationCallOrder;

		expect(expressionWrite).toBeGreaterThan(lastRemoval);
	});

	it('writes an OR of several presets through the shared builder', () => {
		commitSmartFilterSelection(fakeHost(), [SECOND?.id ?? '', FIRST?.id ?? '']);

		// Written in table order whatever order the ids arrived in, so the `?f=` string is stable.
		expect(deriveSelectedPresetIds(setExpression.mock.calls[0]?.[0] as CompositeRule)).toEqual([FIRST?.id, SECOND?.id]);
	});

	it('an EMPTY selection only leaves expression mode and touches no flat rule', () => {
		commitSmartFilterSelection(fakeHost(), []);

		expect(removeRule).not.toHaveBeenCalled();
		expect(setExpression).toHaveBeenCalledWith(null);
	});

	it.each([
		['a preset', [FIRST?.id ?? '']],
		['an empty selection', []],
	])('marks the action busy for %s', (_label, presetIds) => {
		markResolvedAtLeast(captureCurrentVersion());
		expect(getIsEngineBusy()).toBe(false);

		commitSmartFilterSelection(fakeHost(), presetIds);

		expect(getIsEngineBusy()).toBe(true);
	});
});

describe('removeWineFilterChip', () => {
	it('removes a facet chip\'s rule and nothing else', () => {
		removeWineFilterChip(fakeHost(), 'color');

		expect(removeRule.mock.calls).toEqual([['color']]);
		expect(setExpression).not.toHaveBeenCalled();
	});

	it('the smart-filter chip clears every facet AND leaves expression mode, as Clear all does', () => {
		removeWineFilterChip(fakeHost(), SMART_FILTER_CHIP_ID);

		expect(clearRules).toHaveBeenCalledTimes(1);
		expect(removeRule).not.toHaveBeenCalled();
	});

	it('routes a facet removal through the supplied seam, and the smart-filter chip never through it', () => {
		const forward = vi.fn();

		removeWineFilterChip(fakeHost(), 'body', forward);
		expect(forward).toHaveBeenCalledWith('body');
		expect(removeRule).not.toHaveBeenCalled();

		removeWineFilterChip(fakeHost(), SMART_FILTER_CHIP_ID, forward);
		expect(forward).toHaveBeenCalledTimes(1);
		expect(clearRules).toHaveBeenCalledTimes(1);
	});

	it('routes the smart-filter chip\'s clear through the clear seam', () => {
		const forwardClear = vi.fn();

		removeWineFilterChip(fakeHost(), SMART_FILTER_CHIP_ID, undefined, forwardClear);
		expect(forwardClear).toHaveBeenCalledTimes(1);
		expect(clearRules).not.toHaveBeenCalled();
	});
});

describe('buildSmartFilterExpression', () => {
	/** Every preset id, in registry order. */
	const ids = WINE_SMART_FILTERS.map((preset) => preset.id);

	it('returns null for an empty selection, which means flat-map mode', () => {
		expect(buildSmartFilterExpression([])).toBeNull();
	});

	it('returns the preset ITSELF for a single selection, not a one-armed OR', () => {
		// This special case has to agree exactly with `deriveSelectedPresetIds`, which reads the chips
		// back off the committed expression. Wrapping a lone preset in `or(...)` would round-trip to a
		// different shape and light the wrong chips after a `?f` restore.
		const built = buildSmartFilterExpression([ids[0] ?? '']);

		expect(built).not.toBeNull();
		expect(built?.config.op).not.toBe('or');
	});

	it('unions more than one selection into an OR', () => {
		const built = buildSmartFilterExpression(ids.slice(0, 2));

		expect(built?.config.op).toBe('or');
		expect(built?.config.rules).toHaveLength(2);
	});

	it('ignores ids that name no preset', () => {
		expect(buildSmartFilterExpression(['__nope__'])).toBeNull();
	});
});

describe('WINE_FACET_RULE_IDS', () => {
	it('has no duplicates — a repeated id would make clear-all double-remove one facet', () => {
		expect(new Set(WINE_FACET_RULE_IDS).size).toBe(WINE_FACET_RULE_IDS.length);
	});

	it('is what a caller can hand straight to a rule map', () => {
		const rules = new Map<RuleId, FilterRule>();

		for (const ruleId of WINE_FACET_RULE_IDS) {
			rules.set(ruleId, inSet<string>(ruleId, []));
		}

		expect(rules.size).toBe(WINE_FACET_RULE_IDS.length);
	});
});
