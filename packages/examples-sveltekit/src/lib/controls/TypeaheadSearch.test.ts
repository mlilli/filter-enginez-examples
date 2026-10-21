/**
 * Tests for `<TypeaheadSearch>`: the shared typeahead timing contract, bound in Svelte.
 *
 * @remarks
 * The controller's own rules have their suite in `examples-shared`; what is pinned here is the
 * binding, the part each framework writes for itself: that keystrokes reach `input`, that blur, Enter
 * and the clear button reach `flush`, and that a new rule query reaches `adopt` and replaces the text
 * only when it is an external change. Each case counts the commits, because the failures this binding
 * exists to prevent are a commit too many (Enter, then the blur it causes) or one that should not
 * exist (blurring an untouched empty field).
 *
 * @packageDocumentation
 */

import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { type ComponentProps, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TypeaheadSearch from './TypeaheadSearch.svelte';

/** The component's own prop shape. */
type SearchProps = ComponentProps<typeof TypeaheadSearch>;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	vi.useRealTimers();
});

/**
 * Render a search field and record every commit.
 *
 * @param ruleQuery - The rule's query at mount.
 * @returns The field, the commits so far, and a way to hand the field a new rule query.
 */
function renderSearch(ruleQuery = ''): {
	readonly commits: string[];
	readonly field: HTMLInputElement;
	readonly setRuleQuery: (next: string) => Promise<void>;
} {
	const commits: string[] = [];
	const props: SearchProps = {
		ariaLabel: 'Search tasting notes',
		commit: (query: string) => {
			commits.push(query);
		},
		placeholder: 'cherry, oak, tannin…',
		ruleQuery,
	};
	const view = render(TypeaheadSearch, props);
	const field = view.getByLabelText('Search tasting notes') as HTMLInputElement;

	return {
		commits,
		field,
		setRuleQuery: async (next) => {
			await view.rerender({ ...props, ruleQuery: next });
			await tick();
		},
	};
}

/**
 * Type into the field the way a browser reports a keystroke.
 *
 * @param field - The search field.
 * @param text - The field's text after the keystroke.
 */
async function typeInto(field: HTMLInputElement, text: string): Promise<void> {
	await fireEvent.input(field, { target: { value: text }});
}

describe('<TypeaheadSearch>', () => {
	it('commits once typing pauses, not per keystroke', async () => {
		const { commits, field } = renderSearch();

		await typeInto(field, 'c');
		await typeInto(field, 'ch');
		await typeInto(field, 'che');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS - 1);

		expect(commits).toEqual([]);

		vi.advanceTimersByTime(1);

		expect(commits).toEqual(['che']);
	});

	it('commits Enter once, not again on the blur Enter causes', async () => {
		const { commits, field } = renderSearch();

		field.focus();
		await typeInto(field, '  cherry ');
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.blur(field);
		vi.runAllTimers();

		expect(commits).toEqual(['cherry']);
	});

	it('commits nothing when an untouched empty field is blurred', async () => {
		const { commits, field } = renderSearch();

		field.focus();
		await fireEvent.blur(field);
		vi.runAllTimers();

		expect(commits).toEqual([]);
	});

	it('commits nothing when the text is back to the committed query', async () => {
		const { commits, field } = renderSearch('oak');

		await typeInto(field, 'oa');
		await typeInto(field, 'oak ');
		await fireEvent.blur(field);
		vi.runAllTimers();

		expect(commits).toEqual([]);
	});

	it('commits the empty query once when the clear button is pressed', async () => {
		const { commits, field } = renderSearch('oak');

		expect(field.value).toBe('oak');

		await fireEvent.click(document.querySelector('.fe-search-input__clear') as HTMLButtonElement);
		vi.runAllTimers();

		expect(commits).toEqual(['']);
		expect(field.value).toBe('');
	});

	it('shows an external change to the rule query', async () => {
		// Clear all, a pill's ×, Undo or a `?f` link: the field must show what the engine now holds.
		const { field, setRuleQuery } = renderSearch('oak');

		await setRuleQuery('');

		expect(field.value).toBe('');

		await setRuleQuery('tannin');

		expect(field.value).toBe('tannin');
	});

	it('keeps typing when its own debounced commit echoes back', async () => {
		// The commit of `cher` lands while the user has typed on to `cherry`; the echo must not replace
		// the newer text, or the field would jump back mid-word.
		const { commits, field, setRuleQuery } = renderSearch();

		await typeInto(field, 'cher');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commits).toEqual(['cher']);

		await typeInto(field, 'cherry');
		await setRuleQuery('cher');

		expect(field.value).toBe('cherry');

		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commits).toEqual(['cher', 'cherry']);
	});

	it('cancels a pending commit when the rule changes from outside', async () => {
		// Typing, then Clear all before the pause: the field shows the cleared query, and the half-typed
		// text is not committed over it afterwards.
		const { commits, field, setRuleQuery } = renderSearch('oak');

		await typeInto(field, 'oakwood');
		await setRuleQuery('');
		vi.runAllTimers();

		expect(field.value).toBe('');
		expect(commits).toEqual([]);
	});
});
