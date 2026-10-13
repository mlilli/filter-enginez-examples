/**
 * The generic results region — the count roll, the active-filter pills, and the batching grid.
 *
 * @remarks
 * ### Why a sibling suite rather than more cases in the three view specs
 *
 * `createResultsView` is the dataset-NEUTRAL half of the results region; `books/view.test.ts`,
 * `real-estate/view.test.ts` and `wine/view.test.ts` all reach it, and all three reach it the same
 * way — through a dataset's own composer, with that dataset's summarizer and card renderer. Adding
 * these cases to any one of them would re-assert one module's contract in a second place, which is
 * the duplication objection best described as "copy-paste wearing a test's clothes". They belong beside the module they are about.
 *
 * The practical half matters too: two of the branches below are unreachable through a dataset view
 * at all. `recentRuleId` is `null` in all three of those suites, and `isNumeric` is whatever the
 * real summarizer decides — so the only way to drive either is to inject a summarizer, which a
 * direct mount can do and a composed one cannot.
 *
 * ### 🔴 Only the sites no other suite reaches — plus two reached only by accident
 *
 * A throw-mutant probe against the WHOLE `packages/examples-vanilla` suite — not against one spec,
 * because coverage is transitive — separates the sites the rest of the suite already drives from the
 * ones only this file reaches.
 *
 * Two sites the rest of the suite does reach are pinned here anyway, because they would otherwise be
 * reached only **by accident**, and an accident does not survive a change nobody would think to check:
 *
 *   * The reduced-motion snap path. `test-support/matchMedia` is query-aware, so a suite stubbing
 *     the desktop breakpoint cannot also answer `(prefers-reduced-motion: reduce)`; a helper that
 *     handed one `MediaQueryList` back for every query would reach this branch by imprecision. The
 *     case below is the deliberate path to it.
 *   * The count roll's completion branch, which is also reached by an ORPHANED
 *     `requestAnimationFrame` firing after the test that scheduled it, inside `books/view.test.ts`'s
 *     file lifetime — so it depends on that file taking longer than 600 ms to finish.
 *
 * Coverage that depends on a stub's imprecision and a suite's wall-clock duration is coverage that
 * will vanish without a code change. The two cases below assert the behavior deliberately, so it
 * cannot.
 *
 * @packageDocumentation
 */

import type { FilterSummary } from '@filter-enginez/examples-shared/books-domain';

import { REDUCED_MOTION_QUERY } from '@filter-enginez/brand/motion';
import { createFilterEngine, type FilterRule, type RuleId } from '@filter-enginez/core';
import { el } from '@filter-enginez/examples-shared/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMatchMedia } from '../test-support/matchMedia.js';
import { createResultsView, type ResultsView } from './resultsView.js';

/** The minimal record this suite filters — the module is generic, so the shape is irrelevant to it. */
interface Row {
	readonly id: string;
	readonly title: string;
}

/** Four rows: enough for the pills and the count, far under `BATCH_SIZE`. */
const FEW: readonly Row[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: `Row ${id}` }));

/**
 * 130 rows, and the number is load-bearing rather than round — the same reasoning
 * `books/view.test.ts` records for its own corpus.
 *
 * @remarks
 * `BATCH_SIZE` is 60, so 60 render at rest, a first scroll reaches 120 and a second 130. The case
 * that needs it asserts that a THIRD scroll adds nothing, and at any corpus under 121 that
 * assertion would hold whether the grid had exhausted itself or the listener had never fired.
 */
const MANY: readonly Row[] = Array.from({ length: 130 }, (_, index) => ({
	id: `m${String(index)}`,
	title: `Row ${String(index)}`,
}));

/** How long to advance the virtual clock to outrun the 600 ms roll. Not exported by the module. */
const PAST_ROLL_DURATION_MS = 700;

/**
 * Build one active-filter summary.
 *
 * @param ruleId - The rule this pill stands for.
 * @param overrides - Anything else worth varying, notably `isNumeric`.
 * @returns The summary.
 */
function makeSummary(ruleId: RuleId, overrides: Partial<FilterSummary> = {}): FilterSummary {
	return { isNumeric: false, label: `Label ${ruleId}`, ruleId, value: `Value ${ruleId}`, ...overrides };
}

/** A mounted results region plus the handles the cases drive it with. */
interface MountedResults {
	/** The mounted region's root. */
	readonly root: HTMLElement;
	/**
	 * The pills the injected summarizer returns. Mutate it, then call `setRules` — this is what lets
	 * a case choose an `isNumeric` value or a `ruleId` that a real summarizer would decide for it.
	 */
	readonly summaries: FilterSummary[];
	/** The view itself, for `setCount` / `setResults` / `dispose`. */
	readonly view: ResultsView<Row>;
}

/**
 * Mount `createResultsView` over a mini engine, with a summarizer the caller controls.
 *
 * @param rows - The corpus. Defaults to {@link FEW}.
 * @returns The mounted region.
 */
function mountResults(rows: readonly Row[] = FEW): MountedResults {
	const core = createFilterEngine<Row>({ sourceData: rows });
	const summaries: FilterSummary[] = [];
	const view = createResultsView<Row>(core, {
		emptyHint: 'Try widening a filter.',
		emptyTitle: 'No rows match these filters',
		listLabel: 'Matching rows',
		noun: 'rows',
		renderCard: (row) => el('article', { className: 'fe-test-card', text: row.title }),
		scrollRegionLabel: 'Matching rows, scrollable',
		summarize: () => summaries,
	});
	const root = el('div', { children: [view.headerElement, view.gridElement]});

	document.body.append(root);

	return { root, summaries, view };
}

/**
 * Query one element, throwing rather than returning `null` so callers avoid a non-null assertion.
 *
 * @param root - Where to look.
 * @param selector - The CSS selector.
 * @returns The matched element.
 */
function requireElement(root: HTMLElement, selector: string): HTMLElement {
	const node = root.querySelector<HTMLElement>(selector);

	if (node === null) {
		throw new Error(`expected an element matching "${selector}"`);
	}

	return node;
}

/** The rendered count, as text. */
function countTextIn(root: HTMLElement): string {
	return requireElement(root, '.fe-result-count__number').textContent;
}

/** Whether the count is currently wearing the computing class. */
function isCountComputing(root: HTMLElement): boolean {
	return requireElement(root, '.fe-result-count__number').classList.contains('fe-result-count__number--computing');
}

/**
 * An empty rule map. The injected summarizer ignores it — the pills under test are
 * {@link MountedResults.summaries}, not whatever a real summarizer would derive.
 */
function noRules(): ReadonlyMap<RuleId, FilterRule> {
	return new Map<RuleId, FilterRule>();
}

/**
 * Install fake timers that also fake the animation clock.
 *
 * @remarks
 * Named explicitly rather than left to Vitest's defaults, because this module reads the clock
 * through `performance.now()` and drives itself with `requestAnimationFrame`: a default that
 * stopped faking either one would leave every roll below frozen at its start value, and a roll that
 * never moves passes a "it stopped when disposed" assertion exactly as well as one that was
 * correctly cancelled.
 */
function useAnimationTimers(): void {
	vi.useFakeTimers({
		toFake: [
			'cancelAnimationFrame',
			'clearTimeout',
			'Date',
			'performance',
			'requestAnimationFrame',
			'setTimeout',
		],
	});
}

beforeEach(() => {
	document.body.replaceChildren();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('the active-filter pills', () => {
	it('marks only the rule that just changed with the phosphor --recent border', () => {
		// The brand's dual-accent contract, which is load-bearing: phosphor means "the engine fired
		// here". It is live — all four page shells pass a real `engine.lastChangeRuleId.value` — but
		// every other suite passes `null`, so this case is the only one that exercises it.
		//
		// Two pills, not one. With a single pill the assertion passes just as happily against a
		// module that applies `--recent` unconditionally.
		const { root, summaries, view } = mountResults();

		summaries.push(makeSummary('genre'), makeSummary('year'));
		view.setRules(noRules(), 'year');

		const isRecent = [...root.querySelectorAll('.fe-filter-chip')].map((chip) =>
			chip.classList.contains('fe-filter-chip--recent'),
		);

		expect(isRecent).toEqual([false, true]);
	});

	it('renders a numeric chip value in the tabular-nums style and a categorical one plain', () => {
		// Same discrimination argument: one of each, asserted as a pair.
		const { root, summaries, view } = mountResults();

		summaries.push(makeSummary('genre'), makeSummary('price', { isNumeric: true }));
		view.setRules(noRules(), null);

		const isNumeric = [...root.querySelectorAll('.fe-filter-chip__value')].map((value) =>
			value.classList.contains('fe-filter-chip__value--numeric'),
		);

		expect(isNumeric).toEqual([false, true]);
	});
});

describe('the result count', () => {
	it('signs a count above the corpus total with a +, and one below it with a -', () => {
		// A count ABOVE the total is nonsense for a filter, so nothing in the app produces one — which
		// is exactly why the `+` arm had never executed. It is still the honest thing for the module
		// to render if an async engine and a stale total ever disagree, and asserting both signs in
		// one case is what keeps this from passing against a module that hard-codes either.
		const { root, view } = mountResults();
		const delta = requireElement(root, '.fe-result-count__delta');

		view.setCount(8, 10);

		expect(delta.textContent).toBe('-2');
		expect(delta.className).toContain('fe-result-count__delta--down');

		view.setCount(12, 10);

		expect(delta.textContent).toBe('+2');
		expect(delta.className).toContain('fe-result-count__delta--up');
	});

	it('snaps the count where the environment has no requestAnimationFrame', () => {
		// The isomorphic-adjacent case: this module is browser-only, but "browser-only" is not "has
		// rAF" — a jsdom-like host without it would otherwise throw on the first filter change.
		vi.stubGlobal('requestAnimationFrame', undefined);

		const { root, view } = mountResults();

		view.setCount(10, 10);
		view.setCount(4, 10);

		expect(countTextIn(root)).toBe('4');
		expect(isCountComputing(root)).toBe(false);
	});

	it('rolls on Date.now() where there is no performance global', () => {
		// `const start = clock()` runs before the snap guard, so every roll reads the clock — and on a
		// host without `performance` (a bare Node or edge runtime rendering this module's output) the
		// fallback is the only thing between it and a TypeError.
		useAnimationTimers();
		vi.stubGlobal('performance', undefined);

		const { root, view } = mountResults();

		view.setCount(10, 10);
		view.setCount(4, 10);
		vi.advanceTimersByTime(PAST_ROLL_DURATION_MS);

		expect(countTextIn(root)).toBe('4');
	});

	it('lands exactly on the target and clears the computing state when the roll finishes', () => {
		// The completion branch. Otherwise reached only by an orphaned frame firing after the test that
		// scheduled it — see this file's docblock. The eased value approaches the target
		// asymptotically, so "lands exactly" is a real claim about the final assignment rather than
		// about the easing curve.
		useAnimationTimers();

		const { root, view } = mountResults();
		const indicator = requireElement(root, '.fe-computing-indicator');

		view.setCount(10, 10);
		view.setCount(4, 10);

		expect(isCountComputing(root)).toBe(true);
		expect(indicator.getAttribute('aria-label')).toBe('Engine computing');

		vi.advanceTimersByTime(PAST_ROLL_DURATION_MS);

		expect(countTextIn(root)).toBe('4');
		expect(isCountComputing(root)).toBe(false);
		expect(indicator.getAttribute('aria-label')).toBe('Engine idle');
	});

	it('snaps the count for someone who asked for reduced motion', () => {
		// Reduced motion must be honored. The stub must be QUERY-AWARE or this case passes while
		// measuring "some media query matched", which is the accident it exists to pin. The shared
		// `test-support/matchMedia` helper answers this query and `false` to every other.
		installMatchMedia(REDUCED_MOTION_QUERY, true);
		useAnimationTimers();

		const { root, view } = mountResults();

		view.setCount(10, 10);
		view.setCount(4, 10);

		expect(countTextIn(root)).toBe('4');
		expect(isCountComputing(root)).toBe(false);

		// Nothing was scheduled, so nothing can arrive later. Without this the case would also pass
		// against a module that animated normally and happened to be read after it finished.
		vi.advanceTimersByTime(PAST_ROLL_DURATION_MS);

		expect(countTextIn(root)).toBe('4');
	});

	it('stops the count roll when the view is disposed mid-flight', () => {
		// A route torn down mid-roll otherwise keeps a frame loop writing into a detached tree.
		useAnimationTimers();

		const { root, view } = mountResults();

		view.setCount(10, 10);
		view.setCount(4, 10);
		vi.advanceTimersByTime(100);

		const midRoll = countTextIn(root);

		// Both controls, and both are load-bearing. The first proves the virtual clock actually
		// advances the roll; the second proves it has not already arrived. Without them the final
		// assertion holds against a roll that never moved at all.
		expect(midRoll).not.toBe('10');
		expect(midRoll).not.toBe('4');

		view.dispose();
		vi.advanceTimersByTime(PAST_ROLL_DURATION_MS);

		expect(countTextIn(root)).toBe(midRoll);
	});
});

describe('the batching grid', () => {
	it('stops growing on scroll once every row is rendered', () => {
		// jsdom reports every box as 0×0, so `handleScroll`'s near-bottom test is always true here —
		// which is what makes the third scroll a clean test of the "nothing left to give" guard rather
		// than of the geometry. The first two scrolls are the control: they prove the listener is live.
		const { root, view } = mountResults(MANY);
		const scroller = requireElement(root, '.fe-result-grid__scroller');
		const cardCount = (): number => root.querySelectorAll('.fe-test-card').length;

		view.setResults(MANY);
		expect(cardCount()).toBe(60);

		scroller.dispatchEvent(new Event('scroll'));
		expect(cardCount()).toBe(120);

		scroller.dispatchEvent(new Event('scroll'));
		expect(cardCount()).toBe(130);

		scroller.dispatchEvent(new Event('scroll'));
		expect(cardCount()).toBe(130);
	});
});
