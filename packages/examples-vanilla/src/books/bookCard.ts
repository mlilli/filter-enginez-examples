/**
 * One book card.
 *
 * @remarks
 * Lifted out of the former `books/results.ts` when that module was made generic as
 * `results/resultsView.ts`. The generic view takes a `renderCard` callback; this is books'.
 *
 * `role="listitem"` is NOT set here — the results view sets it on whatever this returns, so a new
 * dataset's card cannot forget it and silently empty the list for a screen reader.
 *
 * Purely presentational, over the shared `fe-book-card*` classes in `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { el } from '../dom.js';

/**
 * One book card.
 */
export function bookCard(book: Book): HTMLElement {
	return el('article', {
		children: [
			el('div', {
				children: [
					el('span', { className: 'fe-book-card__genre', text: book.genre.replace(/-/gu, ' ') }),
					el('span', { className: 'fe-book-card__year', text: String(book.publicationYear) }),
				],
				className: 'fe-book-card__top',
			}),
			el('h3', { className: 'fe-book-card__title', text: book.title }),
			el('p', { className: 'fe-book-card__authors', text: book.authors.join(', ') || 'Unknown author' }),
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
						className: 'fe-book-card__rating',
						text: book.averageRating === null ? 'Unrated' : `★ ${book.averageRating.toFixed(1)}`,
					}),
					el('span', { className: 'fe-book-card__pages', text: `${book.pageCount} pp` }),
				],
				className: 'fe-book-card__bottom',
			}),
		],
		className: 'fe-book-card',
	});
}
