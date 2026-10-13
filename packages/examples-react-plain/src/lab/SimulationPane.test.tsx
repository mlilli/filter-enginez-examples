/**
 * Tests for `<SimulationPane />` — the pane that drives `useSimulation`.
 *
 * @remarks
 * Mounted over a REAL signals engine and a small books-shaped corpus, not a fake: the whole claim
 * of the pane is that the engine answers projections, so a stubbed engine would test the JSX and
 * assert nothing about the feature.
 *
 * ### Queries are scoped to a ROW, and that is not fussiness
 *
 * Three of the five candidates project `3 books` against this corpus, so a bare
 * `getByText('3 books')` is ambiguous — and worse, an ambiguity that resolves differently as the
 * fixture changes. {@link rowText} finds the row by its label through the `listitem` role and reads
 * that row's own text, so each assertion names the candidate it is about.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SimulationPane } from './SimulationPane.js';

/** Engines minted per test, torn down after it. */
const engines: SignalsEngine<Book>[] = [];

afterEach(() => {
	// Unmount first so effect cleanups run against a live engine, THEN dispose — the order
	// `react-signals`' own harness uses. Explicit because the root config sets no `globals: true`,
	// so Testing Library registers no automatic cleanup and renders otherwise accumulate in one
	// document (the "Found multiple elements" failure, which reads as an ambiguous query).
	cleanup();
	while (engines.length > 0) {
		engines.pop()?.dispose();
	}
});

/**
 * A corpus shaped so the candidates produce hand-checkable counts, and so at least one COMBINATION
 * is genuinely empty.
 *
 * @remarks
 * ⚠ The empty case is constructed rather than hoped for. A verification mutant once survived
 * because a fixture's bounds happened to coincide with the baseline, so two different behaviors
 * produced identical output. Here `poetry` is a single book rated 2.0, so committing Poetry makes
 * the `Rated 4.5+` projection empty — the only way to exercise `wouldBeEmpty` against a real engine
 * rather than against the formatter in isolation.
 */
const books = [
	{ averageRating: 4.8, format: 'hardcover', genre: 'fantasy', publicationYear: 2015, title: 'A' },
	{ averageRating: 4.6, format: 'ebook', genre: 'fantasy', publicationYear: 2012, title: 'B' },
	{ averageRating: 3.1, format: 'audiobook', genre: 'fantasy', publicationYear: 2001, title: 'C' },
	{ averageRating: 2.0, format: 'paperback', genre: 'poetry', publicationYear: 1998, title: 'D' },
	{ averageRating: 4.9, format: 'audiobook', genre: 'history', publicationYear: 2020, title: 'E' },
] as unknown as readonly Book[];

/** Mount the pane over a real engine carrying {@link books}. */
function mountPane(): SignalsEngine<Book> {
	const engine = createSignalsEngine(createFilterEngine<Book>({ sourceData: books }));

	engines.push(engine);
	render(
		<FilterEngineProvider engine={engine as unknown as SignalsEngine<unknown>}>
			<SimulationPane />
		</FilterEngineProvider>,
	);

	return engine;
}

/**
 * The full text of the candidate row carrying `label`.
 *
 * @param label - The candidate's short label, e.g. `Fantasy`.
 * @returns That row's text content, or the empty string when no row carries the label.
 */
function rowText(label: string): string {
	return findRow(label).textContent;
}

/** The pane's live result-count line. */
function liveLine(): string {
	return screen.getByText(/match the current filters/u).textContent;
}

/** The commit button inside the row carrying `label`. */
function commitButton(label: string): HTMLElement {
	return within(findRow(label)).getByRole('button');
}

/**
 * The candidate row carrying `label`, or a throw naming the label that was not found.
 *
 * @remarks
 * Throwing beats returning `undefined` and letting the assertion fail on an empty string: a typo'd
 * label would otherwise read as "the pane rendered the wrong number" rather than as "there is no
 * such row", and those are very different bugs to go looking for.
 *
 * @param label - The candidate's short label, e.g. `Fantasy`.
 * @returns The `<li>` for that candidate.
 */
function findRow(label: string): HTMLElement {
	const row = screen.getAllByRole('listitem').find((item) => item.textContent.includes(label));

	if (row === undefined) {
		throw new Error(`no candidate row labeled ${label}`);
	}

	return row;
}

describe('SimulationPane', () => {
	it('projects a distinct count per candidate without applying any of them', () => {
		mountPane();

		expect(rowText('Fantasy')).toContain('3 books');
		expect(rowText('Poetry')).toContain('1 book');
		expect(rowText('Audiobook')).toContain('2 books');
		// The live count is still the whole corpus — projecting must not have committed anything.
		expect(liveLine()).toContain('5');
	});

	it('shows the delta against the live count, so a projection is calibratable', () => {
		mountPane();

		// 3 of 5 is −40%; the sign is U+2212 rather than a hyphen.
		expect(rowText('Fantasy')).toContain('−40%');
	});

	it('reports the engine VERDICT, not a computed zero, for an impossible combination', () => {
		mountPane();

		fireEvent.click(commitButton('Poetry'));

		// Poetry is one book rated 2.0, so "Rated 4.5+" on top of it can match nothing. The engine
		// answers `wouldBeEmpty` — via the exclusion short-circuit, without counting — and the pane
		// must render the verdict rather than `0 books`.
		expect(rowText('Rated 4.5+')).toContain('no results');
	});

	it('commits a candidate and moves the live count and every other projection', () => {
		mountPane();

		expect(liveLine()).toContain('5');

		fireEvent.click(commitButton('Fantasy'));

		expect(liveLine()).toContain('3');
		// 🔴 The first draft of this case asserted on the POETRY row and predicted −67%, reasoning
		// that `withRule` would REPLACE the committed fantasy rule. It does not: replacement happens
		// per rule ID, and `lab-genre-fantasy` and `lab-genre-poetry` are different ids, so the two
		// INTERSECT and poetry projects `no results`. The log said so plainly — which is the standing
		// rule earning itself again: a surprising verdict means read the log, not re-read the source.
		//
		// Audiobook is the row that shows movement without collapsing: C is the only fantasy
		// audiobook, so the projection falls 2 → 1 against a baseline that fell 5 → 3. That the
		// DELTA moved is what proves a recompute happened rather than a cached number re-rendering.
		expect(rowText('Audiobook')).toContain('1 book');
		expect(rowText('Audiobook')).toContain('−67%');
	});

	it('INTERSECTS a projection with the committed rules rather than replacing them', () => {
		// The property the case above got wrong, asserted directly so it is not merely implied. This
		// is what makes the pane a genuine "what if I ALSO applied this" rather than a preview of
		// each rule in isolation.
		mountPane();

		fireEvent.click(commitButton('Fantasy'));

		expect(rowText('Poetry')).toContain('no results');
	});

	it('withdraws a committed candidate', () => {
		mountPane();

		fireEvent.click(commitButton('Fantasy'));

		expect(screen.getAllByRole('button', { name: 'Withdraw' }).length).toBe(1);

		fireEvent.click(commitButton('Fantasy'));

		expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
		expect(liveLine()).toContain('5');
	});

	it('reflects rules the visitor brought from /books rather than starting clean', () => {
		// The point of reusing the cached engine: filters left on `/books` are still applied here, so
		// the projections are relative to what the visitor was actually looking at. The rule is added
		// OUTSIDE the pane, exactly as another route would have added it.
		const engine = mountPane();

		act(() => {
			engine.core.addRule('genre', inSet<Book['genre']>('genre', ['fantasy']));
		});

		expect(liveLine()).toContain('3');
	});

	it('marks the committed row visually as well as semantically', () => {
		// Added after mutant C8 SURVIVED: dropping `fe-lab__row--committed` changed nothing any
		// assertion could see. The rest of this file queries by role deliberately, because the chrome
		// class names are scheduled for extraction — but this modifier is NOT in that set, and the
		// tint is the only at-a-glance indicator across five rows.
		//
		// ⚠ It is redundant BY DESIGN rather than by accident (color never carries meaning alone): the
		// state is already in the button label and in `aria-pressed`. Being redundant is not a reason
		// to leave it unchecked — "no test happens to see it" is not the same as "nothing could".
		mountPane();

		expect(findRow('Fantasy').className).not.toContain('fe-lab__row--committed');

		fireEvent.click(commitButton('Fantasy'));

		expect(findRow('Fantasy').className).toContain('fe-lab__row--committed');
	});

	it('exposes each commit control by an accessible name and pressed state', () => {
		mountPane();

		const fantasy = commitButton('Fantasy');

		expect(fantasy.textContent).toBe('Apply');
		expect(fantasy.getAttribute('aria-pressed')).toBe('false');

		fireEvent.click(fantasy);

		expect(commitButton('Fantasy').getAttribute('aria-pressed')).toBe('true');
	});
});
