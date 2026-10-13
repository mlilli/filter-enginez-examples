/**
 * Tests for `<SuggestionPane />` — the pane that drives `useSuggestedFilters`.
 *
 * @remarks
 * Mounted over a real signals engine and the real `attachSuggestions` trio. The pane's whole claim
 * is that a Bayesian model ranks filters from a corpus it states the size of, so a stubbed model
 * would leave both halves of that claim untested.
 *
 * ### Timers are faked because the recording half is debounced
 *
 * Recording waits for the selection to hold still. Without fake timers the "it records" case would
 * either sleep for real or assert nothing, and the "it does NOT record early" case — the one that
 * proves the debounce exists at all — could not be written.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { attachSuggestions } from '@filter-enginez/core/suggestions';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SYNTHETIC_SESSION_COUNT } from './labSessions.js';
import { SuggestionPane } from './SuggestionPane.js';

/** Comfortably past the pane's debounce window. */
const PAST_DEBOUNCE_MS = 2_000;

/** Engines minted per test, torn down after it. */
const engines: SignalsEngine<Book>[] = [];

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	// Unmount before dispose so effect cleanups run against a live engine. Explicit because the root
	// config sets no `globals: true`, so Testing Library registers no automatic cleanup.
	cleanup();
	while (engines.length > 0) {
		engines.pop()?.dispose();
	}
	vi.useRealTimers();
});

const books = [
	{ format: 'hardcover', genre: 'fantasy', id: 'a', title: 'A' },
	{ format: 'ebook', genre: 'fantasy', id: 'b', title: 'B' },
	{ format: 'paperback', genre: 'poetry', id: 'c', title: 'C' },
] as unknown as readonly Book[];

/** A fresh engine over {@link books}, registered for teardown. */
function makeEngine(): SignalsEngine<Book> {
	const engine = createSignalsEngine(createFilterEngine<Book>({ sourceData: books }));

	engines.push(engine);

	return engine;
}

/** Mount the pane over `engine`. */
function mountPane(engine: SignalsEngine<Book>): void {
	render(
		<FilterEngineProvider engine={engine as unknown as SignalsEngine<unknown>}>
			<SuggestionPane />
		</FilterEngineProvider>,
	);
}

/** The pane's corpus-provenance line. */
function provenance(): string {
	return screen.getByText(/sessions in the model/u).textContent;
}

/**
 * The corpus size the pane is currently reporting.
 *
 * @remarks
 * Parsed rather than substring-matched, deliberately. The line reads
 * `12 sessions in the model: 12 are synthetic…`, so a `toContain('12')` assertion passes against a
 * corpus that has doubled to 24 — the synthetic half still says 12. The re-seed guard is exactly what
 * that assertion would be watching, so it would stay green over the very defect it exists to catch.
 *
 * @returns The leading count, or `NaN` when the line does not start with one.
 */
function reportedSessionCount(): number {
	return Number.parseInt(/^(\d+)/u.exec(provenance())?.[1] ?? '', 10);
}

/**
 * How many sessions the pane is admitting are synthetic.
 *
 * @remarks
 * Added after mutant C11 SURVIVED. The seeding case asserted `toContain('synthetic')`, which is
 * satisfied by the sentence "0 are synthetic" — so the pane could have understated its invented
 * corpus to nothing and stayed green. That number IS the honesty claim this pane was built around:
 * seeding silently was rejected, and a demo that seeds twelve sessions while reporting none is
 * seeding silently with extra steps.
 *
 * @returns The admitted synthetic count, or `NaN` when the line does not state one.
 */
function reportedSyntheticCount(): number {
	return Number.parseInt(/:\s*(\d+)\s+are synthetic/u.exec(provenance())?.[1] ?? '', 10);
}

/** The rendered suggestion rows, as text. */
function suggestionTexts(): string[] {
	return screen.queryAllByRole('listitem').map((row) => row.textContent);
}

describe('SuggestionPane', () => {
	it('seeds the model and states the corpus size AND its synthetic share', () => {
		// The standing condition: a suggestion ranking with no visible corpus size is a number the
		// reader cannot calibrate, and an unannounced synthetic corpus is the option that was rejected.
		mountPane(makeEngine());

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT);
		expect(reportedSyntheticCount()).toBe(SYNTHETIC_SESSION_COUNT);
		expect(suggestionTexts().length).toBeGreaterThan(0);
	});

	it('ranks a real suggestion for the current selection', () => {
		const engine = makeEngine();

		act(() => {
			engine.core.addRule('lab-genre-fantasy', inSet<Book['genre']>('genre', ['fantasy']));
		});
		mountPane(engine);

		// The seeded corpus makes "Published 2010+" the strongest pairing with Fantasy, at 67%.
		const rows = suggestionTexts();

		expect(rows.some((text) => text.includes('Published 2010+'))).toBe(true);
		expect(rows.some((text) => text.includes('%'))).toBe(true);
	});

	it('does NOT re-seed when the pane remounts on the same engine', () => {
		// The regression the WeakSet guard exists for, observed through the pane rather than the
		// helper: navigating away and back must not grow the corpus by another twelve.
		const engine = makeEngine();

		mountPane(engine);

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT);

		cleanup();
		mountPane(engine);

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT);
	});

	it('records a settled selection and says how many sessions are the visitor’s own', () => {
		const engine = makeEngine();

		mountPane(engine);

		expect(provenance()).toContain('Change a filter and yours will be added.');

		act(() => {
			engine.core.addRule('lab-genre-fantasy', inSet<Book['genre']>('genre', ['fantasy']));
		});
		act(() => {
			vi.advanceTimersByTime(PAST_DEBOUNCE_MS);
		});

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT + 1);
		expect(provenance()).toContain('1 is yours');
	});

	it('does NOT record before the selection has settled', () => {
		// The case that proves the debounce is real. Without it, "records after 2s" would also pass
		// against an implementation that recorded synchronously on every change.
		const engine = makeEngine();

		mountPane(engine);

		act(() => {
			engine.core.addRule('lab-genre-fantasy', inSet<Book['genre']>('genre', ['fantasy']));
		});
		act(() => {
			vi.advanceTimersByTime(200);
		});

		expect(provenance()).toContain('Change a filter and yours will be added.');
	});

	it('never records the empty selection every visitor passes through', () => {
		const engine = makeEngine();

		mountPane(engine);

		act(() => {
			vi.advanceTimersByTime(PAST_DEBOUNCE_MS);
		});

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT);
		expect(provenance()).toContain('Change a filter and yours will be added.');
	});

	it('pluralizes the visitor’s own share once there is more than one', () => {
		// The `is`/`are` arm, which one recorded session cannot reach. Two DISTINCT selections, because
		// `shouldRecordSession` rejects a repeat — a version of this case that toggled the same rule
		// twice would record once and quietly assert the singular branch again.
		const engine = makeEngine();

		mountPane(engine);

		act(() => {
			engine.core.addRule('lab-genre-fantasy', inSet<Book['genre']>('genre', ['fantasy']));
		});
		act(() => {
			vi.advanceTimersByTime(PAST_DEBOUNCE_MS);
		});
		act(() => {
			engine.core.addRule('lab-format-audiobook', inSet<Book['format']>('format', ['ebook']));
		});
		act(() => {
			vi.advanceTimersByTime(PAST_DEBOUNCE_MS);
		});

		expect(reportedSessionCount()).toBe(SYNTHETIC_SESSION_COUNT + 2);
		expect(provenance()).toContain('2 are yours');
	});

	it('says the model has nothing to add when everything it knows is already applied', () => {
		// The empty arm, which a seeded corpus otherwise never reaches. Applying every rule the model
		// knows about leaves it with no candidate it is allowed to return — a real state, and one the
		// pane must distinguish from "the feature is broken".
		const engine = makeEngine();

		act(() => {
			for (const ruleId of [
				'lab-genre-fantasy',
				'lab-genre-poetry',
				'lab-format-audiobook',
				'lab-year-modern',
				'lab-rating-high',
			]) {
				engine.core.addRule(ruleId, inSet<Book['genre']>('genre', ['fantasy']));
			}
		});
		mountPane(engine);

		expect(screen.getByText(/nothing to add to this selection/u)).toBeDefined();
		expect(suggestionTexts()).toEqual([]);
	});

	it('marks a suggestion the lab has no control for rather than hiding or faking it', () => {
		// Reachable because /lab and /books share one cached engine. Simulated here by pre-recording
		// sessions that pair a lab candidate with a books-panel rule id, exactly as a visitor
		// arriving from /books would have produced.
		const engine = makeEngine();
		const { sessionTracker } = attachSuggestions(engine.core);

		for (let i = 0; i < 6; i++) {
			sessionTracker.recordSession(['lab-genre-fantasy', 'publication-year']);
		}
		act(() => {
			engine.core.addRule('lab-genre-fantasy', inSet<Book['genre']>('genre', ['fantasy']));
		});
		mountPane(engine);

		const rows = suggestionTexts();

		expect(rows.some((text) => text.includes('publication year'))).toBe(true);
		expect(rows.some((text) => text.includes('no control here'))).toBe(true);
	});
});
