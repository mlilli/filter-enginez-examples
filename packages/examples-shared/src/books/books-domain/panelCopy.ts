/**
 * `books-domain/panelCopy` — what every app's books panel says, in one place.
 *
 * @remarks
 * Read by all six books panels, so each section heading, checkbox label, slider name, search
 * placeholder and the ISBN pattern's error read the same in every app.
 * `tests/tooling/booksPanelCopyParity.test.ts` keeps the literals from coming back.
 *
 * @packageDocumentation
 */

/** The three range sliders: each one's visible label and the accessible name of its track. */
export const BOOKS_SLIDER_COPY = {
	pageCount: { ariaLabel: 'Page-count range', label: 'Page count' },
	publicationYear: { ariaLabel: 'Publication-year range', label: 'Publication year' },
	rating: { ariaLabel: 'Average-rating range', label: 'Rating' },
} as const;

/** The four checkboxes' labels. */
export const BOOKS_TOGGLE_LABELS = {
	audiobook: 'Has audiobook',
	editorsPicks: 'Editor\'s picks (top-rated)',
	inPrint: 'In print only',
	rated: 'Rated only',
} as const;

/** The chip groups' section headings. */
export const BOOKS_CHIP_SECTION_LABELS = {
	format: 'Format',
	genre: 'Genre',
	genreGroups: 'Genre super-groups',
	language: 'Language',
} as const;

/** The three search fields: section heading, placeholder and accessible name. */
export const BOOKS_SEARCH_COPY = {
	author: { ariaLabel: 'Search authors with typo tolerance', label: 'Author (typo-tolerant)', placeholder: 'a surname or full name...' },
	description: { ariaLabel: 'Search descriptions', label: 'Description search', placeholder: 'dystopia, seafaring, coming of age...' },
	isbn: { ariaLabel: 'Filter by ISBN-13 pattern (regular expression)', label: 'ISBN pattern (regex)', placeholder: 'e.g. ^9780' },
} as const;

/** What the ISBN field says, in a `role="alert"`, while its pattern does not compile. */
export const BOOKS_ISBN_INVALID_MESSAGE = 'Invalid regular expression';
