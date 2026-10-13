/**
 * Tests for the `/lab` candidate set and its two pure formatters.
 *
 * @remarks
 * These need no renderer, which is the point of the module existing separately: the decisions the
 * pane makes are testable without mounting anything, and the pane above them holds no logic beyond
 * mapping a list to components.
 *
 * @packageDocumentation
 */

import { InSetRule, RangeRule } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { describeDelta, formatProjection, LAB_CANDIDATES } from './labCandidates.js';

describe('LAB_CANDIDATES', () => {
	it('gives every candidate a unique rule id', () => {
		// Two candidates sharing an id would silently collide: committing one would replace the
		// other's committed rule AND its projection, because `withRule` is keyed by id. The pane
		// would look like it had lost a row rather than like it had a duplicate.
		const ruleIds = LAB_CANDIDATES.map((candidate) => candidate.ruleId);

		expect(new Set(ruleIds).size).toBe(ruleIds.length);
	});

	it('namespaces every rule id so a candidate cannot collide with a books panel rule', () => {
		// `/lab` shares ONE engine with `/books` — same cached boot, same rule map. An unprefixed
		// `genre` here would overwrite the books panel's genre rule for a visitor who navigated
		// between the two, and the corruption would only show up after a route change.
		const unprefixed = LAB_CANDIDATES.filter((candidate) => !candidate.ruleId.startsWith('lab-'));

		expect(unprefixed.map((candidate) => candidate.ruleId)).toEqual([]);
	});

	it('holds ONE stable rule instance per candidate rather than rebuilding on read', () => {
		// The property `useSimulation`'s memo depends on. Reading the list twice must yield the same
		// instances, or every render would bust the memo — correctly, and invisibly, since the
		// engine's own cache key is content-based and would still answer from cache.
		const first = LAB_CANDIDATES.map((candidate) => candidate.rule);
		const second = LAB_CANDIDATES.map((candidate) => candidate.rule);

		expect(first.every((rule, index) => rule === second[index])).toBe(true);
	});

	it('spans both the discrete and continuous rule shapes', () => {
		// Not decoration: the exclusion short-circuit that makes `wouldBeEmpty` cheap only fires for
		// discrete set rules, so a candidate list of ranges alone would never exercise the branch the
		// pane exists to show.
		expect(LAB_CANDIDATES.some((candidate) => candidate.rule instanceof InSetRule)).toBe(true);
		expect(LAB_CANDIDATES.some((candidate) => candidate.rule instanceof RangeRule)).toBe(true);
	});
});

describe('formatProjection', () => {
	it('reports the engine verdict as words rather than as a zero', () => {
		expect(formatProjection(0, true)).toBe('no results');
	});

	it('prefers the verdict even when a count is present', () => {
		// `wouldBeEmpty` is the engine's own answer and can arrive WITHOUT a count having been taken —
		// the exclusion short-circuit returns `{ resultCount: 0, wouldBeEmpty: true }` without
		// intersecting anything. A formatter that read the count first would present a computed zero
		// where the engine had refused to compute.
		expect(formatProjection(12, true)).toBe('no results');
	});

	it('singularizes exactly one book', () => {
		expect(formatProjection(1, false)).toBe('1 book');
	});

	it('pluralizes and groups larger counts', () => {
		expect(formatProjection(1234, false)).toBe('1,234 books');
	});

	it('pluralizes a counted zero, which is not the same statement as the verdict', () => {
		expect(formatProjection(0, false)).toBe('0 books');
	});
});

describe('describeDelta', () => {
	it('refuses to compute a ratio against an empty baseline', () => {
		// Division by zero would render `Infinity%` or `NaN%`, both of which read as a bug in the
		// engine rather than as an absent denominator.
		expect(describeDelta(40, 0)).toBe('no baseline');
	});

	it('names an unchanged projection rather than printing a signed zero', () => {
		expect(describeDelta(500, 500)).toBe('no change');
	});

	it('reports a narrowing with a minus sign', () => {
		expect(describeDelta(250, 1000)).toBe('−75%');
	});

	it('reports a widening with a plus sign', () => {
		// Reachable, not hypothetical: `withRule` REPLACES a rule of the same id, so projecting a
		// wider version of an already-committed candidate legitimately grows the set.
		expect(describeDelta(1500, 1000)).toBe('+50%');
	});

	it('rounds rather than truncating, so a near-total wipe is not reported as no change', () => {
		expect(describeDelta(996, 1000)).toBe('−0%');
		expect(describeDelta(1, 1000)).toBe('−100%');
	});

	it('uses a true minus sign rather than a hyphen', () => {
		// The design system's numerics are mono-spaced; a hyphen-minus is visibly narrower than the
		// U+2212 the rest of the UI uses, and mixing them in a column is the kind of thing nobody
		// files a bug for and everybody notices.
		expect(describeDelta(250, 1000).startsWith('−')).toBe(true);
	});
});
