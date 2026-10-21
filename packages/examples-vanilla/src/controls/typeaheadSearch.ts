/**
 * `controls/typeaheadSearch` — a search field bound to the shared typeahead controller.
 *
 * @remarks
 * The framework-less counterpart to `examples-shared`'s `useTypeaheadSearch`, over the same
 * `createTypeaheadController` from `@filter-enginez/examples-shared/search-core`. The controller
 * owns every timing and dedupe decision; this module only wires it to {@link createSearchInput}:
 *
 * - a keystroke re-arms the 250 ms trailing commit;
 * - blur, Enter and the clear button flush at once;
 * - a trimmed query equal to the last committed or adopted one is never committed, so Enter followed
 *   by its blur, or the blur of an untouched field, writes nothing — and marks nothing busy;
 * - {@link TypeaheadSearch.adopt} shows an external change (Clear all, a pill's ×, Undo, a `?f` link)
 *   and ignores the echo of the field's own commit, so the text is never yanked mid-word.
 *
 * `commit` receives the trimmed query and is called only on a real change; the caller marks busy and
 * writes inside it, which is what makes "busy only when something is written" true.
 *
 * @packageDocumentation
 */

import { createTypeaheadController } from '@filter-enginez/examples-shared/search-core';

import { createSearchInput } from './controls.js';

/** Construction-time options for {@link createTypeaheadSearch}. */
export interface TypeaheadSearchOptions {
	/** Accessible name for the field. */
	readonly ariaLabel: string;
	/** Write the trimmed query. Called only when it differs from the last one committed or adopted. */
	readonly commit: (trimmedQuery: string) => void;
	/** The query the engine holds at mount — what the field shows first. */
	readonly initialQuery: string;
	/** Placeholder text. */
	readonly placeholder: string;
}

/** A mounted typeahead search field. */
export interface TypeaheadSearch {
	/**
	 * Show the engine's query when it changed from outside the field.
	 *
	 * @param ruleQuery - The query the engine now holds (`''` for no rule).
	 * @returns Whether the field was repainted.
	 */
	readonly adopt: (ruleQuery: string) => boolean;
	/** Cancel a pending debounced commit. */
	readonly dispose: () => void;
	/** The field's root element. */
	readonly element: HTMLElement;
}

/**
 * Build a search field over the shared typeahead controller.
 *
 * @param options - Copy, the mount-time query and the commit.
 * @returns The mounted field.
 */
export function createTypeaheadSearch(options: TypeaheadSearchOptions): TypeaheadSearch {
	const { ariaLabel, commit, initialQuery, placeholder } = options;
	const controller = createTypeaheadController({ commit, initialQuery });
	const field = createSearchInput({
		ariaLabel,
		onChange: (text) => {
			controller.input(text);
		},
		onCommit: (text) => {
			controller.flush(text);
		},
		placeholder,
	});

	field.update(initialQuery);

	return {
		adopt: (ruleQuery) => {
			if (!controller.adopt(ruleQuery)) {
				return false;
			}
			field.update(ruleQuery);

			return true;
		},
		dispose: controller.dispose,
		element: field.element,
	};
}
