/**
 * `useSeedAndAdopt` — local state SEEDED from a value the engine has committed and RE-ADOPTED whenever
 * that value changes from outside, so an optimistic paint can run ahead of the engine in between.
 *
 * @remarks
 * Every control whose click has to paint before the engine confirms it — the chip groups, checkbox
 * lists and tree pickers of all three panels, and the devtools timeline cursor — needs the same three
 * things:
 *
 *   1. **Seed** from what the engine already holds, so a `?f` restore or a JSON config arrives with the
 *      right controls lit.
 *   2. **Paint** a click at once, through the returned setter, rather than after the worker or server
 *      round trip confirms it.
 *   3. **Adopt** the engine's value whenever it changes for any other reason — clear-all, a removed
 *      header chip, time travel — so the control never shows a selection that is no longer applied.
 *
 * ### Why adoption happens during render, not in an effect
 *
 * Adopting in a `useEffect` keyed on the committed value would reach the right state, but only after
 * rendering every external change twice: once with the stale local value, then again once the effect
 * has run. Comparing against the value last adopted and updating during render
 * is the React docs' answer to "adjusting some state when a prop changes": React throws the
 * in-progress output away and re-renders straight away, before any child renders and before anything
 * reaches the DOM.
 *
 * The change test is `Object.is`, the comparison an effect's dependency array uses, so adoption is
 * considered on exactly the changes such an effect would run for — including a new array with the same
 * members. `isEquivalent` then decides whether such a value replaces the local one.
 *
 * ### The one requirement on callers
 *
 * `committed` must keep its identity while it is unchanged: a shared empty constant, never an inline
 * `?? []`. A fresh value on every render would read as an external change on every render, and since
 * adopting it schedules another render, React stops that loop with "Too many re-renders" — where the
 * old effect merely re-ran each time.
 *
 * @packageDocumentation
 */

import { type Dispatch, type SetStateAction, useState } from 'react';

/**
 * Hold a local, optimistically-paintable copy of an engine-committed value.
 *
 * @typeParam T - The committed value's type. Must not be a function, which `useState` would call as an
 *   initializer.
 * @param committed - The engine's current value. Must be referentially stable while unchanged — see the
 *   module remarks.
 * @param isEquivalent - Whether the local value already matches a newly committed one, in which case the
 *   local value (and its identity) is kept. Defaults to `Object.is`. The panels pass a member-wise
 *   comparison, so an engine echo of the selection the user just painted never replaces it.
 * @returns The local value, and the setter the optimistic paint calls.
 */
export function useSeedAndAdopt<T>(
	committed: T,
	isEquivalent: (local: T, committed: T) => boolean = Object.is,
): [T, Dispatch<SetStateAction<T>>] {
	const [local, setLocal] = useState<T>(committed);
	const [lastAdopted, setLastAdopted] = useState<T>(committed);

	if (!Object.is(lastAdopted, committed)) {
		setLastAdopted(committed);

		if (!isEquivalent(local, committed)) {
			setLocal(committed);
		}
	}

	return [local, setLocal];
}
