/**
 * Unit tests for the curated-filter helpers (genre super-groups + Editor's-picks Bloom set). These are
 * the framework-neutral logic every books panel (React / Vue / Svelte / vanilla) commits through, so
 * covering them in the shared home proves the super-group ↔ chip mapping and the Bloom membership
 * behave identically across verticals without needing a component render.
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { describe, expect, it } from 'vitest';

import { buildEditorsPicksFilter, compilePattern, deriveSelectedGroupKeys, nextSuperGroupSets, regexInputValue } from './curated.js';

/** A minimal Book carrying only the fields these helpers read. */
function makeBook(id: string, averageRating: number | null): Book {
	return { averageRating, id } as unknown as Book;
}

describe('super-group toggle logic', () => {
	it('adds a group\'s genre set when the group is not yet selected', () => {
		expect(nextSuperGroupSets([], 'Mystery & thriller')).toEqual([['mystery', 'thriller']]);
	});

	it('removes a group when it is already selected', () => {
		expect(nextSuperGroupSets(['Mystery & thriller'], 'Mystery & thriller')).toEqual([]);
	});

	it('accumulates multiple groups', () => {
		const afterFirst = nextSuperGroupSets([], 'Speculative');
		const afterSecond = nextSuperGroupSets(['Speculative'], 'Mystery & thriller');

		expect(afterFirst).toEqual([['fantasy', 'science-fiction']]);
		expect(afterSecond).toHaveLength(2);
	});

	it('derives the selected labels back from a committed array-of-sets', () => {
		const committed = nextSuperGroupSets(['Speculative'], 'Mystery & thriller');

		expect(deriveSelectedGroupKeys(committed)).toEqual(['Mystery & thriller', 'Speculative']);
	});

	it('derives an empty selection from an empty rule (clear-all in sync)', () => {
		expect(deriveSelectedGroupKeys([])).toEqual([]);
	});
});

describe('Editor\'s-picks Bloom filter', () => {
	it('definitely contains ids at or above the rating threshold (no false negatives)', () => {
		const filter = buildEditorsPicksFilter([
			makeBook('top', 4.8),
			makeBook('mid', 3.2),
			makeBook('unrated', null),
		]);

		// A Bloom filter has no false negatives — an added id always reports present.
		expect(filter.test('top')).toBe(true);
	});

	it('builds a valid filter even when no book qualifies (capacity floored at 1)', () => {
		const filter = buildEditorsPicksFilter([makeBook('lo', 2)]);

		// Nothing was added, so a never-added id is reported absent (a true negative is guaranteed).
		expect(filter.test('never-added-id')).toBe(false);
	});
});

describe('regexInputValue', () => {
	it('shows a real pattern source as-is', () => {
		expect(regexInputValue('^978')).toBe('^978');
	});

	it('shows an empty input when no rule is active', () => {
		expect(regexInputValue(undefined)).toBe('');
	});

	it('shows an empty input for the empty-pattern sentinel', () => {
		// `new RegExp('')` round-trips through serialization with a `.source` of `'(?:)'`. Echoing that
		// back into the field would show the user a pattern they never typed, and re-committing it would
		// look like a filter they cannot clear by emptying the box.
		expect(regexInputValue('(?:)')).toBe('');
	});
});

describe('compilePattern', () => {
	it('compiles a valid source', () => {
		expect(compilePattern('^978')?.test('9781234')).toBe(true);
	});

	it('compiles an empty source rather than rejecting it', () => {
		// Empty is VALID, not malformed — clearing the input is how a user removes the filter, and
		// returning null here would be indistinguishable from a typo.
		expect(compilePattern('')).toBeInstanceOf(RegExp);
	});

	it('returns null for a malformed source instead of throwing', () => {
		// The panel compiles on every keystroke, so half-typed patterns are the NORMAL input, not an
		// error case. Throwing would unmount the route mid-word.
		expect(compilePattern('[')).toBeNull();
		expect(compilePattern('(unclosed')).toBeNull();
	});
});
