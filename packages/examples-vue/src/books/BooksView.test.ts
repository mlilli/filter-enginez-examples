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

import { createFilterEngine } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { type DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

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
