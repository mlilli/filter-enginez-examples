/**
 * `/books` follows `?f=` through Back and Forward in place: the page's one engine loads each state, the
 * panel follows, and nothing boots twice.
 *
 * @remarks
 * Mounts the real `BooksPage` with its boot replaced by a spy over a four-book engine, then drives the
 * same sequence the e2e suite does in a browser: a filter, its debounced `?f=` write, a duplicated
 * history entry, a second filter, then `history.back()` and `history.forward()`, which jsdom answers
 * with real `popstate` events. A re-mount would boot again (the spy counts boots) and would replace the
 * view's root element (the test holds the first one).
 *
 * @packageDocumentation
 */

import type * as BooksCore from '@filter-enginez/examples-shared/books-core';
import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine } from '@filter-enginez/core';
import { notifyUrlNavigation } from '@filter-enginez/examples-shared/url-state-follower';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

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

/** The engines the boot spy built, in order: one, if nothing re-mounts. */
const booted = vi.hoisted(() => ({ engines: [] as unknown[] }));

vi.mock('@filter-enginez/examples-shared/books-core', async (importActual) => {
	const actual = await importActual<typeof BooksCore>();

	return {
		...actual,
		bootBooksEngine: vi.fn(async () => {
			await Promise.resolve();
			const engine = createSignalsEngine(createFilterEngine({ sourceData: DATA }));

			booted.engines.push(engine);

			return { engine };
		}),
	};
});

const { bootBooksEngine } = await import('@filter-enginez/examples-shared/books-core');
const { default: BooksPage } = await import('./BooksPage.vue');

/** A selected chip in the panel: one per genre the filter holds. */
const SELECTED_CHIP = '.fe-books-panel__body .fe-chip--selected';

/**
 * Click the genre chip labelled `label`.
 *
 * @param wrapper - The mounted page.
 * @param label - The chip's text.
 */
async function clickChip(wrapper: VueWrapper, label: string): Promise<void> {
	const chip = wrapper.findAll('.fe-chip').find((candidate) => candidate.text() === label);

	if (chip === undefined) {
		throw new Error(`no chip "${label}"`);
	}
	await chip.trigger('click');
	await flushPromises();
}

/**
 * Wait for the debounced `?f=` write to put a value other than `previous` in the address bar.
 *
 * @param previous - The value to move past.
 * @returns The new value.
 */
async function nextWrite(previous: string | null): Promise<string> {
	await vi.waitFor(() => {
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
	await flushPromises();
}

let wrapper: VueWrapper | null = null;

beforeEach(() => {
	booted.engines.length = 0;
	vi.mocked(bootBooksEngine).mockClear();
	window.history.replaceState(null, '', '/books');
});

afterEach(() => {
	wrapper?.unmount();
	wrapper = null;
	window.history.replaceState(null, '', '/');
});

describe('/books, on Back and Forward between two filter states', () => {
	it('loads each state into the same engine, the panel follows, and the page never re-mounts', async () => {
		const router = createRouter({ history: createMemoryHistory(), routes: [{ component: BooksPage, path: '/books' }, { component: { template: '<div />' }, path: '/' }]});

		wrapper = mount(BooksPage, { global: { plugins: [router]}});
		await router.isReady();
		await vi.waitFor(() => {
			expect(wrapper?.find('.fe-books-panel__body').exists()).toBe(true);
		});
		const view = wrapper.find('.fe-books-panel__body').element;
		const engine = booted.engines[0] as SignalsEngine<Book>;
		const loadConfig = vi.spyOn(engine.core, 'loadConfig');

		await clickChip(wrapper, 'fantasy');
		const earlier = await nextWrite(null);

		window.history.pushState(window.history.state, '', window.location.href);
		await clickChip(wrapper, 'mystery');
		const newer = await nextWrite(earlier);

		expect(wrapper.findAll(SELECTED_CHIP)).toHaveLength(2);
		// The app's own write, looked at again: a same-route navigation that changed nothing, then a
		// popstate that moved no entry. Neither may load it back.
		notifyUrlNavigation();
		window.dispatchEvent(new PopStateEvent('popstate'));
		await flushPromises();
		expect(loadConfig, 'the app loaded one of its own writes back').not.toHaveBeenCalled();

		await traverse(-1);
		expect(new URLSearchParams(window.location.search).get('f')).toBe(earlier);
		expect(loadConfig).toHaveBeenCalledTimes(1);
		expect(wrapper.findAll(SELECTED_CHIP).map((chip) => chip.text())).toEqual(['fantasy']);
		expect(engine.core.getResultCount()).toBe(2);

		await traverse(1);
		expect(new URLSearchParams(window.location.search).get('f')).toBe(newer);
		expect(loadConfig).toHaveBeenCalledTimes(2);
		expect(wrapper.findAll(SELECTED_CHIP)).toHaveLength(2);
		expect(engine.core.getResultCount()).toBe(3);

		expect(bootBooksEngine).toHaveBeenCalledTimes(1);
		expect(wrapper.find('.fe-books-panel__body').element, 'the view was rebuilt').toBe(view);
	});
});
