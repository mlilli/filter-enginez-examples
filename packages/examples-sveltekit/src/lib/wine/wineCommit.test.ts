/**
 * Tests for the wine commit helpers.
 *
 * @remarks
 * Two behaviors here are worth pinning because both fail as something other than themselves.
 *
 * **An empty `InSetRule` is not the same as no rule.** It matches every item, so the results look
 * cleared, but it stays registered: it rides in the `?f=` link, logs as a change rather than a
 * removal, and leaves the engine holding a rule no chip on screen shows. `commitSelection` removes the
 * rule instead, so "deselect the last chip" leaves the engine's rules equal to what the panel shows,
 * and that distinction is the reason these helpers exist rather than each section calling `addRule`
 * directly.
 *
 * **The busy version must bump BEFORE the engine write.** On the worker tier the write is a round
 * trip; bumping after (or not at all) leaves the "computing" indicator dark for its whole duration,
 * so the UI looks frozen and the click looks ignored. Order is asserted directly, since both orders
 * end in the same final state and no assertion about the result could tell them apart.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { and, createFilterEngine, inSet } from '@filter-enginez/core';
import { buildWineBundleQuery } from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { describe, expect, it, vi } from 'vitest';

import { captureCurrentVersion } from './wineBusy.js';
import { clearAllFacetRules, clearAllWineFilters, clearRule, commitExpression, commitRule, commitSelection, WINE_FACET_RULE_IDS } from './wineCommit.js';

/** A stand-in baseline; the query only echoes these back, so the values are immaterial. */
const BOUND = { max: 100, min: 0 };

const ROWS = [
	{ color: 'red', id: 'a', varietal: 'Merlot' },
	{ color: 'white', id: 'b', varietal: 'Riesling' },
	{ color: 'red', id: 'c', varietal: 'Merlot' },
];

/** A signals engine over the mini corpus. */
function makeEngine(): SignalsEngine<Wine> {
	return createSignalsEngine(createFilterEngine({ sourceData: [...ROWS]})) as unknown as SignalsEngine<Wine>;
}

describe('commitSelection', () => {
	it('applies a rule for a non-empty selection', () => {
		const engine = makeEngine();

		commitSelection(engine, 'color', ['red'], (values) => inSet<string>('color', values));

		expect(engine.core.getResults()).toHaveLength(2);
	});

	it('REMOVES the rule for an empty selection rather than applying an empty one', () => {
		// The case that matters. An empty InSetRule matches every item, but committing one would leave a
		// rule registered that no chip shows: in the `?f=` link, and in the action log as a change.
		const engine = makeEngine();

		commitSelection(engine, 'color', ['red'], (values) => inSet<string>('color', values));
		commitSelection(engine, 'color', [], (values) => inSet<string>('color', values));

		expect(engine.core.getResults()).toHaveLength(ROWS.length);
	});

	it('leaves other facets alone when one clears', () => {
		const engine = makeEngine();

		commitSelection(engine, 'color', ['red'], (values) => inSet<string>('color', values));
		commitSelection(engine, 'varietal', ['Merlot'], (values) => inSet<string>('varietal', values));
		commitSelection(engine, 'varietal', [], (values) => inSet<string>('varietal', values));

		expect(engine.core.getResults()).toHaveLength(2);
	});

	it('does not call the builder at all for an empty selection', () => {
		// A builder invoked with an empty array would construct a rule that is then discarded — cheap
		// here, but the pattern invites someone to add side effects to a builder that must stay pure.
		const engine = makeEngine();
		const build = vi.fn((values: readonly string[]) => inSet<string>('color', values));

		commitSelection(engine, 'color', [], build);

		expect(build).not.toHaveBeenCalled();
	});
});

describe('busy-version ordering', () => {
	it('bumps the user-action version BEFORE writing to the engine', () => {
		// Both orders end in the same engine state, so only the sequence distinguishes them. Bumping
		// after the write leaves the indicator dark for a whole worker round trip — the UI reads as
		// frozen and the click as ignored.
		const engine = makeEngine();
		const before = captureCurrentVersion();
		let versionAtWrite = -1;

		vi.spyOn(engine.core, 'addRule').mockImplementation((): void => {
			versionAtWrite = captureCurrentVersion();
		});

		commitRule(engine, 'color', inSet<string>('color', ['red']));

		expect(versionAtWrite).toBeGreaterThan(before);
	});

	it('bumps the version for an expression switch', () => {
		// The most expensive operation on the route — it drops every flat rule and installs a composite
		// tree — and a panel calling `setExpression` directly instead of going through here would leave
		// the indicator dark for a whole worker round trip.
		const engine = makeEngine();
		const before = captureCurrentVersion();

		commitExpression(engine, null);

		expect(captureCurrentVersion()).toBeGreaterThan(before);
	});

	it('bumps the version once for a bulk facet clear', () => {
		const engine = makeEngine();
		const before = captureCurrentVersion();

		clearAllFacetRules(engine);

		expect(captureCurrentVersion()).toBeGreaterThan(before);
	});

	it('bumps the version on a clear too', () => {
		// Removing a filter is as much work for the engine as adding one — on 150k rows it recomputes
		// either way, so the indicator has to light for both.
		const engine = makeEngine();
		const before = captureCurrentVersion();

		clearRule(engine, 'color');

		expect(captureCurrentVersion()).toBeGreaterThan(before);
	});
});

describe('clearAllWineFilters', () => {
	it('drops the flat facets AND leaves expression mode, in one call', () => {
		// Both halves, because either alone leaves the panel lying about itself. Facets without the
		// expression shows blank controls over preset-narrowed results; the expression without the facets
		// leaves a manual rule to return the moment the preset goes. One `clearRules` does both.
		const engine = makeEngine();

		commitSelection(engine, 'color', ['red'], (values) => inSet<string>('color', values));
		commitExpression(engine, and(inSet<string>('color', ['white'])));

		clearAllWineFilters(engine);

		expect(engine.core.getExpression()).toBeNull();
		expect(engine.core.getResults()).toHaveLength(ROWS.length);
	});

	it('is safe on an already-neutral engine', () => {
		// The header's "Clear all" is always clickable, so this runs against a panel with nothing set
		// every time a user pokes it. Clearing an empty engine must not throw.
		const engine = makeEngine();

		expect(() => {
			clearAllWineFilters(engine);
		}).not.toThrow();
		expect(engine.core.getResults()).toHaveLength(ROWS.length);
	});
});

describe('WINE_FACET_RULE_IDS', () => {
	it('clears every facet rule the panel can set', () => {
		// A literal list at the call site drifts the moment a facet is added: the new rule would survive
		// a preset switch, dormant behind the expression and back in force once the preset is cleared.
		const engine = makeEngine();

		commitSelection(engine, 'color', ['red'], (values) => inSet<string>('color', values));
		commitSelection(engine, 'varietal', ['Merlot'], (values) => inSet<string>('varietal', values));
		clearAllFacetRules(engine);

		expect(engine.core.getResults()).toHaveLength(ROWS.length);
	});

	it('has no duplicates', () => {
		expect(new Set(WINE_FACET_RULE_IDS).size).toBe(WINE_FACET_RULE_IDS.length);
	});

	it('covers every rule id the bundle query names', () => {
		// The structural check, and the one that survives drift. Listing two facets and clearing them
		// proves nothing about the other nine — dropping `vintage` from the list would leave the earlier
		// test green. `buildWineBundleQuery` independently enumerates the facets that have
		// predictive-disable data, so any id it mentions is by definition a facet the panel can set.
		const query = buildWineBundleQuery(
			{ abv: BOUND, points: BOUND, price: BOUND, vintage: BOUND },
			{ body: [], color: [], sweetness: [], varietal: []},
			[],
		);
		const queried = [
			...query.chipGroups.map((group) => group.ruleId),
			...query.fields.map((field) => field.ruleId),
		];

		expect(queried.filter((ruleId) => !WINE_FACET_RULE_IDS.includes(ruleId))).toEqual([]);
	});

	it('also covers the facets the bundle CANNOT describe', () => {
		// `notes` (fuzzy) and `points-compare` (numeric comparison) have no chip-group or field
		// candidate kind, so the query above cannot vouch for them. They are the two ids most likely to
		// be forgotten precisely because nothing else references them.
		//
		// `points-compare` is the six-operator `NumericComparisonRule`. Note that the root vitest config
		// excludes `examples-sveltekit` (its component tests need the Svelte plugin), so this suite only
		// executes via the per-package script: a green `pnpm test:coverage` does NOT cover this package.
		expect(WINE_FACET_RULE_IDS).toContain('notes');
		expect(WINE_FACET_RULE_IDS).toContain('points-compare');
	});
});
