/**
 * `/books-raw` boots over the bundled books, which it loads with a dynamic `import()` of the dataset.
 *
 * @remarks
 * The route imports the dataset on demand so the 10,000-book generator is a chunk only a books route
 * fetches, instead of part of the app's startup bundle. These cases pin that the page still renders
 * exactly the corpus a static import of the dataset gives: every book, in order, unfiltered.
 *
 * @packageDocumentation
 */

import { books } from '@filter-enginez/mock-data/books';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RouteTeardown } from '../router.js';

import { renderBooksRawPage } from './booksRawPage.js';

/** The page's teardown, run after each case so no subscription outlives it. */
let teardown: RouteTeardown | null = null;

beforeEach(() => {
	document.body.replaceChildren();
	window.history.replaceState(null, '', '/books-raw');
});

afterEach(() => {
	teardown?.();
	teardown = null;
	window.history.replaceState(null, '', '/');
});

/**
 * Render the route into a fresh container on the document.
 *
 * @returns The container, once the page has booted.
 */
async function renderPage(): Promise<HTMLElement> {
	const container = document.createElement('div');

	document.body.append(container);
	teardown = await renderBooksRawPage(container);

	return container;
}

describe('the /books-raw page', () => {
	it('renders the count of every bundled book', async () => {
		const container = await renderPage();

		// Non-vacuous: the dataset is the full default tier, not an empty fallback.
		expect(books.length).toBeGreaterThan(1000);
		expect(container.querySelector('.fe-result-count__number')?.textContent).toBe(books.length.toLocaleString());
	});

	it('lists the bundled books in the dataset’s own order', async () => {
		const container = await renderPage();
		const firstTitles = [...container.querySelectorAll('.fe-book-card')]
			.slice(0, 3)
			.map((card) => card.textContent);

		expect(firstTitles).toHaveLength(3);
		for (const [index, text] of firstTitles.entries()) {
			expect(text).toContain(books[index]?.title);
		}
	});
});
