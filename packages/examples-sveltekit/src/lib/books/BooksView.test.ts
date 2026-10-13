/**
 * Reproduction test for the `/books` filtering: render <BooksView> over a mini engine, click a genre
 * chip, and assert the reactive count + grid update. Proves the `svelte-signals` binding drives the
 * component (not just a raw store subscription).
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import BooksView from './BooksView.svelte';

/** A tiny Book-shaped corpus (only the fields BooksView touches). */
const DATA = [
	{ genre: 'fantasy', id: 'a', publicationYear: 2001, title: 'A' },
	{ genre: 'mystery', id: 'b', publicationYear: 2002, title: 'B' },
	{ genre: 'fantasy', id: 'c', publicationYear: 2003, title: 'C' },
];

describe('<BooksView>', () => {
	it('narrows the count + grid when a genre chip is toggled', async () => {
		// The mini corpus stands in for a full `Book`; annotate + cast through `unknown` at the boundary.
		const engine: SignalsEngine<Book> = createSignalsEngine(createFilterEngine({ sourceData: DATA })) as unknown as SignalsEngine<Book>;
		const { container, getByRole } = render(BooksView, { props: { engine }});

		expect(container.querySelector('.fe-result-count__number')?.textContent).toBe('3');
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(3);

		await fireEvent.click(getByRole('button', { name: 'fantasy' }));

		// Grid updates synchronously; the count rolls to its new value over ~600ms (ticking animation).
		expect(container.querySelectorAll('.fe-book-card')).toHaveLength(2);
		await waitFor(() => expect(container.querySelector('.fe-result-count__number')?.textContent).toBe('2'));

		engine.dispose();
	});
});
