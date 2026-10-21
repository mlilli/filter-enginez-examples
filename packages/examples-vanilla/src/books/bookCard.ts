/**
 * One book card.
 *
 * @remarks
 * The generic `results/resultsView.ts` takes a `renderCard` callback; this is books'. Its markup,
 * text and tooltips match every other vertical's book card: the genre as its stored value, the
 * page count thousands-separated, and "Publication year" / "Average rating" titles on the two
 * numbers that carry no label of their own.
 *
 * `role="listitem"` is NOT set here — the results view sets it on whatever this returns, so a new
 * dataset's card cannot forget it and silently empty the list for a screen reader.
 *
 * Purely presentational, over the shared `fe-book-card*` classes in `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { el } from '@filter-enginez/examples-shared/dom';

/**
 * One book card.
 */
export function bookCard(book: Book): HTMLElement {
	return el('article', {
		children: [
			el('div', {
				children: [
					// The vocabulary value as stored — `graphic-novel`, never re-spaced — as every vertical's
					// card shows it.
					el('span', { className: 'fe-book-card__genre', text: book.genre }),
					el('span', {
						attrs: { title: 'Publication year' },
						className: 'fe-book-card__year',
						text: String(book.publicationYear),
					}),
				],
				className: 'fe-book-card__top',
			}),
			el('div', {
				children: [
					el('h3', { className: 'fe-book-card__title', text: book.title }),
					el('p', { className: 'fe-book-card__authors', text: book.authors.join(', ') || 'Unknown author' }),
				],
			}),
			// Format · language · availability. `filter(Boolean)` drops the null for an out-of-print
			// book so the line never ends in a dangling separator.
			el('p', {
				className: 'fe-book-card__meta',
				text: [book.format, book.language, book.isInPrint ? 'in print' : null]
					.filter((part): part is string => part !== null)
					.join(' · '),
			}),
			// Up to four subject tags. Each is its own element, not a joined string — they render as
			// separate chips, and concatenating them would run two genres together as
			// "romantic-suspensehistorical-romance" with no gap.
			...(book.subjects.length > 0
				? [
					el('div', {
						children: book.subjects
							.slice(0, 4)
							.map((subject) => el('span', { className: 'fe-book-card__subject', text: subject })),
						className: 'fe-book-card__subjects',
					}),
				]
				: []),
			el('div', {
				children: [
					el('span', {
						attrs: { title: 'Average rating' },
						className: 'fe-book-card__rating',
						text: book.averageRating === null ? 'Unrated' : `★ ${book.averageRating.toFixed(1)}`,
					}),
					// Thousands-separated, so a long book reads `1,200 pp`.
					el('span', { className: 'fe-book-card__pages', text: `${book.pageCount.toLocaleString()} pp` }),
				],
				className: 'fe-book-card__bottom',
			}),
		],
		className: 'fe-book-card',
	});
}
