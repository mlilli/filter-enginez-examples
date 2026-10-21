/**
 * The search field over the shared typeahead controller: debounce, flush, no unchanged commits, and
 * adopting only external changes.
 *
 * @packageDocumentation
 */

import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTypeaheadSearch } from './typeaheadSearch.js';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout']});
});

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

/**
 * Mount a field seeded with `initialQuery`.
 *
 * @param initialQuery - What the engine holds at mount.
 * @returns The field, its input and the commit spy.
 */
function mount(initialQuery = '') {
	const commit = vi.fn();
	const search = createTypeaheadSearch({
		ariaLabel: 'Search tasting notes',
		commit,
		initialQuery,
		placeholder: 'cherry, oak, tannin…',
	});

	document.body.append(search.element);

	const field = search.element.querySelector('input');

	if (field === null) {
		throw new Error('expected the search field');
	}

	return { commit, field, search };
}

/**
 * Type `text` into the field as one input event.
 *
 * @param field - The field.
 * @param text - Its new value.
 */
function type(field: HTMLInputElement, text: string): void {
	field.value = text;
	field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('createTypeaheadSearch', () => {
	it('shows the mount-time query and labels the field', () => {
		const { field } = mount('oak');

		expect(field.value).toBe('oak');
		expect(field.getAttribute('aria-label')).toBe('Search tasting notes');
		expect(field.getAttribute('placeholder')).toBe('cherry, oak, tannin…');
	});

	it('commits the trimmed query once typing pauses for the debounce window', () => {
		const { commit, field } = mount();

		type(field, ' oa');
		type(field, ' oak ');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS - 1);
		expect(commit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(commit).toHaveBeenCalledExactlyOnceWith('oak');
	});

	it('flushes on Enter, and neither the blur after it nor the pending timer commits again', () => {
		const { commit, field } = mount();

		field.focus();
		type(field, 'oak');
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).toHaveBeenCalledExactlyOnceWith('oak');
	});

	it('commits nothing on the blur of an untouched field', () => {
		const { commit, field } = mount('oak');

		field.focus();
		field.blur();

		expect(commit).not.toHaveBeenCalled();
	});

	it('adopts an external change and ignores the echo of its own commit', () => {
		const { commit, field, search } = mount();

		type(field, 'oak');
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		expect(commit).toHaveBeenCalledWith('oak');

		// The engine echoes the field's own query: nothing to repaint.
		expect(search.adopt('oak')).toBe(false);

		// Clear all: the field must empty.
		expect(search.adopt('')).toBe(true);
		expect(field.value).toBe('');
	});

	it('cancels a pending commit on dispose', () => {
		const { commit, field, search } = mount();

		type(field, 'oak');
		search.dispose();
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).not.toHaveBeenCalled();
	});
});
