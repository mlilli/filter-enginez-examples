/**
 * `@filter-enginez/examples-shared/search-core` — when a search field commits, for every app.
 *
 * @remarks
 * Every text and fuzzy search in the six apps (wine's tasting notes and winery, books' description,
 * authors and ISBN pattern, real estate's description) follows one timing contract, decided here and
 * bound by each framework in its own idiom:
 *
 *   - **Search as you type.** Each keystroke re-arms a trailing debounce, and the query commits once
 *     the typing pauses for {@link TYPEAHEAD_DEBOUNCE_MS}. No per-keystroke engine work.
 *   - **Leaving the field commits at once.** Blur, Enter and the clear button flush, cancelling any
 *     pending debounce, so leaving the field never drops the last few characters.
 *   - **Nothing unchanged is committed.** A query equal (once trimmed) to the one last committed is
 *     not written: tabbing through an empty field, pressing Enter and then blurring, or blurring after
 *     a debounced commit writes nothing a second time. So the devtools log, Undo and the busy marker
 *     see one action per change. A write that does nothing would mark the engine busy with no settle
 *     to clear it, because the engine emits no change for it.
 *   - **An external change is adopted, an echo is not.** When the rule's query changes from outside
 *     (Clear all, a pill's ×, Undo, a `?f=` link) the field shows it. The echo of the field's own
 *     commit is skipped, so a debounced commit landing mid-word never yanks the text back. On the
 *     worker and server tiers an echo arrives a round trip late, possibly after a newer commit has
 *     gone out, so every commit not yet echoed counts as the field's own: the late echo of `oa` after
 *     `oak` was sent is skipped too, rather than flashing the older text.
 *
 * The controller owns no DOM and no framework state: the field's text stays in the framework, which
 * hands each keystroke to {@link TypeaheadController.input}, each blur, Enter or clear to
 * {@link TypeaheadController.flush}, and each new rule query to {@link TypeaheadController.adopt}.
 *
 * @packageDocumentation
 */

/** The trailing debounce, long enough to coalesce a burst of typing and short enough to feel live. */
export const TYPEAHEAD_DEBOUNCE_MS = 250;

/** Options for {@link createTypeaheadController}. */
export interface TypeaheadControllerOptions {
	/**
	 * Write a changed query to the engine. Called only with a trimmed query that differs from the last
	 * one committed or adopted; the caller decides what an empty query writes (a removal, or a rule
	 * with an empty query) and marks the engine busy as part of the write.
	 */
	readonly commit: (trimmedQuery: string) => void;
	/** The trailing debounce, in milliseconds. {@link TYPEAHEAD_DEBOUNCE_MS} by default. */
	readonly debounceMs?: number;
	/** The rule's query when the field mounts; `''` when there is no rule. */
	readonly initialQuery: string;
}

/** The timing half of a search field. */
export interface TypeaheadController {
	/**
	 * Take a new rule query from the engine.
	 *
	 * @param ruleQuery - The rule's current query; `''` when there is no rule.
	 * @returns `true` when it is an external change the field should now show, `false` for the echo of
	 *   the field's own commit.
	 */
	readonly adopt: (ruleQuery: string) => boolean;
	/** Cancel a pending debounce, for a field that is going away. */
	readonly dispose: () => void;
	/**
	 * Commit now: a blur, Enter, or the clear button.
	 *
	 * @param text - The field's text.
	 */
	readonly flush: (text: string) => void;
	/**
	 * Take a keystroke: re-arm the debounced commit.
	 *
	 * @param text - The field's text after the keystroke.
	 */
	readonly input: (text: string) => void;
}

/**
 * Create the timing half of one search field.
 *
 * @param options - The commit callback, the debounce and the starting query.
 * @returns The controller.
 */
export function createTypeaheadController(options: TypeaheadControllerOptions): TypeaheadController {
	const { commit, debounceMs = TYPEAHEAD_DEBOUNCE_MS } = options;
	// The query the engine is known to hold: seeded from the mount-time rule, advanced by every commit
	// and every adoption, so an echo can be told apart from an external change.
	let lastCommittedQuery = options.initialQuery;
	// Commits sent but not yet seen coming back, oldest first. An echo of any of them is the field's
	// own, and also confirms every older one (a coalescing tier may deliver only the newest).
	const queriesAwaitingEcho: string[] = [];
	let pendingTimer: ReturnType<typeof setTimeout> | null = null;

	const cancelPending = (): void => {
		if (pendingTimer !== null) {
			clearTimeout(pendingTimer);
			pendingTimer = null;
		}
	};
	const commitIfChanged = (text: string): void => {
		const trimmed = text.trim();

		if (trimmed === lastCommittedQuery) {
			return;
		}
		lastCommittedQuery = trimmed;
		queriesAwaitingEcho.push(trimmed);
		commit(trimmed);
	};

	return {
		adopt: (ruleQuery) => {
			const echoIndex = queriesAwaitingEcho.indexOf(ruleQuery);

			if (echoIndex !== -1) {
				queriesAwaitingEcho.splice(0, echoIndex + 1);

				return false;
			}
			if (ruleQuery === lastCommittedQuery) {
				return false;
			}
			cancelPending();
			queriesAwaitingEcho.length = 0;
			lastCommittedQuery = ruleQuery;

			return true;
		},
		dispose: cancelPending,
		flush: (text) => {
			cancelPending();
			commitIfChanged(text);
		},
		input: (text) => {
			cancelPending();
			pendingTimer = setTimeout(() => {
				pendingTimer = null;
				commitIfChanged(text);
			}, debounceMs);
		},
	};
}
