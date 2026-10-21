/**
 * Functional-parity test for the full Vue books experience: mount `<BooksView>` over a mini engine of
 * Book-shaped rows and prove the two headline interactions match the React/Svelte apps —
 *   1. a genre chip toggle narrows the result count + card grid, and
 *   2. removing an active-filter pill restores the full set.
 *
 * Both drive the engine through the `vue-signals` binding + the real rule factories, exactly as the app
 * does, so a green run means the Vue panel commits + reads the same engine state React/Svelte do.
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { bool, createFilterEngine, type FuzzySearchRule, type TextSearchRule } from '@filter-enginez/core';
import {
	BOOKS_ISBN_INVALID_MESSAGE,
	BOOKS_SEARCH_COPY,
	BOOKS_TOGGLE_LABELS,
} from '@filter-enginez/examples-shared/books-domain';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { type DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { booksBusyTracker } from './booksBusy.js';
import BooksView from './BooksView.vue';

/** A router with the landing + books routes so `<RouterLink>` inside `<BooksView>` resolves. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: { template: '<div />' }, path: '/books' },
		],
	});
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
	} as unknown as Book;
}

/** Four books across three genres + four publication years, so the facets have signal. */
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

/** Mount `<BooksView>` with a test router + the booted engine prop. */
async function mountView(engine: SignalsEngine<Book>) {
	const router = makeRouter();
	// Mount first (installs the router plugin, which kicks off the memory-history initial navigation),
	// THEN await `isReady` — awaiting before install would hang forever.
	const wrapper = mount(BooksView, { global: { plugins: [router]}, props: { engine }});

	await router.isReady();

	return wrapper;
}

/** The rendered chip whose visible text matches `label` (throws if absent, so callers avoid `!`). */
function chipByText(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
	const node = wrapper.findAll('.fe-chip').find((candidate) => candidate.text() === label);

	if (node === undefined) {
		throw new Error(`no chip with text "${label}"`);
	}

	return node;
}

/** The button whose `aria-label` matches (throws if absent, so callers avoid `!`). */
function buttonByAria(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
	const node = wrapper.findAll('button').find((candidate) => candidate.attributes('aria-label') === label);

	if (node === undefined) {
		throw new Error(`no button with aria-label "${label}"`);
	}

	return node;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('<BooksView> full-parity interactions', () => {
	it('narrows the count + grid when a genre chip is toggled', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		expect(wrapper.find('.fe-result-count__number').text()).toBe('4');
		expect(wrapper.findAll('.fe-book-card')).toHaveLength(4);

		await chipByText(wrapper, 'fantasy').trigger('click');
		await flushPromises();

		// The grid updates immediately; the count rolls to its new value over ~600ms.
		expect(wrapper.findAll('.fe-book-card')).toHaveLength(2);
		await vi.waitFor(() => {
			expect(wrapper.find('.fe-result-count__number').text()).toBe('2');
		});

		engine.dispose();
	});

	it('restores the full set when an active-filter pill is removed', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		await chipByText(wrapper, 'mystery').trigger('click');
		await flushPromises();
		await vi.waitFor(() => {
			expect(wrapper.find('.fe-result-count__number').text()).toBe('1');
		});

		// The active-filter pill exposes a "Remove Genre filter" button.
		await buttonByAria(wrapper, 'Remove Genre filter').trigger('click');
		await flushPromises();

		expect(wrapper.findAll('.fe-book-card')).toHaveLength(4);
		await vi.waitFor(() => {
			expect(wrapper.find('.fe-result-count__number').text()).toBe('4');
		});

		engine.dispose();
	});
});

/**
 * The search field with a given accessible name (throws if absent).
 *
 * @param wrapper - The mounted view.
 * @param label - The field's `aria-label`.
 * @returns The input.
 */
function fieldByAria(wrapper: VueWrapper, label: string): DOMWrapper<HTMLInputElement> {
	const node = wrapper.find<HTMLInputElement>(`input[aria-label="${label}"]`);

	if (!node.exists()) {
		throw new Error(`no input with aria-label "${label}"`);
	}

	return node;
}

/**
 * The checkbox inside the row labelled `label` (throws if absent).
 *
 * @param wrapper - The mounted view.
 * @param label - The row's text.
 * @returns The input.
 */
function checkboxByLabel(wrapper: VueWrapper, label: string): DOMWrapper<HTMLInputElement> {
	const row = wrapper.findAll('label.fe-books-checkbox').find((candidate) => candidate.text() === label);

	if (row === undefined) {
		throw new Error(`no checkbox labelled "${label}"`);
	}

	return row.find<HTMLInputElement>('input[type="checkbox"]');
}

describe('<BooksView> searches', () => {
	it('writes an empty-query rule when the description search empties (the books convention)', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const field = fieldByAria(wrapper, BOOKS_SEARCH_COPY.description.ariaLabel);

		expect(field.attributes('placeholder')).toBe(BOOKS_SEARCH_COPY.description.placeholder);
		await field.setValue('sea');
		await field.trigger('blur');
		await field.setValue('');
		await field.trigger('blur');

		expect((engine.core.getRule('text-search') as TextSearchRule | undefined)?.config.query).toBe('');

		engine.dispose();
	});

	it('commits the author search once for Enter and the blur that follows it', async () => {
		const engine = bootEngine();
		const wrapper = mount(BooksView, { attachTo: document.body, global: { plugins: [makeRouter()]}, props: { engine }});
		const field = fieldByAria(wrapper, BOOKS_SEARCH_COPY.author.ariaLabel);
		const addRule = vi.spyOn(engine.core, 'addRule');

		field.element.focus();
		await field.setValue('writer');
		await field.trigger('keydown', { key: 'Enter' });
		await field.trigger('blur');

		expect(addRule).toHaveBeenCalledOnce();
		expect((engine.core.getRule('author-search') as FuzzySearchRule | undefined)?.config.query).toBe('writer');

		wrapper.unmount();
		engine.dispose();
	});

	it('writes nothing, and leaves the busy indicator dark, for a blur on an untouched ISBN field', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const removeRule = vi.spyOn(engine.core, 'removeRule');

		booksBusyTracker.markResolvedAtLeast(booksBusyTracker.captureCurrentVersion());
		await fieldByAria(wrapper, BOOKS_SEARCH_COPY.isbn.ariaLabel).trigger('blur');

		expect(removeRule).not.toHaveBeenCalled();
		expect(booksBusyTracker.getIsBusy()).toBe(false);

		engine.dispose();
	});

	it('flags an invalid ISBN pattern in an alert, writes nothing, and removes the rule once emptied', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const field = fieldByAria(wrapper, BOOKS_SEARCH_COPY.isbn.ariaLabel);

		await field.setValue('^978');
		await field.trigger('blur');
		expect(engine.core.getRules().has('isbn-pattern')).toBe(true);

		await field.setValue('[');
		await field.trigger('blur');
		expect(wrapper.find('[role="alert"]').text()).toBe(BOOKS_ISBN_INVALID_MESSAGE);
		// The last good pattern keeps filtering.
		expect(engine.core.getRules().has('isbn-pattern')).toBe(true);

		await field.setValue('');
		await field.trigger('blur');
		expect(engine.core.getRules().has('isbn-pattern')).toBe(false);
		expect(wrapper.find('[role="alert"]').exists()).toBe(false);

		engine.dispose();
	});

	it('removes nothing when a field that only ever held an invalid pattern is emptied', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const field = fieldByAria(wrapper, BOOKS_SEARCH_COPY.isbn.ariaLabel);
		const removeRule = vi.spyOn(engine.core, 'removeRule');

		await field.setValue('[');
		await field.trigger('blur');
		await field.setValue('');
		await field.trigger('blur');

		expect(removeRule).not.toHaveBeenCalled();

		engine.dispose();
	});
});

describe('<BooksView> checkboxes', () => {
	it('never disables a checked box, even when its own filter empties the results', async () => {
		const engine = bootEngine();

		// No book in the mini corpus has an audiobook, so this rule empties the results.
		engine.core.addRule('has-audiobook', bool('hasAudiobook', true));

		const wrapper = await mountView(engine);
		const box = checkboxByLabel(wrapper, BOOKS_TOGGLE_LABELS.audiobook);

		expect(box.element.checked).toBe(true);
		expect(box.element.disabled).toBe(false);

		engine.dispose();
	});

	it('disables an unchecked box that would empty the results, with the shared title', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const box = checkboxByLabel(wrapper, BOOKS_TOGGLE_LABELS.audiobook);

		expect(box.element.disabled).toBe(true);
		expect(box.element.closest('label')?.getAttribute('title')).toBe('No matches given your other filters');

		engine.dispose();
	});
});

describe('<BooksView> on a phone', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('hides the panel with the hidden attribute rather than unmounting it, so typed text survives', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({
			addEventListener: () => undefined,
			matches: false,
			media: query,
			removeEventListener: () => undefined,
		}));
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const toggle = wrapper.find('.fe-books-app__filters-toggle');
		const collapse = wrapper.find('.fe-filter-collapse');

		expect(toggle.attributes('aria-expanded')).toBe('false');
		expect(collapse.attributes('hidden')).toBeDefined();

		await toggle.trigger('click');
		expect(collapse.attributes('hidden')).toBeUndefined();
		await fieldByAria(wrapper, BOOKS_SEARCH_COPY.author.ariaLabel).setValue('half-typ');

		await toggle.trigger('click');
		expect(collapse.attributes('hidden')).toBeDefined();
		await toggle.trigger('click');

		expect(fieldByAria(wrapper, BOOKS_SEARCH_COPY.author.ariaLabel).element.value).toBe('half-typ');

		engine.dispose();
	});
});
