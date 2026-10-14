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

import { orderTreeByFrequency, rankByFrequency, shortlistVocabulary, uniqueSorted } from './index.js';

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

describe('rankByFrequency', () => {
	it('puts the most frequent values first, ties alphabetical', () => {
		expect(rankByFrequency(['Merlot', 'Pinot Noir', 'Merlot', 'Abouriou', 'Pinot Noir', 'Merlot', 'Gamay'])).toEqual([
			'Merlot',
			'Pinot Noir',
			'Abouriou',
			'Gamay',
		]);
	});

	it('drops empty and non-string values', () => {
		expect(rankByFrequency(['', 'a', 3, null, 'a'])).toEqual(['a']);
	});
});

describe('shortlistVocabulary', () => {
	const ranked = ['a', 'b', 'c', 'd', 'e'];

	it('keeps the leading values', () => {
		expect(shortlistVocabulary(ranked, [], 2)).toEqual(['a', 'b']);
	});

	it('keeps a selected value from beyond the limit, in rank order', () => {
		// A rare value selected through a shared link must still have a chip to clear it from.
		expect(shortlistVocabulary(ranked, ['e', 'a'], 2)).toEqual(['a', 'b', 'e']);
	});

	it('returns a short vocabulary whole', () => {
		expect(shortlistVocabulary(ranked, [], 9)).toBe(ranked);
	});
});

describe('orderTreeByFrequency', () => {
	const tree = {
		children: [
			{ id: 'Argentina', label: 'Argentina' },
			{
				children: [
					{ id: 'US|Oregon', label: 'Oregon' },
					{ id: 'US|California', label: 'California' },
				],
				id: 'US',
				label: 'US',
			},
			{ id: 'Austria', label: 'Austria' },
		],
		id: 'origin',
	};

	it('orders every level by the records at or beneath each node', () => {
		const ordered = orderTreeByFrequency(tree, ['US|California', 'US|California', 'US|Oregon', 'US', 'Austria', 'Argentina', 'Austria']);

		expect(ordered.children.map((node) => node.id)).toEqual(['US', 'Austria', 'Argentina']);
		expect(ordered.children[0]?.children?.map((node) => node.id)).toEqual(['US|California', 'US|Oregon']);
	});

	it('breaks ties by label and leaves the input untouched', () => {
		const ordered = orderTreeByFrequency(tree, []);

		expect(ordered.children.map((node) => node.id)).toEqual(['Argentina', 'Austria', 'US']);
		expect(tree.children.map((node) => node.id)).toEqual(['Argentina', 'US', 'Austria']);
	});

	it('breaks ties by id when a node has no label', () => {
		// Unlabeled siblings, listed against id order and with no records to tell them apart: only the
		// id can order them, so this fails if a missing label sorts as anything but the id.
		const unlabeledTree = { children: [{ id: 'Spain' }, { id: 'Chile' }, { id: 'Italy' }], id: 'origin' };

		expect(orderTreeByFrequency(unlabeledTree, []).children.map((node) => node.id)).toEqual(['Chile', 'Italy', 'Spain']);
	});
});
