/**
 * The synthetic session corpus `/lab`'s suggestion pane learns from, and the pure decisions about
 * what to record and how to label what comes back.
 *
 * @remarks
 * React-free by design, so every decision here is unit-testable without a renderer — the same split
 * `labCandidates.ts` and `labSimilarity.ts` make.
 *
 * ### 🔴 Why there is a synthetic corpus at all, and why it is announced
 *
 * `useSuggestedFilters` reads a Bayesian model trained from a `SessionTracker`, and **session
 * recording is deliberately the engine's non-job** — it records nothing itself. A first-time visitor
 * therefore has zero sessions, and the cold-start branch does not rescue that: it ranks by marginal
 * popularity over `allKnownRules()`, which is itself derived from the tracker. No sessions means no
 * known rules means an empty list, which demonstrates nothing and reads as a broken feature.
 *
 * So the lab **seeds a labeled corpus and says so**. Seeding SILENTLY is ruled out, and the reason
 * is worth keeping next to the data: it would make the demo lie about where its numbers come from,
 * which is the same failure as `/about` advertising a feature with no button — one level down. {@link SYNTHETIC_SESSION_COUNT} is
 * exported so the pane can state the number rather than gesture at it.
 *
 * ### The seed is over LAB ids, and live recording is over the ENGINE's ids
 *
 * The books panel registers one rule per FACET — `genre`, `rating`, `publication-year` — so
 * co-occurrence over those ids answers "people who used the genre filter also used the rating
 * filter". True, and dull. The lab's own candidates are per-VALUE, which is the claim `/about`
 * actually makes ("narrowing to Napa and Cabernet surfaces 90+ points"), and each one already has a
 * button in the projections pane — so a suggestion is something the visitor can act on rather than
 * read.
 *
 * ⚠ **Live recording is NOT filtered to those ids.** A session is the engine's active rule set, and
 * `/lab` shares one cached engine with `/books`, so a visitor who arrives with filters applied has
 * those in their session — genuinely. Discarding them to keep the pane tidy would be seeding
 * silently in reverse: shaping the input so the output looks better. {@link describeSuggestion}
 * exists to label what comes back honestly instead.
 *
 * @packageDocumentation
 */

import type { RuleId } from '@filter-enginez/core';
import type { SessionTracker } from '@filter-enginez/core/suggestions';

import { LAB_CANDIDATES } from './labCandidates.js';

/**
 * Prior filter sessions, invented for the demo.
 *
 * @remarks
 * Twelve sessions over the five lab candidates, shaped so the two strongest conditionals are
 * legible from the data rather than emergent from noise:
 *
 *   - `P(published 2010+ | fantasy)` = 4/6 ≈ 0.67
 *   - `P(rated 4.5+ | poetry)` = 3/4 = 0.75
 *
 * Twelve is chosen to be small enough that a reader can check the arithmetic against this array and
 * large enough that the noisy-OR combination has something to combine. It is not sampled from
 * anything — see the module docblock; the pane says so on screen.
 */
export const SYNTHETIC_SESSIONS: readonly (readonly RuleId[])[] = [
	['lab-genre-fantasy', 'lab-year-modern'],
	['lab-genre-fantasy', 'lab-year-modern'],
	['lab-genre-fantasy', 'lab-year-modern', 'lab-format-audiobook'],
	['lab-genre-fantasy', 'lab-format-audiobook'],
	['lab-genre-fantasy', 'lab-year-modern'],
	['lab-genre-poetry', 'lab-rating-high'],
	['lab-genre-poetry', 'lab-rating-high'],
	['lab-genre-poetry', 'lab-rating-high', 'lab-year-modern'],
	['lab-rating-high', 'lab-year-modern'],
	['lab-format-audiobook', 'lab-year-modern'],
	['lab-genre-fantasy', 'lab-rating-high'],
	['lab-genre-poetry'],
];

/** How many prior sessions the model was seeded with. The pane states this number on screen. */
export const SYNTHETIC_SESSION_COUNT = SYNTHETIC_SESSIONS.length;

/**
 * Trackers this module has already seeded.
 *
 * @remarks
 * 🔴 **Seeding must be idempotent, and nothing else makes it so.** `attachSuggestions` memoizes its
 * trio per engine in a `WeakMap`, and `bootBooksEngine` caches its engine in a module-level promise
 * — so the tracker outlives any component. Seeding on mount without this guard would add twelve
 * sessions every time the visitor navigated back to `/lab`, and the corpus size the pane proudly
 * displays would climb 12, 24, 36 while the probabilities quietly stopped meaning anything. Weak
 * keys so a discarded engine's tracker does not pin this set.
 *
 * @internal
 */
const SEEDED = new WeakSet<SessionTracker>();

/**
 * Seed a tracker with {@link SYNTHETIC_SESSIONS}, once.
 *
 * @param tracker - The tracker to seed.
 * @returns `true` when this call did the seeding, `false` when it had already been done.
 */
export function seedSyntheticSessions(tracker: SessionTracker): boolean {
	if (SEEDED.has(tracker)) {
		return false;
	}
	SEEDED.add(tracker);

	for (const session of SYNTHETIC_SESSIONS) {
		tracker.recordSession(session);
	}

	return true;
}

/**
 * Whether an active rule set is worth recording as a session.
 *
 * @remarks
 * Two rejections, both of which would otherwise corrupt the model rather than merely pad it:
 *
 *   - **The empty set.** Every visitor passes through it, on arrival and after clearing filters, so
 *     recording it would make "no filters" the most popular state in the corpus while contributing
 *     no co-occurrence at all. It would drag every marginal down for nothing.
 *   - **A repeat of the last recorded set.** A re-render, a navigation, or a rule toggled off and
 *     back on all re-present the same set; counting it again inflates that combination's weight
 *     purely as a function of how long somebody sat on the page.
 *
 * @param candidate - The engine's current active rule ids.
 * @param lastRecorded - The set recorded most recently, if any.
 * @returns Whether to record `candidate`.
 */
export function shouldRecordSession(
	candidate: readonly RuleId[],
	lastRecorded: undefined | readonly RuleId[],
): boolean {
	if (candidate.length === 0) {
		return false;
	}
	if (lastRecorded === undefined) {
		return true;
	}

	return !isSameRuleSet(candidate, lastRecorded);
}

/**
 * Set equality over rule ids, order-independent.
 *
 * @remarks
 * Order-independence is the point: `activeRuleIds` reflects insertion order, so toggling a rule off
 * and back on returns the same SET in a different order. Comparing sequences would call that a new
 * session and record a duplicate — exactly the inflation {@link shouldRecordSession} rejects.
 *
 * @internal
 */
function isSameRuleSet(left: readonly RuleId[], right: readonly RuleId[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	const rightSet = new Set(right);

	return left.every((id) => rightSet.has(id));
}

/** How a suggested rule id should be presented. */
export interface SuggestionDescription {
	/** Whether `/lab` has a control for this rule, so the visitor can act on the suggestion. */
	readonly hasLabControl: boolean;
	/** Human label for the rule. */
	readonly label: string;
}

/**
 * Resolve a suggested rule id to something a reader can act on or at least understand.
 *
 * @remarks
 * A suggestion naming `lab-rating-high` is actionable — the projections pane has a button for it.
 * One naming `publication-year` is not: that rule came from the books panel via the shared engine,
 * and `/lab` has no control for it. Rendering both as bare ids would be the pane over-claiming;
 * rendering only the actionable ones would be the pane hiding real output. So both are shown and
 * the difference is stated.
 *
 * The fallback de-hyphenates rather than inventing a name, because a books-panel id is already
 * close to readable and a lookup table would be a second place for those labels to live.
 *
 * @param ruleId - The rule id the suggestion engine returned.
 * @returns The label and whether the lab can act on it.
 */
export function describeSuggestion(ruleId: RuleId): SuggestionDescription {
	const candidate = LAB_CANDIDATES.find((entry) => entry.ruleId === ruleId);

	if (candidate !== undefined) {
		return { hasLabControl: true, label: candidate.label };
	}

	return { hasLabControl: false, label: ruleId.replace(/-/gu, ' ') };
}

/**
 * Format a suggestion's joint probability for display.
 *
 * @param probability - Joint probability in `(0, 1]`.
 * @returns A whole-percent string, e.g. `67%`.
 */
export function formatProbability(probability: number): string {
	return `${Math.round(probability * 100).toString()}%`;
}
