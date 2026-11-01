/**
 * `/books` follows `?f=` through Back and Forward in place: the page's one engine loads each state, the
 * panel follows, and nothing boots twice.
 *
 * @remarks
 * Renders the real route with its boot replaced by a spy over a four-book engine, then drives the same
 * sequence the e2e suite does in a browser: a filter, its debounced `?f=` write, a duplicated history
 * entry, a second filter, then `history.back()` and `history.forward()`, which jsdom answers with real
 * `popstate` events. A re-mount would boot again (the spy counts boots) and would replace the panel's
 * element (the test holds the first one).
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine } from '@filter-enginez/core';
import { notifyUrlNavigation } from '@filter-enginez/examples-shared/url-state-follower';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The three genres of the corpus, which are the panel's genre chips. */
const GENRES = ['fantasy', 'mystery', 'science'] as const;

/** Four books across three genres, so a genre chip narrows. */
const DATA = (['fantasy', 'mystery', 'fantasy', 'science'] as const).map(
	(genre, index) =>
		({
			authors: ['A. Writer'],
			averageRating: 4,
			coverImage: '',
			description: 'A tale.',
			format: 'paperback',
			genre,
			hasAudiobook: false,
			id: `b${String(index)}`,
			isbn13: '9780000000000',
			isInPrint: true,
			language: 'english',
			lastUpdated: '2024-01-01T00:00:00.000Z',
			openLibraryId: 'OL1',
			pageCount: 300,
			popularityScore: 10,
			publicationYear: 2000 + index,
			publisher: 'Test House',
			subjects: ['adventure'],
			subtitle: '',
			tier: 'default',
			title: `Book ${String(index)}`,
		}) as unknown as Book,
);

/** The boot spy and the engines it built: one, if nothing re-mounts. */
const boots = vi.hoisted(() => ({ engines: [] as unknown[], fn: vi.fn() }));

vi.mock('@filter-enginez/examples-shared/books-core', async (importActual) => ({
	...(await importActual<Record<string, unknown>>()),
	bootBooksEngine: boots.fn,
}));

const { default: BooksPage } = await import('./+page.svelte');

/**
 * The genre chips the panel shows selected.
 *
 * @returns Their labels, in panel order.
 */
function selectedGenres(): string[] {
	return [...document.querySelectorAll('.fe-books-panel__body .fe-chip--selected')]
		.map((chip) => chip.textContent.trim())
		.filter((label) => (GENRES as readonly string[]).includes(label));
}

/**
 * Click the genre chip labelled `label`.
 *
 * @param label - The chip's text.
 */
async function clickChip(label: string): Promise<void> {
	const chip = [...document.querySelectorAll<HTMLElement>('.fe-books-panel__body .fe-chip')].find((candidate) => candidate.textContent.trim() === label);

	if (chip === undefined) {
		throw new Error(`no chip "${label}"`);
	}
	await fireEvent.click(chip);
	await tick();
}

/**
 * Wait for the debounced `?f=` write to put a value other than `previous` in the address bar.
 *
 * @param previous - The value to move past.
 * @returns The new value.
 */
async function nextWrite(previous: string | null): Promise<string> {
	await waitFor(() => {
		const current = new URLSearchParams(window.location.search).get('f');

		expect(current).not.toBeNull();
		expect(current).not.toBe(previous);
	});

	return new URLSearchParams(window.location.search).get('f') ?? '';
}

/**
 * Traverse history by `delta` and wait for the `popstate` it fires, then for the view to settle.
 *
 * @param delta - `-1` for Back, `1` for Forward.
 */
async function traverse(delta: -1 | 1): Promise<void> {
	const popped = new Promise((resolve) => {
		window.addEventListener('popstate', resolve, { once: true });
	});

	window.history.go(delta);
	await popped;
	await tick();
}

beforeEach(() => {
	boots.engines.length = 0;
	boots.fn.mockReset();
	boots.fn.mockImplementation(async () => {
		await Promise.resolve();
		const engine = createSignalsEngine(createFilterEngine({ sourceData: DATA }));

		boots.engines.push(engine);

		return { engine };
	});
	window.history.replaceState(null, '', '/books');
});

afterEach(() => {
	cleanup();
	window.history.replaceState(null, '', '/');
});

describe('/books, on Back and Forward between two filter states', () => {
	it('loads each state into the same engine, the panel follows, and the route never re-mounts', async () => {
		render(BooksPage);
		await waitFor(() => {
			expect(document.querySelector('.fe-books-panel__body')).not.toBeNull();
		});
		const panel = document.querySelector('.fe-books-panel__body');
		const engine = boots.engines[0] as SignalsEngine<Book>;
		const loadConfig = vi.spyOn(engine.core, 'loadConfig');

		await clickChip('fantasy');
		const earlier = await nextWrite(null);

		window.history.pushState(window.history.state, '', window.location.href);
		await clickChip('mystery');
		const newer = await nextWrite(earlier);

		expect(selectedGenres()).toEqual(['fantasy', 'mystery']);
		// The app's own write, looked at again: a same-route navigation that changed nothing, then a
		// popstate that moved no entry. Neither may load it back.
		notifyUrlNavigation();
		window.dispatchEvent(new PopStateEvent('popstate'));
		await tick();
		expect(loadConfig, 'the app loaded one of its own writes back').not.toHaveBeenCalled();

		await traverse(-1);
		expect(new URLSearchParams(window.location.search).get('f')).toBe(earlier);
		expect(loadConfig).toHaveBeenCalledTimes(1);
		expect(selectedGenres()).toEqual(['fantasy']);
		expect(engine.core.getResultCount()).toBe(2);

		await traverse(1);
		expect(new URLSearchParams(window.location.search).get('f')).toBe(newer);
		expect(loadConfig).toHaveBeenCalledTimes(2);
		expect(selectedGenres()).toEqual(['fantasy', 'mystery']);
		expect(engine.core.getResultCount()).toBe(3);

		expect(boots.fn).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.fe-books-panel__body'), 'the panel was rebuilt').toBe(panel);
	});
});
