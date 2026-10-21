/**
 * Tests for `<fe-result-grid>` — its shared words and its paging window.
 *
 * @remarks
 * Every string the grid shows or announces comes from `RESULT_COPY[dataset]` and `resultCapNotice`,
 * and it grows by `RESULT_GRID_WINDOW` steps to the cap, so these pin the grid against those exports
 * rather than against literals: the empty state, the list label carrying the live count, the scroller
 * name, and the cap notice that appears only once the cap (not the result count) stops the grid.
 *
 * jsdom has no `IntersectionObserver`, so a stand-in records the grid's observer and reports the
 * sentinel in view on demand, the way scrolling to the end of the grid does.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
	RESULT_COPY,
	RESULT_GRID_WINDOW,
	resultCapNotice,
	type ResultDataset,
} from '@filter-enginez/examples-shared/verticals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultCardDirective, ResultGridComponent } from './result-grid.component.js';

/** One fixture record. */
interface Item {
	/** Its key. */
	readonly id: string;
}

/**
 * A result set of the given size.
 *
 * @param count - How many records.
 * @returns The records.
 */
function items(count: number): readonly Item[] {
	return Array.from({ length: count }, (_, index) => ({ id: `item-${String(index)}` }));
}

/** Host rendering one grid. */
@Component({
	imports: [ResultCardDirective, ResultGridComponent],
	template: `
		<fe-result-grid [results]="results()" [card]="card" [itemKey]="itemKey" [dataset]="dataset()" />
		<ng-template #card [feResultCardOf]="results()" let-item>
			<article class="card" role="listitem">{{ item.id }}</article>
		</ng-template>
	`,
})
class HostComponent {
	/** The dataset the grid names. */
	public readonly dataset = signal<ResultDataset>('wine');

	/** The result set. */
	public readonly results = signal<readonly Item[]>(items(3));

	/** The card key. */
	public readonly itemKey = (item: Item): string => item.id;
}

/** The observers the grid created, newest last. */
const observers: { callback: IntersectionObserverCallback }[] = [];

/** Records its callback; reports nothing until a test asks it to. */
class RecordingIntersectionObserver {
	/**
	 * Record the callback.
	 *
	 * @param callback - The grid's intersection callback.
	 */
	public constructor(callback: IntersectionObserverCallback) {
		observers.push({ callback });
	}

	/** Nothing to release. */
	public readonly disconnect = (): void => undefined;

	/** Reported on demand by `scrollToEnd` instead. */
	public readonly observe = (): void => undefined;
}

describe('<fe-result-grid>', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/** Report the sentinel in view to the newest observer, and render. */
	const scrollToEnd = (): void => {
		const latest = observers.at(-1);

		latest?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		fixture.detectChanges();
	};

	/**
	 * The rendered cards.
	 *
	 * @returns How many there are.
	 */
	const cardCount = (): number => (fixture.nativeElement as HTMLElement).querySelectorAll('.card').length;

	beforeEach(async () => {
		observers.length = 0;
		vi.stubGlobal('IntersectionObserver', RecordingIntersectionObserver);
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('names the list with the live count and the scroller with the dataset', () => {
		const list = fixture.nativeElement.querySelector('[role="list"]') as HTMLElement;
		const scroller = fixture.nativeElement.querySelector('.fe-result-grid__scroller') as HTMLElement;

		expect(list.getAttribute('aria-label')).toBe(RESULT_COPY.wine.listLabel(3));
		expect(list.getAttribute('aria-label')).toBe('3 matching wines');
		expect(scroller.getAttribute('aria-label')).toBe(RESULT_COPY.wine.scrollerLabel);

		host.dataset.set('books');
		host.results.set(items(1204));
		fixture.detectChanges();

		expect(list.getAttribute('aria-label')).toBe('1,204 matching books');
	});

	it('shows the dataset\'s empty state for an empty result set', () => {
		host.dataset.set('real-estate');
		host.results.set([]);
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;

		expect(root.querySelector('.fe-result-grid__empty-title')?.textContent).toBe(RESULT_COPY['real-estate'].emptyTitle);
		expect(root.querySelector('.fe-result-grid__empty-hint')?.textContent).toBe(RESULT_COPY['real-estate'].emptyHint);
	});

	it('grows by the shared batch and says nothing below the cap', () => {
		host.results.set(items(200));
		fixture.detectChanges();

		expect(cardCount()).toBe(RESULT_GRID_WINDOW.initial);

		scrollToEnd();

		expect(cardCount()).toBe(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch);
		expect(fixture.nativeElement.querySelector('.fe-result-grid__cap-notice')).toBeNull();
	});

	it('stops at the cap and only then shows the shared cap notice', () => {
		const total = RESULT_GRID_WINDOW.cap + 500;

		host.results.set(items(total));
		fixture.detectChanges();

		for (let step = 0; step < RESULT_GRID_WINDOW.cap / RESULT_GRID_WINDOW.batch + 2; step += 1) {
			scrollToEnd();
		}

		const notice = resultCapNotice(RESULT_GRID_WINDOW.cap, total);
		const text = (fixture.nativeElement.querySelector('.fe-result-grid__cap-notice') as HTMLElement | null)?.textContent
			.replace(/\s+/gu, ' ')
			.trim();

		expect(cardCount()).toBe(RESULT_GRID_WINDOW.cap);
		expect(text).toBe(`Showing ${notice.rendered} of ${notice.total} ${notice.suffix}`);
		expect(text).toContain('matches · narrow your filters to surface the rest');
	});
});
