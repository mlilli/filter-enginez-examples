/**
 * `useTypeaheadSearch` — the Vue binding of the search-field timing contract every app shares.
 *
 * @remarks
 * The timing lives in `@filter-enginez/examples-shared/search-core`'s `createTypeaheadController`:
 * a keystroke re-arms a trailing debounce, blur / Enter / the clear button commit at once, a query
 * equal to the one last committed is never written again, and an external change to the rule (Clear
 * all, a pill's ×, Undo, a `?f=` link) is adopted while the echo of the field's own commit is not.
 * This file only binds it to Vue: the field's text is a `ref`, the rule's query is watched, and the
 * pending debounce is cancelled when the component's scope is disposed.
 *
 * What an empty query writes is the caller's decision, made inside `commit`: wine and real estate
 * remove the rule, books' description and author searches write a rule with an empty query, and the
 * ISBN pattern removes its rule. `commit` is also where the caller marks the engine busy, so busy is
 * marked only when something is written.
 *
 * @packageDocumentation
 */

import { createTypeaheadController } from '@filter-enginez/examples-shared/search-core';
import { onScopeDispose, type Ref, ref, watch } from 'vue';

/** Options for {@link useTypeaheadSearch}. */
export interface TypeaheadSearchOptions {
	/**
	 * Write a changed query to the engine, marking the engine busy first.
	 *
	 * @param trimmedQuery - The trimmed query; called only when it differs from the last one committed
	 *   or adopted.
	 */
	readonly commit: (trimmedQuery: string) => void;
	/** Reads the query the engine holds for this field; `''` when there is no rule. Watched. */
	readonly committedQuery: () => string;
	/** The trailing debounce, in milliseconds; the shared default when omitted. */
	readonly debounceMs?: number;
}

/** What a search section binds its `<SearchInput>` to. */
export interface TypeaheadSearch {
	/**
	 * A blur, Enter or the clear button: show the text and commit it at once.
	 *
	 * @param text - The field's text.
	 */
	readonly flush: (text: string) => void;
	/**
	 * A keystroke: show the text and re-arm the debounced commit.
	 *
	 * @param text - The field's text after the keystroke.
	 */
	readonly input: (text: string) => void;
	/** The text the field shows: the typed text, or the rule's query after an external change. */
	readonly query: Ref<string>;
}

/**
 * Bind one search field to the shared typeahead controller.
 *
 * @remarks
 * Call in `setup()`: the watch and the scope-dispose hook register against the component's scope.
 *
 * @param options - The commit callback, the rule-query reader and the optional debounce.
 * @returns The field's text and its two event handlers.
 */
export function useTypeaheadSearch(options: TypeaheadSearchOptions): TypeaheadSearch {
	const query = ref<string>(options.committedQuery());
	const controller = createTypeaheadController({
		commit: options.commit,
		initialQuery: query.value,
		...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
	});

	watch(options.committedQuery, (ruleQuery) => {
		if (controller.adopt(ruleQuery)) {
			query.value = ruleQuery;
		}
	});

	onScopeDispose(controller.dispose);

	return {
		flush: (text) => {
			query.value = text;
			controller.flush(text);
		},
		input: (text) => {
			query.value = text;
			controller.input(text);
		},
		query,
	};
}
