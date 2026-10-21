/**
 * Tests for the shared flat-selection toggle.
 *
 * @remarks
 * Three of these assert properties every call site relies on without stating, which is exactly why
 * they are worth pinning in the one implementation that could get them wrong: immutability, append
 * order, and stability of the remaining members.
 *
 * @packageDocumentation
 */

import { createFilterEngine, inSet, or } from '@filter-enginez/core';
import { describe, expect, it, vi } from 'vitest';

import { clearAllFilters, toggleSetValue } from './index.js';

describe('toggleSetValue', () => {
	it('appends a value that is absent', () => {
		expect(toggleSetValue(['red'], 'white')).toEqual(['red', 'white']);
	});

	it('removes a value that is present', () => {
		expect(toggleSetValue(['red', 'white'], 'red')).toEqual(['white']);
	});

	it('adds to an empty selection', () => {
		expect(toggleSetValue([], 'red')).toEqual(['red']);
	});

	it('empties a single-member selection', () => {
		// The case every caller pairs with `commitSelection`, which then REMOVES the rule rather than
		// leaving an empty `InSetRule` registered behind a control that shows nothing selected.
		expect(toggleSetValue(['red'], 'red')).toEqual([]);
	});

	it('does not mutate the input', () => {
		// Load-bearing. Rules hold their config BY REFERENCE, so mutating a selection in place would
		// edit the rule already committed to the engine — and the next commit would then compare a value
		// against itself and silently fail to propagate.
		const current = ['red', 'white'];

		toggleSetValue(current, 'rose');
		toggleSetValue(current, 'red');

		expect(current).toEqual(['red', 'white']);
	});

	it('appends at the END rather than sorting', () => {
		// User-visible twice: the active-filter chip summaries list values in selection order, and a `?f`
		// link round-trips that order. A sort here would quietly reorder both.
		expect(toggleSetValue(['white', 'red'], 'apple')).toEqual(['white', 'red', 'apple']);
	});

	it('leaves the order of the survivors alone on removal', () => {
		expect(toggleSetValue(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
	});

	it('removes every occurrence when a value was somehow duplicated', () => {
		// Not reachable through the toggle itself, but a `?f` link or a hand-written JSON config can
		// carry a duplicated set. Leaving one behind would make the chip stay lit after a click that
		// visibly cleared it.
		expect(toggleSetValue(['a', 'b', 'a'], 'a')).toEqual(['b']);
	});
});

describe('clearAllFilters', () => {
	it('marks the action busy, then makes ONE clearRules call', () => {
		const order: string[] = [];
		const engine = { core: { clearRules: vi.fn(() => order.push('clear')) }};

		clearAllFilters(engine, () => order.push('busy'));

		expect(order).toEqual(['busy', 'clear']);
	});

	it('routes the clear through a supplied seam instead of the engine', () => {
		const engine = { core: { clearRules: vi.fn() }};
		const forward = vi.fn();

		clearAllFilters(engine, vi.fn(), forward);

		expect(forward).toHaveBeenCalledTimes(1);
		expect(engine.core.clearRules).not.toHaveBeenCalled();
	});

	it('drops every rule, including one under an id no panel lists, and the expression', () => {
		const rows = [{ genre: 'a' }, { genre: 'b' }];
		const engine = createFilterEngine({ sourceData: rows });

		engine.addRule('genre', inSet('genre', ['a']));
		engine.addRule('hand-edited', inSet('genre', ['b']));
		engine.setExpression(or(inSet('genre', ['a'])));

		clearAllFilters({ core: engine }, vi.fn());

		expect(engine.getRules().size).toBe(0);
		expect(engine.getExpression()).toBeNull();
		expect(engine.getResultCount()).toBe(rows.length);
	});
});
