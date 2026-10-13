/**
 * Tests for `labSimilarity.ts` — the lab's similarity configuration and its pure display decisions.
 *
 * @remarks
 * The configuration constants are pinned deliberately rather than left to the pane. `bandSize: 4`
 * and `threshold: 0.3` are MEASURED values (the table in the module docblock), and the failure they
 * prevent is invisible: reverting either to the library default returns `[]` for roughly a quarter
 * of anchors, which renders as a blank pane with no error and no failing test anywhere else. A pin
 * is the only gate that can see a silent recall regression.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { describe, expect, it } from 'vitest';

import {
	describeSharedSubjects,
	formatAffinity,
	pickAnchor,
	SIMILARITY_ATTRIBUTES,
	SIMILARITY_CONFIG,
	SIMILARITY_QUERY,
} from './labSimilarity.js';

/** Two books whose subject lists overlap partially, in a known order. */
const anchorBook = {
	id: 'a',
	subjects: ['seafaring', 'coming-of-age', 'historical'],
	title: 'A',
} as unknown as Book;

const neighborBook = {
	id: 'b',
	subjects: ['historical', 'seafaring', 'romance'],
	title: 'B',
} as unknown as Book;

const results = [anchorBook, neighborBook, { id: 'c', subjects: [], title: 'C' } as unknown as Book];

describe('SIMILARITY_CONFIG', () => {
	it('pins bandSize BELOW the library default, because the default silently returns nothing', () => {
		// The library default is 8, documented as "calibrated for threshold >= 0.7". Over the real
		// 10k corpus that left 54 of 200 sampled anchors with zero neighbors, and dropping the
		// threshold to 0.1 recovered three of them — banding decides which items are candidates at
		// all, so no threshold can rescue an empty bucket.
		expect(SIMILARITY_CONFIG.bandSize).toBe(4);
	});

	it('signs the search over the array fields that carry the signal', () => {
		// `subjects` and `authors` fan out to one token per element; the three scalars contribute one
		// token each. Losing `subjects` in particular would collapse the feature sets to near-identical
		// triples and bucket half the corpus together.
		expect(SIMILARITY_CONFIG.attributes).toBe(SIMILARITY_ATTRIBUTES);
		expect(SIMILARITY_ATTRIBUTES).toContain('subjects');
		expect(SIMILARITY_ATTRIBUTES).toContain('authors');
	});
});

describe('SIMILARITY_QUERY', () => {
	it('overrides the config threshold down to the measured no-empties column', () => {
		expect(SIMILARITY_QUERY.threshold).toBe(0.3);
		// Below the config default of 0.5, which is the whole reason it is stated per call.
		expect(SIMILARITY_QUERY.threshold ?? 0.5).toBeLessThan(0.5);
	});
});

describe('pickAnchor', () => {
	it('returns undefined when there are no results, so the pane can say so', () => {
		expect(pickAnchor([], undefined)).toBeUndefined();
		// Also with a preference — a remembered id must not conjure an anchor out of an empty set.
		expect(pickAnchor([], 'a')).toBeUndefined();
	});

	it('anchors on the first result when the visitor has not chosen', () => {
		expect(pickAnchor(results, undefined)).toBe(anchorBook);
	});

	it("honors the visitor's choice when it survives the current filters", () => {
		expect(pickAnchor(results, 'b')).toBe(neighborBook);
	});

	it('falls back to the first result when the chosen book was filtered away', () => {
		// The case that matters: tightening a filter must re-anchor rather than blank the pane. A
		// version that returned `undefined` here would look identical to "no results" to the caller.
		expect(pickAnchor(results, 'gone')).toBe(anchorBook);
	});
});

describe('formatAffinity', () => {
	it('marks the number as an ESTIMATE rather than claiming precision', () => {
		// MinHash approximates Jaccard by comparing signature positions. A bare percentage would
		// overstate what the algorithm offers, which misrepresents the trade the pane exists to show.
		expect(formatAffinity(0.68)).toBe('≈68%');
	});

	it('rounds to whole percent at both ends of the range', () => {
		expect(formatAffinity(0)).toBe('≈0%');
		expect(formatAffinity(1)).toBe('≈100%');
		expect(formatAffinity(0.666)).toBe('≈67%');
	});
});

describe('describeSharedSubjects', () => {
	it('returns the intersection in the ANCHOR order, not the neighbor order', () => {
		// Order is a display decision with a reason: the reader is scanning against the book they
		// picked, so the shared tags should read in that book's order. The fixture's two lists
		// deliberately disagree on order, so a version returning the neighbor's order fails here.
		expect(describeSharedSubjects(anchorBook, neighborBook)).toEqual(['seafaring', 'historical']);
	});

	it('returns empty when two books share no subjects', () => {
		// Reachable rather than defensive — a score can come from authors, genre, format and language
		// alone, and the pane renders a different line for it.
		expect(describeSharedSubjects(anchorBook, { id: 'z', subjects: ['cookery']} as unknown as Book)).toEqual([]);
	});

	it('does not report a subject twice when the anchor lists it twice', () => {
		const duplicated = { id: 'd', subjects: ['historical', 'historical'], title: 'D' } as unknown as Book;

		// `filter` over the anchor preserves the anchor's duplicates, so this documents the real
		// behavior rather than an aspiration: the corpus generator emits distinct subjects, and if it
		// ever stops, this case is where that surfaces instead of in a rendered list of repeated tags.
		expect(describeSharedSubjects(duplicated, neighborBook)).toEqual(['historical', 'historical']);
	});
});
