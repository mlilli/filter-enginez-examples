/**
 * Tests for the books panel's toggles, ISBN pattern and searches over a main-thread engine.
 *
 * @remarks
 * Three behaviors every app's books panel shares:
 *
 *   1. **A checked box is never disabled.** Predictive disable (`isToggleDisabled`) greys out an
 *      unchecked box whose rule would empty the results, but a checked one stays enabled even when
 *      something else has emptied them, so the user can always turn it back off. Asserting
 *      `input.disabled` is what pins this; the engine contract passes without the panel.
 *   2. **The ISBN pattern flags what does not compile**, with `BOOKS_ISBN_INVALID_MESSAGE` in a
 *      `role="alert"`, and writes nothing for it. Emptying the field with no rule on the engine writes
 *      nothing either, so the busy marker is never left waiting for a change that will not come.
 *   3. **Description and author write an empty-query rule when emptied** (the books convention), while
 *      the ISBN pattern removes its rule.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, regex, text } from '@filter-enginez/core';
import { BOOKS_ISBN_INVALID_MESSAGE, BOOKS_SEARCH_COPY, BOOKS_TOGGLE_LABELS } from '@filter-enginez/examples-shared/books-domain';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureCurrentVersion } from './booksBusy.js';
import BooksView from './BooksView.svelte';

/**
 * A Book-shaped row carrying every field the panel + card touch.
 *
 * @param overrides - The fields that differ.
 * @returns The row.
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

/** Three books: every one in print, one with an audiobook. */
const DATA: readonly Book[] = [
	makeBook({ hasAudiobook: true, id: 'a', isbn13: '9781111111111', title: 'A' }),
	makeBook({ genre: 'mystery', id: 'b', isbn13: '9782222222222', title: 'B' }),
	makeBook({ id: 'c', isbn13: '9783333333333', title: 'C' }),
];

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	vi.restoreAllMocks();
});

/**
 * Render the books view over a fresh main-thread engine.
 *
 * @returns The engine the rendered view runs over; query the view through `screen`.
 */
function renderBooks(): { readonly engine: SignalsEngine<Book> } {
	const engine = createSignalsEngine(createFilterEngine({ sourceData: DATA }));

	render(BooksView, { props: { engine }});

	return { engine };
}

describe('the books checkboxes', () => {
	it('never disable a checked box, even over empty results', async () => {
		const { engine } = renderBooks();
		const inPrint = screen.getByLabelText<HTMLInputElement>(BOOKS_TOGGLE_LABELS.inPrint);
		const audiobook = screen.getByLabelText<HTMLInputElement>(BOOKS_TOGGLE_LABELS.audiobook);

		await fireEvent.click(inPrint);

		expect(inPrint.checked).toBe(true);

		// Something else empties the results.
		engine.core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'no such words' }));
		await tick();

		expect(engine.core.getResults()).toHaveLength(0);
		// The checked box can still be turned off; the unchecked one would add nothing, so it greys out.
		expect(inPrint.disabled).toBe(false);
		expect(audiobook.disabled).toBe(true);
		expect(audiobook.closest('label')?.getAttribute('title')).toBe('No matches given your other filters');
	});

	it('disable an unchecked box whose rule would empty the results', async () => {
		const { engine } = renderBooks();

		engine.core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'sea' }));
		engine.core.addRule('isbn-pattern', regex('isbn13', { pattern: /^9782/u }));
		await tick();

		// Book B alone matches, and it has no audiobook.
		expect(screen.getByLabelText<HTMLInputElement>(BOOKS_TOGGLE_LABELS.audiobook).disabled).toBe(true);
		expect(screen.getByLabelText<HTMLInputElement>(BOOKS_TOGGLE_LABELS.inPrint).disabled).toBe(false);
	});
});

describe('the ISBN pattern', () => {
	it('flags a pattern that does not compile and writes nothing for it', async () => {
		const { engine } = renderBooks();
		const addRule = vi.spyOn(engine.core, 'addRule');
		const field = screen.getByLabelText<HTMLInputElement>(BOOKS_SEARCH_COPY.isbn.ariaLabel);

		await fireEvent.input(field, { target: { value: '[978' }});
		await fireEvent.blur(field);

		expect(screen.getByRole('alert').textContent).toBe(BOOKS_ISBN_INVALID_MESSAGE);
		expect(addRule).not.toHaveBeenCalled();
	});

	it('writes nothing, and marks nothing busy, when emptied with no rule on the engine', async () => {
		// The stuck "computing" state: a removal of a rule that is not there emits no change, so a busy
		// mark made for it would never clear.
		const { engine } = renderBooks();
		const removeRule = vi.spyOn(engine.core, 'removeRule');
		const field = screen.getByLabelText<HTMLInputElement>(BOOKS_SEARCH_COPY.isbn.ariaLabel);

		await fireEvent.input(field, { target: { value: '[' }});
		await fireEvent.blur(field);

		const versionBefore = captureCurrentVersion();

		await fireEvent.input(field, { target: { value: '' }});
		await fireEvent.blur(field);

		expect(removeRule).not.toHaveBeenCalled();
		expect(captureCurrentVersion()).toBe(versionBefore);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('removes its rule when emptied', async () => {
		const { engine } = renderBooks();
		const field = screen.getByLabelText<HTMLInputElement>(BOOKS_SEARCH_COPY.isbn.ariaLabel);

		await fireEvent.input(field, { target: { value: '^9781' }});
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(engine.core.getRules().has('isbn-pattern')).toBe(true);
		expect(engine.core.getResults()).toHaveLength(1);

		await fireEvent.input(field, { target: { value: '' }});
		await fireEvent.blur(field);

		expect(engine.core.getRules().has('isbn-pattern')).toBe(false);
	});
});

describe('the description and author searches', () => {
	it.each([
		['text-search', BOOKS_SEARCH_COPY.description.ariaLabel, 'sea'],
		['author-search', BOOKS_SEARCH_COPY.author.ariaLabel, 'Writer'],
	] as const)('%s writes once per change, and an empty-query rule when emptied', async (ruleId, ariaLabel, query) => {
		const { engine } = renderBooks();
		const addRule = vi.spyOn(engine.core, 'addRule');
		const field = screen.getByLabelText<HTMLInputElement>(ariaLabel);

		field.focus();
		await fireEvent.input(field, { target: { value: query }});
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.blur(field);

		expect(addRule).toHaveBeenCalledOnce();

		await fireEvent.input(field, { target: { value: '' }});
		await fireEvent.blur(field);

		expect(addRule).toHaveBeenCalledTimes(2);
		expect((engine.core.getRules().get(ruleId)?.config as { readonly query: string }).query).toBe('');
	});
});
