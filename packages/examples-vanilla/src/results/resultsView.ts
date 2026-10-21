/**
 * The results header (active-filter pills + ticking count) and the card grid, for any dataset.
 *
 * @remarks
 * The framework-less port of React's `ResultsHeaderView` + `BooksResultGrid`, over the shared
 * `fe-results-header` / `fe-active-filters*` / `fe-filter-chip*` / `fe-result-count*` /
 * `fe-result-grid*` classes.
 *
 * ### Why it is generic
 *
 * Typed to one dataset, each further dataset would need a second copy of four interacting pieces: the batching render limit, the hard cap, the scroll handler that closes over
 * the current length, and the reset keyed on a new result set. That is precisely the combination
 * where the second copy is the one that keeps a stale total after a filter change.
 *
 * Vanilla makes the generic version *easier* than any framework's: the card is a
 * `renderCard: (item: T) => HTMLElement` callback, which is what React needs a component for, Vue a
 * scoped slot, and Angular a `TemplateRef` plus a context-guard directive.
 *
 * ### Two inputs light the computing indicator
 *
 * The dataset's engine-busy tracker (`../busy/engineBusy.ts`), pushed in through
 * {@link ResultsView.setBusy}: it turns on in the frame a write is marked and off once the engine has
 * settled on it, which on the 150k worker tier is hundreds of milliseconds. And the count roll: the
 * number eases toward its new value over 600ms (rAF + cubic ease-out), parity with `react-ui`'s
 * `useTickingNumber`. The indicator — and the number's phosphor `--computing` state — show while
 * EITHER is true, exactly as every other vertical's header ORs its busy store with its roll.
 *
 * ### The copy is the shared copy
 *
 * The count noun, the empty state, the list's and the scroller's accessible names, the render window
 * and the cap notice all come from `@filter-enginez/examples-shared/verticals` (`RESULT_COPY`,
 * `RESULT_GRID_WINDOW`), so the six apps cannot word the same results column six ways.
 *
 * @packageDocumentation
 */

import type { FilterEngine, FilterRule, RuleId } from '@filter-enginez/core';
import type { FilterSummary } from '@filter-enginez/examples-shared/books-domain';

import { prefersReducedMotion } from '@filter-enginez/brand/motion';
import { el, setHidden, svg } from '@filter-enginez/examples-shared/dom';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import {
	isRenderCapped,
	nextRenderLimit,
	RESULT_GRID_WINDOW,
	resultCapNotice,
	type ResultCopy,
} from '@filter-enginez/examples-shared/verticals';

import { createComputingIndicator } from '../brand/indicators.js';

/** How near the bottom the scroller must be before the next batch renders, in px. */
const LOAD_MORE_THRESHOLD_PX = 240;

/** Count-roll duration in ms — matches `react-ui`'s `useTickingNumber` and every port of it. */
const ROLL_DURATION_MS = 600;

/**
 * Turns the engine's active rules into one pill each.
 *
 * @remarks
 * `FilterSummary` is ONE declaration in `examples-shared/src/summaries/ruleSummary.ts`, re-exported
 * by the books and real-estate domain barrels, and this import resolves to it — so real estate's
 * summarizer satisfies this signature by design rather than by structural accident. (`react-ui` keeps
 * its own on purpose — it has no `core` dependency and so cannot name `RuleId` at all.)
 */
export type RuleSummarizer = (rules: ReadonlyMap<RuleId, FilterRule>) => readonly FilterSummary[];

/** The mounted results region. */
export interface ResultsView<T> {
	/** The results-header element (pills + count). */
	readonly headerElement: HTMLElement;
	/** The scrollable grid element. */
	readonly gridElement: HTMLElement;
	/** Set the result count (animated) and the corpus total. */
	readonly setCount: (count: number, total: number) => void;
	/** Replace the rendered cards. */
	readonly setResults: (results: readonly T[]) => void;
	/**
	 * Rebuild the active-filter pills from the engine's rule map. `recentRuleId` marks the
	 * most-recently-changed rule so its pill gets the phosphor "just changed" border.
	 */
	readonly setRules: (rules: ReadonlyMap<RuleId, FilterRule>, recentRuleId: RuleId | null) => void;
	/** Whether the dataset's engine-busy tracker says a write is still settling. */
	readonly setBusy: (isBusy: boolean) => void;
	/** Detach the rAF animation + scroll listener. */
	readonly dispose: () => void;
}

/** Construction options for {@link createResultsView}. */
export interface ResultsViewOptions<T> {
	/**
	 * The dataset's results copy — `RESULT_COPY[dataset]`: the noun beside the count, the empty
	 * state, the list's accessible name (with its count) and the scroller's (a WCAG 2.1.1
	 * obligation, see below).
	 */
	readonly copy: ResultCopy;
	/**
	 * Mark the dataset's engine-busy tracker. The default pill × and "Clear all" call it BEFORE they
	 * write, so the indicator lights in the click's own frame.
	 */
	readonly markBusy: () => void;
	/** Build one card. The returned element is given `role="listitem"` by this module. */
	readonly renderCard: (item: T) => HTMLElement;
	/** How to summarize the active rules into pills. See {@link RuleSummarizer}. */
	readonly summarize: RuleSummarizer;
	/**
	 * What a pill's × does. Defaults to a busy mark, then removing the pill's rule.
	 *
	 * @remarks
	 * A dataset passes its own when a pill can stand for something other than one rule: wine's
	 * synthetic smart-filter pill names no rule, so `core.removeRule` on it would do nothing.
	 */
	readonly removePill?: (ruleId: RuleId) => void;
	/**
	 * What "Clear all" does. Defaults to the shared `clearAllFilters(engine, markBusy)`: the busy mark,
	 * then ONE `core.clearRules()` — every rule, group and the expression, one Undo step.
	 */
	readonly clearAll?: () => void;
}

/**
 * Build the results header + grid over a bare engine.
 *
 * @typeParam T - The record type.
 * @param core - The engine pills write through (removing a rule / clearing all).
 * @param options - Dataset labelling + the card renderer.
 * @returns The mounted results region.
 */
export function createResultsView<T>(
	core: FilterEngine<T>,
	options: ResultsViewOptions<T>,
): ResultsView<T> {
	const { copy, markBusy, renderCard, summarize } = options;
	const removePill =
		options.removePill ??
		((ruleId: RuleId): void => {
			markBusy();
			core.removeRule(ruleId);
		});
	const clearAll =
		options.clearAll ??
		((): void => {
			clearAllFilters({ core }, markBusy);
		});

	const computing = createComputingIndicator();
	const countNode = el('span', { className: 'fe-result-count__number' });
	const deltaNode = el('span', { className: 'fe-result-count__delta' });
	const totalNode = el('span', { className: 'fe-result-count__total' });
	const pillsRow = el('div', { className: 'fe-active-filters__chips' });
	const pillsCount = el('span', { className: 'fe-active-filters__count' });
	const emptyNote = el('div', {
		className: 'fe-active-filters__empty',
		text: 'No filters active — showing the full corpus.',
	});
	const activeFilters = el('div', {
		children: [pillsCount, pillsRow],
		className: 'fe-active-filters',
	});

	const headerElement = el('div', {
		children: [
			emptyNote,
			activeFilters,
			el('div', {
				children: [
					countNode,
					el('span', { className: 'fe-result-count__label', text: copy.noun }),
					deltaNode,
					totalNode,
					el('span', { children: [computing.element], className: 'fe-result-count__status' }),
				],
				className: 'fe-result-count',
			}),
		],
		className: 'fe-results-header',
	});

	const grid = el('div', { className: 'fe-result-grid' });

	// `role="list"` + a per-card `role="listitem"`, matching every other vertical. The cards are
	// `<article>`s, which are not implicitly list items, so without both halves the list announces as
	// empty.
	grid.setAttribute('role', 'list');
	grid.setAttribute('aria-label', copy.listLabel(0));

	const capNotice = el('p', { className: 'fe-result-grid__cap-notice' });
	const emptyState = el('div', {
		children: [
			el('p', { className: 'fe-result-grid__empty-title', text: copy.emptyTitle }),
			el('p', { className: 'fe-result-grid__empty-hint', text: copy.emptyHint }),
		],
		className: 'fe-result-grid__empty',
	});

	// `role="group"` + `tabIndex 0`: the cards have nothing tabbable inside, so this scrolling
	// container has to be the tab stop or the results are unreachable by keyboard (WCAG 2.1.1).
	// `aria-label` keeps it from being a silent one.
	const gridElement = el('div', {
		children: [grid, capNotice, emptyState],
		className: 'fe-result-grid__scroller',
	});

	gridElement.setAttribute('role', 'group');
	gridElement.setAttribute('aria-label', copy.scrollerLabel);
	gridElement.tabIndex = 0;

	// ── The computing state: busy OR rolling ──
	let isBusy = false;
	let isTicking = false;

	/** Repaint the indicator and the number's phosphor state from the two inputs. */
	function paintComputing(): void {
		const isComputing = isBusy || isTicking;

		countNode.classList.toggle('fe-result-count__number--computing', isComputing);
		computing.setComputing(isComputing);
	}

	// ── Ticking count (port of react-ui's `useTickingNumber`) ──
	// `shown` mirrors the displayed value non-reactively; it is the animation's start point.
	let shown = 0;
	let frame = 0;
	/**
	 * The first count is painted, not animated. Rolling from 0 → N on load would leave the number
	 * blank until the first frame and read as a load shimmer rather than a filter response; the other
	 * verticals seed their displayed value from the engine for the same reason.
	 */
	let hasPaintedCount = false;

	/** Ease the displayed count toward `target` so the number visibly rolls. */
	function tickTo(target: number): void {
		if (shown === target || !hasPaintedCount) {
			hasPaintedCount = true;
			shown = target;
			countNode.textContent = target.toLocaleString();

			return;
		}
		const from = shown;
		const clock = (): number =>
			typeof performance === 'undefined' ? Date.now() : performance.now();
		const start = clock();

		if (frame !== 0) {
			cancelAnimationFrame(frame);
			frame = 0;
		}
		// Snap when there's no rAF or when the person asked for reduced motion; the loader keyframes
		// already honor the query in CSS, but this roll is JS-driven and must ask itself.
		if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
			shown = target;
			countNode.textContent = target.toLocaleString();

			return;
		}
		isTicking = true;
		paintComputing();

		const step = (): void => {
			const progress = Math.min(1, (clock() - start) / ROLL_DURATION_MS);
			const eased = 1 - (1 - progress) ** 3;
			const value = Math.round(from + (target - from) * eased);

			shown = value;
			countNode.textContent = value.toLocaleString();
			if (progress < 1) {
				frame = requestAnimationFrame(step);
			} else {
				frame = 0;
				shown = target;
				countNode.textContent = target.toLocaleString();
				isTicking = false;
				paintComputing();
			}
		};

		frame = requestAnimationFrame(step);
	}

	// ── Incremental grid rendering (batching + hard cap), mirroring the other verticals ──
	let rendered: readonly T[] = [];
	let visible: number = RESULT_GRID_WINDOW.initial;

	/** Paint the current slice + the empty / cap affordances. */
	function paintGrid(): void {
		const renderedCount = Math.min(visible, rendered.length);

		grid.replaceChildren(
			...rendered.slice(0, renderedCount).map((item) => {
				const card = renderCard(item);

				// Set here rather than in each dataset's renderer, so a new card cannot forget it and
				// silently empty the list for a screen reader.
				card.setAttribute('role', 'listitem');

				return card;
			}),
		);
		setHidden(emptyState, rendered.length > 0);
		setHidden(grid, rendered.length === 0);

		// Only at the hard cap, and only when more matched than it lets through: below the cap the
		// next scroll renders more, so "showing N of M" would describe a pause rather than a limit.
		if (isRenderCapped(renderedCount, rendered.length)) {
			const notice = resultCapNotice(renderedCount, rendered.length);

			setHidden(capNotice, false);
			capNotice.replaceChildren(
				'Showing ',
				el('span', { className: 'fe-result-grid__cap-shown', text: notice.rendered }),
				' of ',
				el('span', { className: 'fe-result-grid__cap-total', text: notice.total }),
				` ${notice.suffix}`,
			);
		} else {
			setHidden(capNotice, true);
		}
	}

	/** Grow the visible slice as the user nears the bottom of the scroller. */
	function handleScroll(): void {
		const isNearBottom =
			gridElement.scrollTop + gridElement.clientHeight >=
			gridElement.scrollHeight - LOAD_MORE_THRESHOLD_PX;
		const next = nextRenderLimit(visible, rendered.length);

		if (isNearBottom && next > visible) {
			visible = next;
			paintGrid();
		}
	}

	gridElement.addEventListener('scroll', handleScroll);

	return {
		dispose: () => {
			gridElement.removeEventListener('scroll', handleScroll);
			if (frame !== 0) {
				cancelAnimationFrame(frame);
				frame = 0;
			}
		},
		gridElement,
		headerElement,
		setBusy: (nextIsBusy) => {
			isBusy = nextIsBusy;
			paintComputing();
		},
		setCount: (count, total) => {
			tickTo(count);
			const delta = count - total;

			setHidden(deltaNode, delta === 0);
			deltaNode.textContent = `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
			deltaNode.className =
				delta < 0
					? 'fe-result-count__delta fe-result-count__delta--down'
					: 'fe-result-count__delta fe-result-count__delta--up';
			totalNode.textContent = `filtered from ${total.toLocaleString()} total`;
		},
		setResults: (results) => {
			rendered = results;
			visible = RESULT_GRID_WINDOW.initial;
			grid.setAttribute('aria-label', copy.listLabel(results.length));
			gridElement.scrollTop = 0;
			paintGrid();
		},
		setRules: (rules, recentRuleId) => {
			const summaries = summarize(rules);

			setHidden(emptyNote, summaries.length > 0);
			setHidden(activeFilters, summaries.length === 0);
			pillsCount.textContent = `${summaries.length} ${summaries.length === 1 ? 'filter' : 'filters'}`;
			pillsRow.replaceChildren(
				...summaries.map((summary) =>
					el('div', {
						children: [
							el('span', { attrs: { 'aria-hidden': 'true' }, className: 'fe-filter-chip__dot' }),
							el('span', { className: 'fe-filter-chip__label', text: summary.label }),
							el('span', {
								className: summary.isNumeric
									? 'fe-filter-chip__value fe-filter-chip__value--numeric'
									: 'fe-filter-chip__value',
								text: summary.value,
							}),
							el('button', {
								attrs: { 'aria-label': `Remove ${summary.label} filter`, type: 'button' },
								children: [closeIcon()],
								className: 'fe-filter-chip__remove',
								on: {
									click: () => {
										removePill(summary.ruleId);
									},
								},
							}),
						],
						// The phosphor border marks the rule that just changed — per the dual-accent contract,
						// phosphor means "the engine fired here", cyan means "this is data".
						className:
							summary.ruleId === recentRuleId
								? 'fe-filter-chip fe-filter-chip--recent'
								: 'fe-filter-chip',
					}),
				),
				el('button', {
					attrs: { type: 'button' },
					className: 'fe-active-filters__clear',
					on: {
						click: () => {
							clearAll();
						},
					},
					text: 'Clear all',
				}),
			);
		},
	};
}

/**
 * The × glyph on a removable filter pill.
 *
 * @internal
 */
function closeIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			fill: 'none',
			height: 12,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 12,
		},
		[svg('path', { d: 'M18 6 6 18M6 6l12 12' })],
	);
}
