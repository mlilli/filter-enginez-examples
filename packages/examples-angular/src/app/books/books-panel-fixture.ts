/**
 * The ten hand-written books the books panel's specs boot over.
 *
 * @remarks
 * A test fixture, imported only by `*.spec.ts` files: the app's own code never reaches it, so it is in
 * no app bundle. Every facet value is hand-chosen so the panel's assertions are exact; see
 * {@link FIXTURE_ROWS}.
 *
 * @packageDocumentation
 */

import type { Book, BookFormat, BookGenre } from '@filter-enginez/mock-data/books';

/**
 * Build one fixture book, defaulting every field the panel doesn't read.
 *
 * @param overrides - The fields this test actually cares about.
 * @returns A structurally complete `Book`.
 */
export function makeBook(overrides: Partial<Book> & Pick<Book, 'id'>): Book {
	return {
		authors: ['Ursula Vernon'],
		averageRating: 4,
		coverImage: 'cover.jpg',
		description: 'a quiet book about nothing much',
		format: 'paperback',
		genre: 'fantasy',
		hasAudiobook: false,
		isbn13: '9780000000000',
		isInPrint: true,
		language: 'en',
		lastUpdated: '2026-01-01T00:00:00.000Z',
		openLibraryId: `OL${overrides.id}`,
		pageCount: 300,
		popularityScore: 10,
		publicationYear: 2000,
		publisher: 'Fixture Press',
		subjects: [],
		subtitle: '',
		tier: 'default',
		title: `Title ${overrides.id}`,
		...overrides,
	};
}

/** `[genre, format, language, publicationYear, averageRating, pageCount, isInPrint, hasAudiobook]`. */
type FixtureRow = readonly [BookGenre, BookFormat, string, number, number | null, number, boolean, boolean];

/**
 * Ten books with hand-chosen facets, one row each.
 *
 * Genres resolve to `fantasy | mystery | science`, formats to `ebook | hardcover | paperback`,
 * languages to `en | fr`. Ratings span 2.9–4.9 with two nulls (so `ExistsRule` has something to do)
 * and four at or above 4.5 (so the Editor's-picks Bloom set is non-empty). Years span 1990–2020 and
 * page counts 100–900, which makes the three slider baselines exactly predictable. Each row's index
 * becomes the fifth ISBN digit, so `^97801` matches exactly one book.
 */
const FIXTURE_ROWS: readonly FixtureRow[] = [
	['fantasy', 'hardcover', 'en', 1990, 4.8, 100, true, true],
	['fantasy', 'paperback', 'en', 2000, 3.5, 200, true, false],
	['mystery', 'ebook', 'en', 2005, null, 300, false, true],
	['mystery', 'hardcover', 'fr', 2010, 4.9, 400, true, true],
	['science', 'paperback', 'fr', 2015, 4, 500, true, false],
	['science', 'ebook', 'en', 2020, 3.2, 600, false, true],
	['fantasy', 'ebook', 'fr', 1995, 4.6, 700, true, true],
	['mystery', 'paperback', 'en', 2018, 2.9, 800, true, false],
	['science', 'hardcover', 'en', 2012, null, 900, false, true],
	['fantasy', 'hardcover', 'fr', 2008, 4.7, 250, true, true],
];

/** The two rows that carry distinguishable free text, keyed by row index. */
const FIXTURE_TEXT: Readonly<Record<number, Partial<Book>>> = {
	0: { description: 'a dystopian tale of a drowned city' },
	1: { authors: ['Margaret Atwood']},
};

/** The corpus the panel boots over. */
export const FIXTURE_BOOKS: readonly Book[] = FIXTURE_ROWS.map(
	(
		[genre, format, language, publicationYear, averageRating, pageCount, isInPrint, hasAudiobook],
		index,
	) =>
		makeBook({
			averageRating,
			format,
			genre,
			hasAudiobook,
			id: `b${index}`,
			isbn13: `9780${index}00000000`,
			isInPrint,
			language,
			pageCount,
			publicationYear,
			...FIXTURE_TEXT[index],
		}),
);
