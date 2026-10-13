/**
 * `<fe-book-card>` — one `Book` rendered as a compact card.
 *
 * @remarks
 * The Angular port of the React `BooksCard` / Vue `BookCard` / Svelte `BookCard`, over the identical
 * `fe-book-card__*` classes from `@filter-enginez/ui-styles`. Card anatomy: genre + publication year →
 * title + authors → format · language · in-print → subject chips (first four) → rating + page count.
 *
 * Purely presentational: no engine import, no injected state, one `input.required`. Unlike the Vue and
 * Svelte ports, the field reads here carry no `?? []` / `?? 0` guards: those components' templates are
 * outside the type-linted program, whereas this one is checked against the real `Book` type, where
 * `averageRating` is the only nullable field. Typed-lint flagged the rest as dead branches.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** How many subject chips fit on a card before it gets noisy. */
const MAX_SUBJECT_CHIPS = 4;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-book-card',
	template: `
		<article role="listitem" class="fe-book-card">
			<div class="fe-book-card__top">
				<span class="fe-book-card__genre">{{ book().genre }}</span>
				<span class="fe-book-card__year" title="Publication year">{{ book().publicationYear }}</span>
			</div>

			<div>
				<h3 class="fe-book-card__title">{{ book().title }}</h3>
				<p class="fe-book-card__authors">{{ byline() }}</p>
			</div>

			@if (meta().length > 0) {
				<p class="fe-book-card__meta">{{ meta() }}</p>
			}

			@if (subjects().length > 0) {
				<div class="fe-book-card__subjects">
					@for (subject of subjects(); track subject) {
						<span class="fe-book-card__subject">{{ subject }}</span>
					}
				</div>
			}

			<div class="fe-book-card__bottom">
				<span class="fe-book-card__rating" title="Average rating">{{ rating() }}</span>
				<span class="fe-book-card__pages">{{ pages() }} pp</span>
			</div>
		</article>
	`,
})
export class BookCardComponent {
	/** The book to render. */
	public readonly book = input.required<Book>();

	/** Comma-joined author list, or a graceful fallback for the (legal) empty list. */
	protected readonly byline = computed<string>(() => {
		const authors = this.book().authors;

		return authors.length > 0 ? authors.join(', ') : 'Unknown author';
	});

	/** "Paperback · eng · in print" — omitting whatever the record doesn't carry. */
	protected readonly meta = computed<string>(() => {
		const record = this.book();

		return [record.format, record.language, record.isInPrint ? 'in print' : null]
			.filter((part): part is string => typeof part === 'string' && part.length > 0)
			.join(' · ');
	});

	/** Page count, thousands-separated. */
	protected readonly pages = computed<string>(() => this.book().pageCount.toLocaleString());

	/** Star rating, or "Unrated" — `averageRating` is the one legitimately nullable `Book` field. */
	protected readonly rating = computed<string>(() => {
		const value = this.book().averageRating;

		return value === null ? 'Unrated' : `★ ${value.toFixed(1)}`;
	});

	/** The first few subjects — enough to characterize the book without swamping the card. */
	protected readonly subjects = computed<readonly string[]>(() =>
		this.book().subjects.slice(0, MAX_SUBJECT_CHIPS),
	);
}
