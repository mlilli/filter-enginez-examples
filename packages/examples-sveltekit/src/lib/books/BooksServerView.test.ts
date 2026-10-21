/**
 * `<BooksView>` over the HTTP engine `/books-server` boots, end to end in-process.
 *
 * @remarks
 * The engine is the real one the route boots (`bootBooksServerEngine`), and the server is this app's
 * own filter service (`runDatasetQuery`, what `/books-server/query` answers with, and
 * `corpusDocumentResponse`, what the corpus route answers with): `fetch` is routed to them rather than
 * to a network. So the boundary under test is the real one: an engine whose sync `core` shim has no
 * `applyFiltersAndQuery`, whose bundle arrives through `asyncEngine.applyFiltersAndQuery`, and whose
 * rule mirror changes only after a round trip.
 *
 * Two behaviors are pinned:
 *
 *   1. **Predictive disable works on the server tier.** A panel that asked the sync shim for the
 *      bundle would get nothing, and no chip would ever disable.
 *   2. **A chip lights the moment it is clicked**, not a round trip later.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type FilterBundleQuery, type FilterEngineConfig, regex } from '@filter-enginez/core';
import { bootBooksServerEngine } from '@filter-enginez/examples-shared/books-server-core';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { corpusDocumentResponse, runDatasetQuery } from '../server/datasetFilterService.js';
import BooksView from './BooksView.svelte';

/** What the browser transport posts to `/books-server/query`. */
interface QueryBody {
	readonly config: FilterEngineConfig;
	readonly dataset?: string;
	readonly limit?: number;
	readonly query?: FilterBundleQuery;
}

/** How long a server round trip may take here, debounce included. */
const ROUND_TRIP_TIMEOUT_MS = 15_000;

let engine: SignalsEngine<Book> | null = null;

beforeEach(() => {
	vi.stubGlobal('fetch', async (input: string, init?: { readonly body?: string }): Promise<Response> => {
		const url = input;

		if (url.endsWith('/corpus/books.json')) {
			return corpusDocumentResponse('books');
		}
		if (url.endsWith('/query')) {
			const body = JSON.parse(init?.body ?? '{}') as QueryBody;
			const result = await runDatasetQuery({
				config: body.config,
				dataset: body.dataset ?? 'books',
				limit: body.limit ?? 0,
				query: body.query,
			});

			return Response.json(result);
		}

		throw new Error(`Unexpected request in the books-server test: ${url}`);
	});
});

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	engine?.dispose();
	engine = null;
	vi.unstubAllGlobals();
});

/**
 * Boot the HTTP engine the way `/books-server` does.
 *
 * @returns The engine.
 */
async function bootServerEngine(): Promise<SignalsEngine<Book>> {
	engine = await bootBooksServerEngine({ baseUrl: '/books-server' });

	return engine;
}

describe('<BooksView> over the HTTP engine', () => {
	it('disables a genre chip that would empty the results, from the server\'s bundle', async () => {
		const booted = await bootServerEngine();
		const [onlyBook] = booted.core.getSourceData();

		// Narrow to exactly one book, so every other genre's chip would empty the results.
		booted.core.addRule('isbn-pattern', regex('isbn13', { pattern: new RegExp(`^${onlyBook.isbn13}$`, 'u') }));
		await waitFor(() => {
			expect(booted.resultCount.value).toBe(1);
		}, { timeout: ROUND_TRIP_TIMEOUT_MS });

		const { container } = render(BooksView, { props: { engine: booted, tier: 'server' }});
		const otherGenre = booted.core.getSourceData().find((book) => book.genre !== onlyBook.genre)?.genre;

		expect(otherGenre).toBeDefined();

		await waitFor(() => {
			const chip = [...container.querySelectorAll<HTMLButtonElement>('.fe-chip')]
				.find((button) => button.textContent.trim() === String(otherGenre).replace(/-/gu, ' '));

			expect(chip?.disabled).toBe(true);
		}, { timeout: ROUND_TRIP_TIMEOUT_MS });
	}, 30_000);

	it('lights a chip the moment it is clicked, before the server answers', async () => {
		const booted = await bootServerEngine();
		const { getAllByRole } = render(BooksView, { props: { engine: booted, tier: 'server' }});
		const [{ genre }] = booted.core.getSourceData();
		const chip = getAllByRole('button', { name: genre.replace(/-/gu, ' ') })[0] as HTMLButtonElement;

		expect(chip.getAttribute('aria-pressed')).toBe('false');

		await fireEvent.click(chip);
		await tick();

		expect(chip.getAttribute('aria-pressed')).toBe('true');
		// And it stays lit once the server's answer lands.
		await waitFor(() => {
			expect(booted.resultCount.value).toBeLessThan(booted.core.getSourceData().length);
		}, { timeout: ROUND_TRIP_TIMEOUT_MS });
		expect(chip.getAttribute('aria-pressed')).toBe('true');
	}, 30_000);

	it('names the server tier in the footer', async () => {
		const booted = await bootServerEngine();
		const { container } = render(BooksView, { props: { engine: booted, tier: 'server' }});

		expect(container.querySelector('.fe-books-app__footer')?.textContent).toContain('server engine over HTTP');
	}, 30_000);
});
