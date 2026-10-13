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

import { describe, expect, it } from 'vitest';

import { toggleSetValue } from './index.js';

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
		// The case every caller pairs with `commitSelection`, which must then REMOVE the rule: an empty
		// `InSetRule` is not neutral, it matches nothing.
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
