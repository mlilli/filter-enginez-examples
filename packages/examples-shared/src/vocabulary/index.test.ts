/**
 * Tests for the dataset-neutral corpus vocabulary helper.
 *
 * @remarks
 * The ordering case below deliberately uses values where the accent decides the order, so it fails
 * under a default lexicographic sort rather than passing under either behavior.
 *
 * `uniqueSorted` produces the chip vocabulary every facet renders from, so its filtering rule is
 * user-visible in a quiet way: a nullish or empty-string value that slipped through would render a
 * blank, unlabelled chip the user can press but cannot interpret — and pressing it filters on `''`,
 * which matches nothing and looks like a broken corpus.
 *
 * The sort is `localeCompare` rather than the default lexicographic sort, which matters for the wine
 * vocabularies specifically: default sort orders every accented varietal after every unaccented one,
 * so "Gewürztraminer" lands past "Zinfandel" at the bottom of the list.
 *
 * Over the real corpora, books' three vocabularies sort identically under either rule, and real
 * estate's `schoolDistrict` is the only one that differs — locale sort puts `SFUSD` after
 * `Seattle Public` rather than before `San Mateo Union`, which is where a reader looks.
 */

import { describe, expect, it } from 'vitest';

import { uniqueSorted } from './index.js';

describe('uniqueSorted', () => {
	it('sorts and de-duplicates', () => {
		expect(uniqueSorted(['mystery', 'fantasy', 'mystery'])).toEqual(['fantasy', 'mystery']);
	});

	it('returns an empty list for an empty corpus', () => {
		expect(uniqueSorted([])).toEqual([]);
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['a number', 42],
		['an object', { name: 'fantasy' }],
		['an empty string', ''],
	])('drops %s', (_label, value) => {
		// Each of these would otherwise become a chip. The empty string is the worst of them: it renders
		// an invisible, pressable chip that filters the results to nothing.
		expect(uniqueSorted(['fantasy', value])).toEqual(['fantasy']);
	});

	it('keeps a whitespace-only string, which is a real value', () => {
		// Deliberately NOT trimmed — the guard is on length, not content. A corpus with a space-padded
		// genre has a data problem worth seeing rather than one worth silently hiding.
		expect(uniqueSorted([' '])).toEqual([' ']);
	});

	it('orders accented values by locale, not by code point', () => {
		// `localeCompare`, not the default sort. The accent has to be the DECIDING character for the two
		// orderings to differ at all — a pair like 'Gewurztraminer' / 'Grenache' sorts identically either
		// way, because position 1 decides it before any accent is reached. Here the accent leads: by code
		// point 'Ü' is 220, so a default sort files it after 'Z' at the very bottom of the varietal
		// list; by locale it sorts as 'U', where a reader would look for it. Bare letters here rather
		// than real varietal names, so the assertion is about collation and nothing else.
		expect(uniqueSorted(['A', 'Z', 'Ü'])).toEqual(['A', 'Ü', 'Z']);
	});
});
