/**
 * `useTypeaheadSearch` — the React binding of the shared search timing for the canonical
 * `<SearchInput />`.
 *
 * @remarks
 * The presentational `<SearchInput />` (in `@filter-enginez/react-ui`) is deliberately pure +
 * stateless: it owns no timers, exposing only `onChange` (per keystroke) + `onCommit` (blur / Enter
 * / clear). The timing contract every app's search fields share — debounced commit while typing, an
 * immediate flush on blur / Enter / clear, nothing unchanged committed, external changes adopted and
 * echoes skipped — lives in `./typeaheadController.ts`, where the Svelte, Vue, Angular and vanilla
 * fields bind the same controller. This hook only holds the field's text in React state and hands the
 * controller its three inputs.
 *
 * Shared by every React text/fuzzy search section (wine, books and real estate, in both React apps),
 * which is why it lives in the dataset-agnostic `examples-shared` tier rather than any one app.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { createTypeaheadController, type TypeaheadController } from './typeaheadController.js';

/**
 * The `<SearchInput />`-shaped binding this hook returns — spread straight onto the input.
 */
export interface TypeaheadSearchBinding {
	/** Current mirrored text (controlled value for the input). */
	readonly value: string;
	/** Per-keystroke handler — mirrors the text + (re)arms the debounced commit. */
	readonly onChange: (next: string) => void;
	/** Flush handler — commits immediately (blur / Enter / clear), cancelling any pending debounce. */
	readonly onCommit: (next: string) => void;
}

/**
 * Parameters for {@link useTypeaheadSearch}.
 */
export interface TypeaheadSearchParams {
	/** The engine rule's current query — the source of truth we mirror + re-sync from. */
	readonly ruleQuery: string;
	/**
	 * Commit a (trimmed, changed) query to the engine. The controller handles trimming + dedup, so this
	 * runs only when the value actually differs from what was last committed; do the write here.
	 */
	readonly commit: (trimmedQuery: string) => void;
	/** Trailing-edge debounce in ms. The shared `TYPEAHEAD_DEBOUNCE_MS` by default. */
	readonly debounceMs?: number;
}

/**
 * Wire debounced typeahead onto a `<SearchInput />` for an engine-backed text/fuzzy rule.
 */
export function useTypeaheadSearch(params: TypeaheadSearchParams): TypeaheadSearchBinding {
	const { commit, debounceMs, ruleQuery } = params;
	const [value, setValue] = useState(ruleQuery);
	// The latest `commit`, read when a debounce fires, so the controller (made once) never calls a stale
	// closure.
	const commitRef = useRef(commit);
	// Made once, from the mount-time query and debounce; later queries reach it through `adopt`.
	const [controller] = useState<TypeaheadController>(() => createTypeaheadController({
		commit: (trimmedQuery) => {
			commitRef.current(trimmedQuery);
		},
		...(debounceMs === undefined ? {} : { debounceMs }),
		initialQuery: ruleQuery,
	}));

	useEffect(() => {
		commitRef.current = commit;
	}, [commit]);

	useEffect(() => {
		if (controller.adopt(ruleQuery)) {
			setValue(ruleQuery);
		}
	}, [controller, ruleQuery]);

	// Cancel any pending debounce on unmount so a timer can't fire into a torn-down tree.
	useEffect(() => () => {
		controller.dispose();
	}, [controller]);

	const onChange = useCallback((next: string): void => {
		setValue(next);
		controller.input(next);
	}, [controller]);

	const onCommit = useCallback((next: string): void => {
		controller.flush(next);
	}, [controller]);

	return { onChange, onCommit, value };
}
