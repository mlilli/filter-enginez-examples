<script lang="ts">
	/**
	 * `<TypeaheadSearch>` — a `<SearchInput>` bound to the shared typeahead timing contract.
	 *
	 * @remarks
	 * Every search field in this app (wine's tasting notes and winery, books' description, authors and
	 * ISBN pattern, real estate's description) renders this, so all six follow the one contract in
	 * `@filter-enginez/examples-shared/search-core`:
	 *
	 *   - Each keystroke re-arms a trailing debounce, and the query commits once typing pauses.
	 *   - Blur, Enter and the clear button commit at once.
	 *   - A query equal (once trimmed) to the one last committed or adopted is never committed, so
	 *     Enter followed by the blur it causes writes once, and blurring an untouched field writes
	 *     nothing (and so never marks the engine busy with no change to clear it).
	 *   - A rule query that changes from outside (Clear all, a pill's ×, Undo, a `?f=` link) replaces
	 *     the text; the echo of this field's own commit does not, so a debounced commit landing while
	 *     the user is still typing never yanks the text back.
	 *
	 * ### Local text plus an adopt step, not a writable `$derived`
	 *
	 * The other controls in this app read their selection through a writable `$derived`, which
	 * recomputes whenever the rule changes. A search field cannot: its own debounced commit changes
	 * the rule while the user is still typing, and recomputing then would replace the newer
	 * keystrokes with the older committed query. The controller's `adopt` is what tells the two
	 * apart, so the text is local state that takes the rule query only when `adopt` says it is an
	 * external change.
	 *
	 * The caller decides what a commit writes (a removal or an empty-query rule for `''`), and marks
	 * the engine busy inside `commit`, so the busy mark happens only when something is written.
	 */

	import { createTypeaheadController } from '@filter-enginez/examples-shared/search-core';
	import { onDestroy } from 'svelte';

	import SearchInput from './SearchInput.svelte';

	interface Props {
		/** The field's accessible name. */
		readonly ariaLabel: string;
		/**
		 * Write a changed, trimmed query to the engine. Called only when the query differs from the one
		 * last committed or adopted; marks the engine busy as part of the write.
		 */
		readonly commit: (trimmedQuery: string) => void;
		/** The trailing debounce in milliseconds; the shared default when omitted. */
		readonly debounceMs?: number;
		/** The field's placeholder. */
		readonly placeholder: string;
		/** The rule's current query; `''` when there is no rule. */
		readonly ruleQuery: string;
	}

	const { ariaLabel, commit, debounceMs, placeholder, ruleQuery }: Props = $props();

	// The controller is made once, from the mount-time query and debounce; later queries reach it
	// through `adopt`. `commit` is read through the prop at call time, so a debounce firing after a
	// re-render calls the current callback rather than the one captured at mount.
	// svelte-ignore state_referenced_locally
	const controller = createTypeaheadController({
		commit: (trimmedQuery) => {
			commit(trimmedQuery);
		},
		...(debounceMs === undefined ? {} : { debounceMs }),
		initialQuery: ruleQuery,
	});

	/** The field's text: the user's keystrokes, replaced only by an external change to the rule. */
	// svelte-ignore state_referenced_locally
	let text = $state(ruleQuery);

	// Take each new rule query. `adopt` is false for the echo of this field's own commit, which is
	// what keeps a mid-word debounced commit from replacing the newer keystrokes.
	$effect.pre(() => {
		const next = ruleQuery;

		if (controller.adopt(next)) {
			text = next;
		}
	});

	// A debounce must not fire into a torn-down field.
	onDestroy(() => {
		controller.dispose();
	});
</script>

<SearchInput
	value={text}
	{placeholder}
	{ariaLabel}
	onChange={(next: string) => {
		text = next;
		controller.input(next);
	}}
	onCommit={(next: string) => {
		controller.flush(next);
	}}
/>
