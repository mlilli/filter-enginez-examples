/**
 * Tests for the wine panel's one-way adopt.
 *
 * @remarks
 * This is the mechanism the mounted-panel suite cannot fully exercise: its engine is main-thread, so
 * a committed value is never stale for long enough to matter. Over a worker it is stale on every
 * single interaction, and the difference between "adopt on change" and "adopt on every update" is
 * the difference between a panel that works and one where every click flickers back.
 *
 * The cases are written as the sequences that actually happen on the wire, not as unit calls: what
 * distinguishes a correct adopter from a wrong one is ORDER.
 */

import { describe, expect, it } from 'vitest';

import { createFacetAdopter, sameSpan } from './facetState.js';

/** Array-content equality, as the chip and origin facets pass in. */
const sameValues = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((entry, index) => entry === b[index]);

describe('createFacetAdopter', () => {
	it('seeds from the committed value rather than empty', () => {
		// `/wine` calls `loadConfig` for a shared `?f` link BEFORE the panel is built. A facet
		// initialized blank would render an unselected control over correctly-filtered results, and the
		// next click would write a one-element selection, silently dropping what the link restored.
		const adopter = createFacetAdopter<readonly string[]>(['red', 'white'], sameValues);

		expect(adopter.value()).toEqual(['red', 'white']);
	});

	it('keeps the painted value when a settle carries the PRE-CLICK committed value', () => {
		// The whole point. Between a click and its own round trip, this facet's committed value is
		// still the old one — and a settle belonging to a different facet arrives carrying it.
		const adopter = createFacetAdopter<readonly string[]>([], sameValues);

		adopter.paint(['red']);
		// The settle in flight when the user clicked: the engine still holds nothing for this facet.
		expect(adopter.adopt([])).toBe(false);
		expect(adopter.value()).toEqual(['red']);
	});

	it('adopts once the engine confirms, and reports it so the caller repaints', () => {
		const adopter = createFacetAdopter<readonly string[]>([], sameValues);

		adopter.paint(['red']);
		adopter.adopt([]);

		expect(adopter.adopt(['red'])).toBe(true);
		expect(adopter.value()).toEqual(['red']);
	});

	it('adopts a change made ELSEWHERE — a pill removed, or a preset clearing the facets', () => {
		// The other half of the contract: local paint must not make the facet deaf. Removing a chip
		// from the results header writes the engine directly, and this control has to follow.
		const adopter = createFacetAdopter<readonly string[]>(['red'], sameValues);

		expect(adopter.adopt([])).toBe(true);
		expect(adopter.value()).toEqual([]);
	});

	it('compares by content, so a re-derived identical array is not a change', () => {
		// The reactive verticals need an `EMPTY_SELECTION` constant to get this: a referentially-new
		// `[]` reads as a change and fires their watch on every unrelated settle. A comparator covers
		// the case that constant cannot — two distinct arrays with identical contents.
		const adopter = createFacetAdopter<readonly string[]>(['red'], sameValues);

		expect(adopter.adopt(['red'])).toBe(false);
	});

	it('defaults to identity equality, which is what the scalar facets want', () => {
		const adopter = createFacetAdopter<string>('');

		expect(adopter.adopt('')).toBe(false);
		expect(adopter.adopt('red')).toBe(true);
		expect(adopter.value()).toBe('red');
	});
});

describe('sameSpan', () => {
	it('treats absence as distinct from any span', () => {
		// `null` means "this facet carries no rule", which is not the same claim as a span that happens
		// to cover the whole baseline — and conflating them would make clearing a slider invisible.
		expect(sameSpan(null, { max: 10, min: 0 })).toBe(false);
		expect(sameSpan({ max: 10, min: 0 }, null)).toBe(false);
		expect(sameSpan(null, null)).toBe(true);
	});

	it('compares both edges', () => {
		expect(sameSpan({ max: 10, min: 0 }, { max: 10, min: 0 })).toBe(true);
		expect(sameSpan({ max: 10, min: 0 }, { max: 10, min: 1 })).toBe(false);
		expect(sameSpan({ max: 10, min: 0 }, { max: 11, min: 0 })).toBe(false);
	});
});
