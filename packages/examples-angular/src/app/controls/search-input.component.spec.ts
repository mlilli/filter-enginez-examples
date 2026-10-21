/**
 * Tests for `<fe-search-input>` — its binding of the shared typeahead controller.
 *
 * @remarks
 * The timing contract itself is `@filter-enginez/examples-shared/search-core`'s and is tested there.
 * What these pin is that THIS component binds it the way every app does: keystrokes reach `input`
 * (debounced), blur / Enter / the clear button reach `flush`, and the `query` input reaches `adopt`, so
 * an external change shows in the field while the echo of the field's own commit does not.
 *
 * The host stands in for a panel: it owns the committed query and records every `commit`, which is
 * exactly the set of engine writes (and busy marks) the panel would make.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchInputComponent } from './search-input.component.js';

/** Host owning the committed query, as a panel does. */
@Component({
	imports: [SearchInputComponent],
	template: `
		<fe-search-input
			ariaLabel="Search fixtures"
			placeholder="type here"
			[query]="query()"
			(commit)="commits.set([...commits(), $event])"
		/>
	`,
})
class HostComponent {
	/** The rule's committed query. */
	public readonly query = signal('');

	/** Every commit, in order — one per engine write the panel would make. */
	public readonly commits = signal<readonly string[]>([]);
}

describe('<fe-search-input>', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/**
	 * The field.
	 *
	 * @returns The input element.
	 */
	const field = (): HTMLInputElement => fixture.nativeElement.querySelector('input') as HTMLInputElement;

	/** Run change detection twice, so an effect's write is on screen too. */
	const render = (): void => {
		fixture.detectChanges();
		fixture.detectChanges();
	};

	/**
	 * Type text into the field, the way a keystroke does.
	 *
	 * @param text - The field's text after the keystroke.
	 */
	const type = (text: string): void => {
		field().value = text;
		field().dispatchEvent(new Event('input'));
		render();
	};

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		render();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('commits once the typing pauses, not per keystroke', () => {
		type('o');
		type('oa');
		type('oak');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS - 1);

		expect(host.commits()).toEqual([]);

		vi.advanceTimersByTime(1);

		expect(host.commits()).toEqual(['oak']);
	});

	it('commits the trimmed query at once on blur, cancelling the pending debounce', () => {
		type('  oak  ');
		field().dispatchEvent(new Event('blur'));

		expect(host.commits()).toEqual(['oak']);

		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(host.commits()).toEqual(['oak']);
	});

	it('commits once on Enter, not again on the blur Enter causes', () => {
		field().focus();
		type('oak');
		field().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(host.commits()).toEqual(['oak']);
		expect(document.activeElement).not.toBe(field());
	});

	it('commits nothing when an untouched empty field is blurred', () => {
		// A commit here would be a busy mark with no change for the engine to settle it with.
		field().focus();
		field().blur();
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(host.commits()).toEqual([]);
	});

	it('commits nothing when the text is back to the committed query', () => {
		type('oak');
		field().dispatchEvent(new Event('blur'));
		type('oaks');
		type('oak');
		field().dispatchEvent(new Event('blur'));

		expect(host.commits()).toEqual(['oak']);
	});

	it('clears the field and commits the empty query at once from the clear button', () => {
		host.query.set('oak');
		render();

		(fixture.nativeElement.querySelector('.fe-search-input__clear') as HTMLButtonElement).click();
		render();

		expect(host.commits()).toEqual(['']);
		expect(field().value).toBe('');
		expect(fixture.nativeElement.querySelector('.fe-search-input__clear')).toBeNull();
	});

	it('shows an external change to the committed query', () => {
		// Clear all, a pill's ×, Undo or a `?f=` link, reaching the field.
		host.query.set('cherry');
		render();

		expect(field().value).toBe('cherry');

		host.query.set('');
		render();

		expect(field().value).toBe('');
		expect(host.commits()).toEqual([]);
	});

	it('does not yank the text back on the echo of its own commit', () => {
		type('oa');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);
		type('oak');

		// The debounced `oa` lands while `k` is already in the field.
		host.query.set('oa');
		render();

		expect(field().value).toBe('oak');
		expect(host.commits()).toEqual(['oa']);
	});

	it('cancels a pending commit when it is torn down', () => {
		type('oak');
		fixture.destroy();
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(host.commits()).toEqual([]);
	});

	it('names and describes the field from its inputs', () => {
		expect(field().getAttribute('aria-label')).toBe('Search fixtures');
		expect(field().getAttribute('placeholder')).toBe('type here');
	});
});
