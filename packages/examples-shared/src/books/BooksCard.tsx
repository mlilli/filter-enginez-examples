/**
 * `<BooksCard />` — renders one `Book` record as a compact card. Books-domain presentational,
 * shared across the example apps (the mirror of `WineCard`).
 *
 * @remarks
 * Card anatomy:
 *
 *   ┌─────────────────────────────────┐
 *   │ [genre]              Pub. year   │
 *   │ Title (h3)                       │
 *   │ Authors (subdued)                │
 *   │ Format · Language · in print     │
 *   │ Subject chips (first 4)          │
 *   │ ★ rating           N pages       │
 *   └─────────────────────────────────┘
 *
 * Cyan accents apply to data affordances (the rating, page count). Styling is the `fe-book-card*`
 * classes in `@filter-enginez/ui-styles`. Memoized — `book` refs are stable across renders.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { memo } from 'react';

/**
 * Props for `<BooksCard />`.
 */
export interface BooksCardProps {
	readonly book: Book;
}

/**
 * One book card.
 */
const BooksCardInner = ({ book }: BooksCardProps): React.ReactElement => {
	const byline = book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author';
	const meta = [book.format, book.language, book.isInPrint ? 'in print' : null]
		.filter((part) => part !== null)
		.join(' · ');

	return (
		<article role="listitem" className="fe-book-card">
			{/* Top row: genre + publication year */}
			<div className="fe-book-card__top">
				<span className="fe-book-card__genre">{book.genre}</span>
				<span className="fe-book-card__year" title="Publication year">{book.publicationYear}</span>
			</div>

			{/* Title + authors */}
			<div>
				<h3 className="fe-book-card__title">{book.title}</h3>
				<p className="fe-book-card__authors">{byline}</p>
			</div>

			{/* Format · language · availability */}
			<p className="fe-book-card__meta">{meta}</p>

			{/* Subjects — first 4 max */}
			{book.subjects.length > 0 && (
				<div className="fe-book-card__subjects">
					{book.subjects.slice(0, 4).map((subject) => (
						<span key={subject} className="fe-book-card__subject">{subject}</span>
					))}
				</div>
			)}

			{/* Bottom: rating + page count */}
			<div className="fe-book-card__bottom">
				<span className="fe-book-card__rating" title="Average rating">
					{book.averageRating === null ? 'Unrated' : `★ ${book.averageRating.toFixed(1)}`}
				</span>
				<span className="fe-book-card__pages">{book.pageCount.toLocaleString()} pp</span>
			</div>
		</article>
	);
};

/**
 * Memoized public export — `book` refs are stable across renders, so a card only re-renders when its
 * own book changes, not when a sibling filter churns the result set.
 */
export const BooksCard = memo(BooksCardInner);
