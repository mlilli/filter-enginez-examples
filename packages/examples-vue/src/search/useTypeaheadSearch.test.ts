/**
 * Tests for `useTypeaheadSearch` — the Vue binding of the shared search timing contract.
 *
 * @remarks
 * The timing rules themselves are tested once, at their source, in `examples-shared`'s
 * `typeaheadController` suite. What is this file's own is the binding: that keystrokes and flushes
 * reach the field's text, that the watched rule query is adopted only when it is an external change,
 * and that a pending debounce dies with the component's scope.
 */

import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { useTypeaheadSearch } from './useTypeaheadSearch.js';

/**
 * Bind a search inside its own effect scope, over a rule query the case drives by hand.
 *
 * @param initialRuleQuery - The rule's query at mount.
 * @param debounceMs - An optional debounce override.
 * @returns The binding, the commit spy, the rule query and the scope.
 */
function bind(initialRuleQuery = '', debounceMs?: number) {
	const ruleQuery = ref(initialRuleQuery);
	const commit = vi.fn<(trimmedQuery: string) => void>();
	const scope = effectScope();
	const search = scope.run(() =>
		useTypeaheadSearch({
			commit,
			committedQuery: () => ruleQuery.value,
			...(debounceMs === undefined ? {} : { debounceMs }),
		}),
	);

	if (search === undefined) {
		throw new Error('the scope did not run');
	}

	return { commit, ruleQuery, scope, search };
}

describe('useTypeaheadSearch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('seeds the field from the rule the engine already holds', () => {
		const { scope, search } = bind('oak');

		expect(search.query.value).toBe('oak');
		scope.stop();
	});

	it('shows each keystroke at once and commits the trimmed query once typing pauses', () => {
		const { commit, scope, search } = bind();

		search.input('o');
		search.input('oak ');

		expect(search.query.value).toBe('oak ');
		expect(commit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).toHaveBeenCalledExactlyOnceWith('oak');
		scope.stop();
	});

	it('honors a debounce override', () => {
		const { commit, scope, search } = bind('', 40);

		search.input('oak');
		vi.advanceTimersByTime(40);

		expect(commit).toHaveBeenCalledExactlyOnceWith('oak');
		scope.stop();
	});

	it('commits at once on a flush, and never twice for the same query', () => {
		const { commit, scope, search } = bind();

		search.input('oak');
		search.flush('oak');
		// Enter, then the blur that follows it.
		search.flush('oak');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).toHaveBeenCalledExactlyOnceWith('oak');
		scope.stop();
	});

	it('writes nothing for a blur on an untouched field', () => {
		const { commit, scope, search } = bind();

		search.flush('');

		expect(commit).not.toHaveBeenCalled();
		scope.stop();
	});

	it('adopts an external change to the rule, cancelling the pending commit', async () => {
		const { commit, ruleQuery, scope, search } = bind('oak');

		search.input('oak bar');
		// Clear all, a pill's ×, Undo: the rule goes away under the field.
		ruleQuery.value = '';
		await nextTick();

		expect(search.query.value).toBe('');
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);
		expect(commit).not.toHaveBeenCalled();
		scope.stop();
	});

	it('skips the echo of its own commit, so the text is never yanked mid-word', async () => {
		const { ruleQuery, scope, search } = bind();

		search.flush(' oak ');
		search.input(' oak b');
		// The engine answers with the committed, trimmed query.
		ruleQuery.value = 'oak';
		await nextTick();

		expect(search.query.value).toBe(' oak b');
		scope.stop();
	});

	it('drops a pending commit when its scope is disposed', () => {
		const { commit, scope, search } = bind();

		search.input('oak');
		scope.stop();
		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		expect(commit).not.toHaveBeenCalled();
	});
});
