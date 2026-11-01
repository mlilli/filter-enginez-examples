/**
 * `/books` follows `?f=` through Back and Forward in place: the page's one engine loads each state, the
 * panel follows, and nothing boots twice.
 *
 * @remarks
 * Routes to the real `BooksPageComponent` through the real router, its resolver replaced by a spy that
 * builds a four-book engine, then drives the same sequence the e2e suite does in a browser: a filter,
 * its debounced `?f=` write, a duplicated history entry, a second filter, then `history.back()` and
 * `history.forward()`, which jsdom answers with real `popstate` events. A re-mount would resolve again
 * (the spy counts resolutions) and would replace the panel's element (the test holds the first one).
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import { notifyUrlNavigation } from '@filter-enginez/examples-shared/url-state-follower';
import { createRxJsEngine, type RxJsEngine } from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BOOKS_ROUTE_DATA_KEY, type BooksRouteData } from '../app.routes.js';
import { makeBook } from '../books/books-panel-fixture.js';
import { BooksPageComponent } from './books-page.component.js';

/** The three genres of the corpus, which are the panel's genre chips. */
const GENRES = ['fantasy', 'mystery', 'science'] as const;

/** A route with nothing to render. */
@Component({ selector: 'fe-blank', template: '' })
class BlankComponent {}

/** The engines the resolver spy built, in order: one, if nothing re-mounts. */
const engines: RxJsEngine<Book>[] = [];

/** The `/books` resolver, replaced by a spy over a four-book engine. */
const resolveBooks = vi.fn(async (): Promise<BooksRouteData> => {
	await Promise.resolve();
	const engine = createRxJsEngine(
		buildBooksEngine((['fantasy', 'mystery', 'fantasy', 'science'] as const).map((genre, index) => makeBook({ genre, id: `b${String(index)}` }))),
	);

	engines.push(engine);

	return { engine, meta: { bookCount: 4, bootMs: 1, mode: 'main-thread', source: 'default-tier' }};
});

let harness: RouterTestingHarness;

/**
 * The page's root element.
 *
 * @returns It.
 */
function root(): HTMLElement {
	return harness.routeNativeElement as HTMLElement;
}

/**
 * The genre chips the panel shows selected.
 *
 * @returns Their labels, in panel order.
 */
function selectedGenres(): string[] {
	return [...root().querySelectorAll('.fe-books-panel__body .fe-chip--selected')]
		.map((chip) => chip.textContent.trim())
		.filter((label) => (GENRES as readonly string[]).includes(label));
}

/**
 * Click the genre chip labelled `label`, and let the page render.
 *
 * @param label - The chip's text.
 */
async function clickChip(label: string): Promise<void> {
	const chip = [...root().querySelectorAll<HTMLElement>('.fe-books-panel__body .fe-chip')].find((candidate) => candidate.textContent.trim() === label);

	if (chip === undefined) {
		throw new Error(`no chip "${label}"`);
	}
	chip.click();
	await harness.fixture.whenStable();
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
 * Traverse history by `delta` and wait for the `popstate` it fires, then for the page to render.
 *
 * @param delta - `-1` for Back, `1` for Forward.
 */
async function traverse(delta: -1 | 1): Promise<void> {
	const popped = new Promise((resolve) => {
		window.addEventListener('popstate', resolve, { once: true });
	});

	window.history.go(delta);
	await popped;
	await harness.fixture.whenStable();
}

beforeEach(async () => {
	engines.length = 0;
	resolveBooks.mockClear();
	window.history.replaceState(null, '', '/');
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([
				{ component: BlankComponent, path: '', pathMatch: 'full' },
				{ component: BooksPageComponent, path: 'books', resolve: { [BOOKS_ROUTE_DATA_KEY]: resolveBooks }},
			]),
		],
	});
	harness = await RouterTestingHarness.create();
});

afterEach(() => {
	harness.fixture.destroy();
	window.history.replaceState(null, '', '/');
});

describe('/books, on Back and Forward between two filter states', () => {
	it('loads each state into the same engine, the panel follows, and the page never re-mounts', async () => {
		window.history.replaceState(null, '', '/books');
		await harness.navigateByUrl('/books', BooksPageComponent);
		const panel = root().querySelector('.fe-books-panel__body');
		const engine = engines[0];

		expect(panel).not.toBeNull();
		if (engine === undefined) {
			throw new Error('the resolver built no engine');
		}
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
		await harness.fixture.whenStable();
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

		expect(resolveBooks).toHaveBeenCalledTimes(1);
		expect(root().querySelector('.fe-books-panel__body'), 'the panel was rebuilt').toBe(panel);
	});
});
