/**
 * `wine/facetState` — the one-way adopt every wine facet needs, and the reason this route cannot
 * paint the way the other two do.
 *
 * @remarks
 * ## The rule this file exists to hold
 *
 * `books/panel.ts` and `real-estate/panel.ts` repaint every control from the engine's committed rule
 * map on each change: a slider's position IS `rules.get('price')?.config`. That is correct on those
 * routes and is the framework-less dividend — no local state, so "clear all", removing a pill and
 * hydrating a shared link are all the same code path as a click.
 *
 * **Wine is worker-backed, and the same code would be visibly wrong.** `.core` mutations are
 * fire-and-forget; the rule map only reassigns after an awaited round trip against 130k records. A
 * control repainted from the engine would therefore flicker the chip back OFF, or snap the slider
 * handle backwards, for the length of that trip on every interaction.
 *
 * Every other wine vertical solves this the same way: local state, written on click, that ADOPTS the
 * engine's value when — and only when — the committed value actually changes. Svelte spells it as a
 * writable `$derived`; Vue as a `ref` plus a one-way `watch`; React as `useState` plus an effect
 * keyed on the rule. Framework-less there is no such construct, so it is this.
 *
 * ## The subtlety, which is the whole reason this is a helper rather than a line
 *
 * "Adopt the committed value on every update" is NOT the same thing, and it reintroduces the bug.
 * The panel repaints on every engine settle, including settles belonging to a different facet — and
 * between a click and its own round trip, this facet's committed value is still the OLD one.
 * Adopting it would snap the control back. Vue's `watch` is immune because it fires on CHANGE, and
 * an unchanged committed value is not a change; {@link createFacetAdopter} reproduces exactly that
 * by remembering the last committed value it saw.
 *
 * The painted write deliberately does not touch that memory. It is a claim about the screen, not
 * about the engine, and conflating the two would make the next genuine settle look redundant.
 *
 * ## Equality is by CONTENT, not identity
 *
 * The reactive verticals need an `EMPTY_SELECTION` constant so that an absent rule yields the same
 * array identity every evaluation — a referentially-new `[]` reads as a change and fires the watch
 * on every unrelated settle. Passing a comparator solves the same problem more directly, and covers
 * the case that constant cannot: two distinct arrays with identical contents, which is what a
 * re-derived selection produces.
 *
 * @packageDocumentation
 */

/** A facet's painted value, and its adoption of the engine's. */
export interface FacetAdopter<T> {
	/**
	 * Adopt the engine's committed value, if it has changed since the last one seen.
	 *
	 * @param committed - What the engine now holds for this facet.
	 * @returns `true` when the value was adopted — the caller repaints only then.
	 */
	readonly adopt: (committed: T) => boolean;
	/**
	 * Record what the control is now showing, ahead of the engine confirming it.
	 *
	 * @param next - The value the user just produced.
	 */
	readonly paint: (next: T) => void;
	/** The value the control should currently show. */
	readonly value: () => T;
}

/**
 * Build a facet's local painted state.
 *
 * @remarks
 * Seeded rather than empty, and that matters on this route specifically: `/wine` calls
 * `core.loadConfig(urlConfig)` before the panel is built, so a facet initialized blank would render
 * an unselected control over correctly-filtered results — and the next click would write a
 * one-element selection, silently dropping everything the shared link restored.
 *
 * @typeParam T - The facet's value type.
 * @param seed - The engine's committed value at construction time.
 * @param equals - Content equality for `T`. Defaults to `Object.is`, which is right for the scalar
 * facets and wrong for every array- or object-shaped one — see the module docblock.
 * @returns The adopter.
 */
export function createFacetAdopter<T>(
	seed: T,
	equals: (a: T, b: T) => boolean = Object.is,
): FacetAdopter<T> {
	/** What the control shows. */
	let painted = seed;
	/** The last committed value observed — the watch's memory, and NOT written by `paint`. */
	let lastCommitted = seed;

	return {
		adopt: (committed) => {
			if (equals(committed, lastCommitted)) {
				return false;
			}
			lastCommitted = committed;
			painted = committed;

			return true;
		},
		paint: (next) => {
			painted = next;
		},
		value: () => painted,
	};
}

/**
 * Content equality for the nullable numeric spans the sliders hold.
 *
 * @param a - One span, or `null` for "this facet carries no rule".
 * @param b - The other.
 * @returns Whether they describe the same span.
 */
export function sameSpan(
	a: { readonly max: number; readonly min: number } | null,
	b: { readonly max: number; readonly min: number } | null,
): boolean {
	if (a === null || b === null) {
		return a === b;
	}

	return Object.is(a.max, b.max) && Object.is(a.min, b.min);
}
