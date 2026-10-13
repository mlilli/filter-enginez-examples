/**
 * Functional-parity tests for the full SvelteKit books experience: render `<BooksView>` over a mini
 * engine of Book-shaped rows and prove the three headline interactions match the React app —
 *   1. a genre chip toggle narrows the result count + card grid,
 *   2. a range-slider commit narrows results, and
 *   3. removing an active-filter pill restores the full set.
 *
 * All three drive the engine through the `svelte-signals` binding + the real rule factories, exactly
 * as the app does, so a green run means the Svelte panel commits + reads the same engine state React
 * does.
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import BooksView from './BooksView.svelte';

/** Read the (ticking) result-count text. */
function countText(container: HTMLElement): string | null | undefined {
	return container.querySelector('.fe-result-count__number')?.textContent;
}

/**
 * A Book-shaped row carrying every field the panel + card touch. Cast through `unknown` at the
 * boundary — the mini corpus stands in for a full `Book`.
 */
function makeBook(overrides: { readonly id: string } & Partial<Book>): Book {
	return {
		authors: ['A. Writer'],
		averageRating: 4,
		coverImage: '',
		description: 'A tale of the sea.',
		format: 'paperback',
		genre: 'fantasy',
		hasAudiobook: false,
		isbn13: '9780000000000',
		isInPrint: true,
		language: 'english',
		lastUpdated: '2024-01-01T00:00:00.000Z',
		openLibraryId: 'OL1',
		pageCount: 300,
		popularityScore: 10,
		publicationYear: 2000,
		publisher: 'Test House',
		subjects: ['adventure'],
		subtitle: '',
		tier: 'default',
		title: 'Untitled',
		...overrides,
	};
}

/** Four books across two genres + four publication years, so both facets have signal. */
const DATA: readonly Book[] = [
	makeBook({ genre: 'fantasy', id: 'a', publicationYear: 2000, title: 'A' }),
	makeBook({ genre: 'mystery', id: 'b', publicationYear: 2005, title: 'B' }),
	makeBook({ genre: 'fantasy', id: 'c', publicationYear: 2010, title: 'C' }),
	makeBook({ genre: 'science', id: 'd', publicationYear: 2015, title: 'D' }),
];

/** Build a fresh signals engine over the mini corpus. */
function bootEngine(): SignalsEngine<Book> {
	return createSignalsEngine(createFilterEngine({ sourceData: DATA }));
}

// Vitest runs with `globals: false`, so `@testing-library/svelte`'s automatic afterEach cleanup (which
// hooks the global afterEach) doesn't register — unmount explicitly so each test starts from a clean DOM.
afterEach(cleanup);

describe('<BooksView> full-parity interactions', () => {
	it('narrows the count + grid when a genre chip is toggled', async () => {
		const engine = bootEngine();
		const { container, getByRole } = render(BooksView, { props: { engine }});

		expect(countText(container)).toBe('4');
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(4);

		await fireEvent.click(getByRole('button', { name: 'fantasy' }));

		// The grid updates synchronously; the count rolls to its new value over ~600ms.
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(2);
		await waitFor(() => expect(countText(container)).toBe('2'));

		engine.dispose();
	});

	it('narrows results when the publication-year slider commits a lower bound', async () => {
		const engine = bootEngine();
		const { container, getByLabelText } = render(BooksView, { props: { engine }});

		const lowerInput = getByLabelText('Publication year lower bound (editable)') as HTMLInputElement;

		await fireEvent.input(lowerInput, { target: { value: '2008' }});
		await fireEvent.blur(lowerInput);

		// Years >= 2008: 2010 + 2015 → 2 results.
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(2);
		await waitFor(() => expect(countText(container)).toBe('2'));

		engine.dispose();
	});

	it('restores the full set when an active-filter pill is removed', async () => {
		const engine = bootEngine();
		const { container, getByRole } = render(BooksView, { props: { engine }});

		await fireEvent.click(getByRole('button', { name: 'mystery' }));
		await waitFor(() => expect(countText(container)).toBe('1'));

		// The active-filter pill exposes a "Remove Genre filter" button.
		await fireEvent.click(getByRole('button', { name: 'Remove Genre filter' }));

		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(4);
		await waitFor(() => expect(countText(container)).toBe('4'));

		engine.dispose();
	});
});
