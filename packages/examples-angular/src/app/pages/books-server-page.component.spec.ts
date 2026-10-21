/**
 * Tests for `<fe-books-server-page>` — its offline screen and its header.
 *
 * @remarks
 * The offline screen is worded as every app words it: "Can't reach the filter server", the error, and
 * "Start it with … , then refresh.", with no link away. The healthy page carries the same header as
 * `/books` — undo, redo and the devtools toggle ahead of the URL controls — because time travel is an
 * engine feature and works over HTTP too.
 *
 * The route data is supplied directly, as the resolver would leave it; the healthy case uses a
 * main-thread engine, which the page treats exactly like the HTTP one (the panel's bundle read is the
 * only branch, and it takes the sync path here).
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import { createRxJsEngine } from '@filter-enginez/reactive-rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { BOOKS_SERVER_ROUTE_DATA_KEY, type BooksServerRouteData } from '../app.routes.js';
import { makeBook } from '../books/books-panel-fixture.js';
import { BooksServerPageComponent } from './books-server-page.component.js';

let fixture: ComponentFixture<BooksServerPageComponent>;

/**
 * Render the page over the given route data.
 *
 * @param data - What the resolver would have put on the route.
 */
async function renderPage(data: BooksServerRouteData): Promise<void> {
	await TestBed.configureTestingModule({
		imports: [BooksServerPageComponent],
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([]),
			{ provide: ActivatedRoute, useValue: { snapshot: { data: { [BOOKS_SERVER_ROUTE_DATA_KEY]: data }}}},
		],
	}).compileComponents();
	fixture = TestBed.createComponent(BooksServerPageComponent);
	fixture.detectChanges();
}

/**
 * The page's text with its whitespace collapsed.
 *
 * @param element - The element to read.
 * @returns Its text content, single-spaced and trimmed.
 */
function normalizedText(element: Element | null | undefined): string {
	return (element?.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

afterEach(() => {
	fixture.destroy();
});

describe('<fe-books-server-page> offline', () => {
	it('says it cannot reach the filter server, and how to start it, as every app does', async () => {
		await renderPage({ bookCount: 0, bootMs: 0, engine: null, error: new Error('fetch failed') });

		const main = (fixture.nativeElement as HTMLElement).querySelector('main.fe-server-offline');

		expect(normalizedText(main?.querySelector('.fe-server-offline__title'))).toBe('Can\'t reach the filter server');
		expect(normalizedText(main?.querySelector('.fe-server-offline__detail'))).toBe('fetch failed');
		expect(normalizedText(main?.querySelector('.fe-server-offline__hint'))).toBe(
			'Start it with pnpm --filter @filter-enginez/examples-server serve:api, then refresh.',
		);
		expect(main?.querySelector('a')).toBeNull();
	});
});

describe('<fe-books-server-page> connected', () => {
	it('carries undo, redo and the devtools toggle ahead of the URL controls, as /books does', async () => {
		const engine = createRxJsEngine(buildBooksEngine([makeBook({ genre: 'fantasy', id: 'b0' }), makeBook({ genre: 'mystery', id: 'b1' })]));

		await renderPage({ bookCount: 2, bootMs: 12, engine, error: null });

		const root = fixture.nativeElement as HTMLElement;
		const controls = root.querySelector('header .fe-books-app__url-controls');
		const undo = controls?.querySelector('button[aria-label="Undo (Cmd/Ctrl+Z)"]');
		const toggle = controls?.querySelector<HTMLButtonElement>('button[aria-label="Show devtools"]');

		expect(undo).not.toBeNull();
		expect(controls?.querySelector('button[aria-label="Redo (Cmd/Ctrl+Shift+Z)"]')).not.toBeNull();
		expect(toggle).not.toBeNull();
		expect(controls?.firstElementChild?.tagName.toLowerCase()).toBe('fe-time-travel-controls');
		expect(root.querySelector('fe-devtools-panel')).toBeNull();

		toggle?.click();
		fixture.detectChanges();

		expect(root.querySelector('fe-devtools-panel')).not.toBeNull();
	});

	it('counts results with the shared books noun', async () => {
		const engine = createRxJsEngine(buildBooksEngine([makeBook({ id: 'b0' })]));

		await renderPage({ bookCount: 1, bootMs: 3, engine, error: null });

		expect(normalizedText((fixture.nativeElement as HTMLElement).querySelector('.fe-result-count__label'))).toBe('results');
	});
});
