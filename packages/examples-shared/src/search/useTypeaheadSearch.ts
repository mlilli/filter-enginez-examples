/**
 * `useTypeaheadSearch` — debounced search-as-you-type binding for the canonical `<SearchInput />`.
 *
 * @remarks
 * The presentational `<SearchInput />` (in `@filter-enginez/react-ui`) is deliberately pure +
 * stateless: it owns no timers, exposing only `onChange` (per keystroke) + `onCommit` (blur / Enter
 * / clear). This hook layers the *typeahead* behavior on top of that contract at the example-app
 * layer, so the input stays pure (and the coverage-gated library package stays untouched):
 *
 *   - **Debounced commit while typing.** Each keystroke reschedules a trailing-edge commit; the
 *     engine only sees the query once the user pauses for `debounceMs`. No per-keystroke engine work.
 *   - **Immediate flush.** Blur / Enter / clear commit right away (cancelling any pending debounce)
 *     so leaving the field never drops the last few characters.
 *   - **External re-sync without clobber.** When the rule's query changes *externally* (clear-all,
 *     a reset), the local mirror adopts it — but a change that merely echoes our own just-committed
 *     value is skipped, so an in-flight keystroke sequence isn't yanked back mid-type.
 *
 * Shared by every React text/fuzzy search section (wine, books and real estate, in both React apps),
 * which is why it lives in the dataset-agnostic `examples-shared` tier rather than any one app.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Default trailing-edge debounce — long enough to coalesce a burst of typing, short enough to feel live. */
const DEFAULT_DEBOUNCE_MS = 250;

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
	 * Commit a (trimmed, changed) query to the engine. The hook handles trimming + dedup, so this
	 * runs only when the value actually differs from what was last committed; do the `addRule` here.
	 */
	readonly commit: (trimmedQuery: string) => void;
	/** Trailing-edge debounce in ms. Defaults to {@link DEFAULT_DEBOUNCE_MS}. */
	readonly debounceMs?: number;
}

/**
 * Wire debounced typeahead onto a `<SearchInput />` for an engine-backed text/fuzzy rule.
 */
export function useTypeaheadSearch(params: TypeaheadSearchParams): TypeaheadSearchBinding {
	const { commit, debounceMs = DEFAULT_DEBOUNCE_MS, ruleQuery } = params;
	const [value, setValue] = useState(ruleQuery);
	// The last query we know the engine holds — seeded from + advanced to every value we commit, so
	// the re-sync effect can tell "our own echo" (skip) from a genuine external change (adopt).
	const lastCommittedRef = useRef(ruleQuery);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (ruleQuery !== lastCommittedRef.current) {
			lastCommittedRef.current = ruleQuery;
			setValue(ruleQuery);
		}
	}, [ruleQuery]);

	const clearTimer = useCallback((): void => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	// Cancel any pending debounce on unmount so a timer can't fire into a torn-down tree.
	useEffect(() => clearTimer, [clearTimer]);

	const runCommit = useCallback((raw: string): void => {
		const trimmed = raw.trim();

		if (trimmed === lastCommittedRef.current) {
			return;
		}
		lastCommittedRef.current = trimmed;
		commit(trimmed);
	}, [commit]);

	const onChange = useCallback((next: string): void => {
		setValue(next);
		clearTimer();
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			runCommit(next);
		}, debounceMs);
	}, [clearTimer, debounceMs, runCommit]);

	const onCommit = useCallback((next: string): void => {
		clearTimer();
		runCommit(next);
	}, [clearTimer, runCommit]);

	return { onChange, onCommit, value };
}
