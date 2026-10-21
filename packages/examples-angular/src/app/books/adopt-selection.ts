/**
 * `adoptSelection` — a books chip group's selection: painted on click, adopted from the engine when it
 * settles.
 *
 * @remarks
 * A writable derived (`linkedSignal` over a deduped `computed`) rather than a plain `computed`, so a
 * click lights its chip at once. On `/books` the engine settles in the same frame and the two never
 * differ; on `/books-server` the rule comes back a full HTTP round trip later, and a pure derivation
 * would leave the chip dark until then — the optimistic paint every app's `/books-server` has.
 *
 * The source's `equal` is the load-bearing part, for the reason `wine/adopted-rule-state.ts` gives at
 * length: `linkedSignal` re-seeds when its SOURCE notifies, and `activeRules$` emits a new map on every
 * settle. Comparing selections by value keeps an unrelated rule's settle from re-seeding (and so
 * discarding) a click whose own round trip is still in flight, even where the read builds a fresh
 * array each time (the super-group keys do).
 *
 * @packageDocumentation
 */

import { computed, linkedSignal, type WritableSignal } from '@angular/core';

/** The selection of a chip group with no rule. */
export const EMPTY_SELECTION: readonly string[] = [];

/**
 * Whether two selections hold the same values in the same order.
 *
 * @param left - One selection.
 * @param right - The other.
 * @returns `true` when they match element for element.
 */
export function isSameSelection(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * A chip group's selection: written on click, re-seeded when the engine's committed selection changes.
 *
 * @remarks
 * Must be called in an injection context (a field initializer), like `linkedSignal` itself.
 *
 * @param read - Reads the committed selection off the engine's active rules.
 * @returns The writable selection.
 */
export function adoptSelection(read: () => readonly string[]): WritableSignal<readonly string[]> {
	const committed = computed<readonly string[]>(read, { equal: isSameSelection });

	return linkedSignal<readonly string[], readonly string[]>({ computation: (value) => value, source: committed });
}
