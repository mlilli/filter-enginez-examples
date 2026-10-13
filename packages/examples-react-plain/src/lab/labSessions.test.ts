/**
 * Tests for `labSessions.ts` — the synthetic seed corpus and the pure recording / labeling
 * decisions around it.
 *
 * @remarks
 * The seed corpus is asserted through a REAL `SessionTracker` + `SuggestionEngine` rather than by
 * re-counting the array. Re-counting would restate the fixture in a second place and pass whether
 * or not the engine agreed; running the model is what shows the corpus actually teaches it the two
 * associations its docblock claims.
 *
 * @packageDocumentation
 */

import { attachSuggestions, SessionTracker } from '@filter-enginez/core/suggestions';
import { describe, expect, it } from 'vitest';

import {
	describeSuggestion,
	formatProbability,
	seedSyntheticSessions,
	shouldRecordSession,
	SYNTHETIC_SESSION_COUNT,
	SYNTHETIC_SESSIONS,
} from './labSessions.js';

describe('seedSyntheticSessions', () => {
	it('seeds a tracker exactly once, however many times it is asked', () => {
		// 🔴 The regression this exists for: `attachSuggestions` memoizes its trio per engine and the
		// books engine is cached in a module-level promise, so the tracker outlives every component.
		// Without the guard, navigating back to /lab would add another twelve sessions each time and
		// the corpus size the pane displays would climb while the probabilities stopped meaning
		// anything — with nothing failing anywhere.
		const tracker = new SessionTracker();

		expect(seedSyntheticSessions(tracker)).toBe(true);
		expect(tracker.size).toBe(SYNTHETIC_SESSION_COUNT);

		expect(seedSyntheticSessions(tracker)).toBe(false);
		expect(tracker.size).toBe(SYNTHETIC_SESSION_COUNT);

		expect(seedSyntheticSessions(tracker)).toBe(false);
		expect(tracker.size).toBe(SYNTHETIC_SESSION_COUNT);
	});

	it('seeds a DIFFERENT tracker independently', () => {
		// The guard is per tracker, not a module-level "already ran" flag — two engines on one page
		// must each get a corpus.
		const first = new SessionTracker();
		const second = new SessionTracker();

		seedSyntheticSessions(first);

		expect(seedSyntheticSessions(second)).toBe(true);
		expect(second.size).toBe(SYNTHETIC_SESSION_COUNT);
	});

	it('teaches the model the two associations the corpus was shaped to carry', () => {
		// Run through the real suggestion engine rather than counting the array back. The corpus
		// docblock claims P(2010+ | fantasy) ~ 0.67 and P(4.5+ | poetry) = 0.75; if a session were
		// edited without updating that reasoning, this is what notices.
		const engine = {};
		const { sessionTracker, suggestions } = attachSuggestions(engine);

		seedSyntheticSessions(sessionTracker);

		expect(suggestions.getSuggestions(['lab-genre-fantasy'], 1)[0]?.ruleId).toBe('lab-year-modern');
		expect(suggestions.getSuggestions(['lab-genre-poetry'], 1)[0]?.ruleId).toBe('lab-rating-high');
	});

	it('never suggests a rule the visitor already has applied', () => {
		const engine = {};
		const { sessionTracker, suggestions } = attachSuggestions(engine);

		seedSyntheticSessions(sessionTracker);

		const ranked = suggestions.getSuggestions(['lab-genre-fantasy', 'lab-year-modern'], 3);

		expect(ranked.map((entry) => entry.ruleId)).not.toContain('lab-genre-fantasy');
		expect(ranked.map((entry) => entry.ruleId)).not.toContain('lab-year-modern');
	});

	it('gives a first-time visitor with NO selection something to look at', () => {
		// The whole reason the seed exists. With an empty tracker this is `[]` — the cold-start branch
		// ranks over `allKnownRules()`, which is derived from the tracker, so no sessions means no
		// known rules means an empty pane that reads as a broken feature.
		const seeded = attachSuggestions({});

		seedSyntheticSessions(seeded.sessionTracker);

		expect(seeded.suggestions.getSuggestions([], 3).length).toBeGreaterThan(0);
		expect(attachSuggestions({}).suggestions.getSuggestions([], 3)).toEqual([]);
	});
});

describe('SYNTHETIC_SESSIONS', () => {
	it('records only lab-candidate ids, so every seeded suggestion is actionable', () => {
		// A seeded id with no control in the lab would surface a suggestion the visitor cannot act on
		// and cannot attribute to their own filtering either — the worst of both halves.
		for (const session of SYNTHETIC_SESSIONS) {
			for (const ruleId of session) {
				expect(describeSuggestion(ruleId).hasLabControl).toBe(true);
			}
		}
	});

	it('is not vacuous — the corpus has sessions and they have rules in them', () => {
		// The loop above passes trivially over an empty array, and over an array of empty arrays.
		expect(SYNTHETIC_SESSIONS.length).toBe(SYNTHETIC_SESSION_COUNT);
		expect(SYNTHETIC_SESSION_COUNT).toBeGreaterThan(0);
		expect(SYNTHETIC_SESSIONS.every((session) => session.length > 0)).toBe(true);
	});
});

describe('shouldRecordSession', () => {
	it('records the first non-empty selection it sees', () => {
		expect(shouldRecordSession(['a'], undefined)).toBe(true);
	});

	it('refuses the empty selection, which every visitor passes through', () => {
		expect(shouldRecordSession([], undefined)).toBe(false);
		expect(shouldRecordSession([], ['a'])).toBe(false);
	});

	it('refuses a repeat of the last recorded set', () => {
		expect(shouldRecordSession(['a', 'b'], ['a', 'b'])).toBe(false);
	});

	it('treats a REORDERED set as the same set', () => {
		// `activeRuleIds` reflects insertion order, so toggling a rule off and back on returns the
		// same set in a different order. A sequence comparison would record a duplicate, inflating
		// that combination purely as a function of fidgeting.
		expect(shouldRecordSession(['b', 'a'], ['a', 'b'])).toBe(false);
	});

	it('records a set that genuinely changed', () => {
		expect(shouldRecordSession(['a', 'b'], ['a'])).toBe(true);
		expect(shouldRecordSession(['a'], ['a', 'b'])).toBe(true);
		expect(shouldRecordSession(['a'], ['b'])).toBe(true);
	});
});

describe('describeSuggestion', () => {
	it('labels a lab candidate with its own short label and marks it actionable', () => {
		expect(describeSuggestion('lab-genre-fantasy')).toEqual({ hasLabControl: true, label: 'Fantasy' });
	});

	it('labels a books-panel rule readably and marks it as having no control here', () => {
		// Reachable because /lab and /books share one cached engine: a visitor arriving with filters
		// applied puts those ids into their recorded sessions, so the model can rank them.
		expect(describeSuggestion('publication-year')).toEqual({
			hasLabControl: false,
			label: 'publication year',
		});
	});
});

describe('formatProbability', () => {
	it('renders whole percent', () => {
		expect(formatProbability(0.6667)).toBe('67%');
		expect(formatProbability(1)).toBe('100%');
		expect(formatProbability(0.004)).toBe('0%');
	});
});
