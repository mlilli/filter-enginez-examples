/**
 * Tests for the shared search timing every app's search fields bind.
 *
 * @remarks
 * Fake timers throughout: the debounce is the contract, and asserting it against the clock is what
 * makes "commits once the typing pauses" and "never twice" checkable at all.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTypeaheadController, TYPEAHEAD_DEBOUNCE_MS } from './typeaheadController.js';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('typing', () => {
	it('commits once the typing pauses, with the last text', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.input('mer');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS - 1);
		controller.input('merlot');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS - 1);
		expect(commit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(commit.mock.calls).toEqual([['merlot']]);
	});

	it('trims what it commits', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.input('  oak ');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).toHaveBeenCalledWith('oak');
	});

	it('honors a custom debounce', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, debounceMs: 10, initialQuery: '' });

		controller.input('oak');
		vi.advanceTimersByTime(10);

		expect(commit).toHaveBeenCalledWith('oak');
	});
});

describe('flushing', () => {
	it('commits at once and cancels the pending debounce', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.input('oak');
		controller.flush('oak');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS * 2);

		expect(commit.mock.calls).toEqual([['oak']]);
	});

	it('commits nothing for an untouched empty field', () => {
		// Tabbing through an empty field must write nothing: a removal of an absent rule marks the engine
		// busy, and the engine emits no change to clear it.
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.flush('');
		controller.flush('   ');

		expect(commit).not.toHaveBeenCalled();
	});

	it('commits once for Enter followed by the blur it causes', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.flush('oak');
		controller.flush('oak');

		expect(commit).toHaveBeenCalledTimes(1);
	});

	it('commits an empty query when a committed one is cleared', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: 'oak' });

		controller.flush('');

		expect(commit).toHaveBeenCalledWith('');
	});
});

describe('adopting the engine\'s query', () => {
	it('reports an external change, and treats it as committed', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: 'oak' });

		expect(controller.adopt('')).toBe(true);
		controller.flush('');

		expect(commit).not.toHaveBeenCalled();
	});

	it('does not report the query it was created with as a change', () => {
		// The binding adopts the rule's query on mount; that must not overwrite what the field shows.
		const controller = createTypeaheadController({ commit: vi.fn(), initialQuery: 'oak' });

		expect(controller.adopt('oak')).toBe(false);
	});

	it('skips the echo of its own commit', () => {
		const controller = createTypeaheadController({ commit: vi.fn(), initialQuery: '' });

		controller.flush('oak');

		expect(controller.adopt('oak')).toBe(false);
	});

	it('skips a late echo of an older commit that lands after a newer one went out', () => {
		// The worker tier answers a round trip later: `oa` was committed, then `oak`, and only now does
		// the engine report `oa`. Showing it would flash the older text over what the user typed.
		const controller = createTypeaheadController({ commit: vi.fn(), initialQuery: '' });

		controller.flush('oa');
		controller.flush('oak');

		expect(controller.adopt('oa')).toBe(false);
		expect(controller.adopt('oak')).toBe(false);
	});

	it('adopts an external change after a late echo, and forgets the confirmed commits', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.flush('oa');
		controller.flush('oak');
		expect(controller.adopt('oak')).toBe(false);

		// `oa` was confirmed by the newer echo, so its value arriving now is an external change.
		expect(controller.adopt('oa')).toBe(true);
		expect(controller.adopt('')).toBe(true);
		controller.flush('');
		expect(commit).toHaveBeenCalledTimes(2);
	});

	it('drops a pending keystroke when an external change lands', () => {
		// Clear all while a word is mid-debounce: the stale word must not commit after the clear.
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: 'oak' });

		controller.input('oak-aged');
		controller.adopt('');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).not.toHaveBeenCalled();
	});
});

describe('dispose', () => {
	it('cancels a pending commit', () => {
		const commit = vi.fn();
		const controller = createTypeaheadController({ commit, initialQuery: '' });

		controller.input('oak');
		controller.dispose();
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).not.toHaveBeenCalled();
	});

	it('is safe with nothing pending', () => {
		expect(() => {
			createTypeaheadController({ commit: vi.fn(), initialQuery: '' }).dispose();
		}).not.toThrow();
	});
});
