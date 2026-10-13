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
 * ### The count ticks, and that is the whole busy story here
 *
 * The count eases toward its new value over 600ms (rAF + cubic ease-out) — parity with `react-ui`'s
 * `useTickingNumber`. On a synchronous main-thread engine a recompute resolves in the same tick, so
 * without the roll there would be nothing to see, and the roll is what drives the computing
 * indicator. This app has no engine busy tracker; the animation IS the indicator's input.
 *
 * @packageDocumentation
 */

import type { FilterEngine, FilterRule, RuleId } from '@filter-enginez/core';
import type { FilterSummary } from '@filter-enginez/examples-shared/books-domain';

import { prefersReducedMotion } from '@filter-enginez/brand/motion';

import { createComputingIndicator } from '../brand/indicators.js';
import { el, setHidden, svg } from '../dom.js';

/** How many cards render initially, and per "load more" batch. */
const BATCH_SIZE = 60;

/** Hard cap on rendered cards — past this the grid stops growing and says so. */
const HARD_CAP = 1500;

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
	/** Detach the rAF animation + scroll listener. */
	readonly dispose: () => void;
}

/** Construction options for {@link createResultsView}. */
export interface ResultsViewOptions<T> {
	/** Hint under the empty-state title, naming a filter worth widening. */
	readonly emptyHint: string;
	/** Empty-state headline, e.g. `'No books match these filters'`. */
	readonly emptyTitle: string;
	/** Accessible name for the grid's `role="list"`, e.g. `'Matching books'`. */
	readonly listLabel: string;
	/** Plural record noun beside the count and in the cap notice, e.g. `'listings'`. */
	readonly noun: string;
	/** Build one card. The returned element is given `role="listitem"` by this module. */
	readonly renderCard: (item: T) => HTMLElement;
	/** Accessible name for the SCROLLER — a WCAG 2.1.1 obligation, see below. */
	readonly scrollRegionLabel: string;
	/** How to summarize the active rules into pills. See {@link RuleSummarizer}. */
	readonly summarize: RuleSummarizer;
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
	const { emptyHint, emptyTitle, listLabel, noun, renderCard, scrollRegionLabel, summarize } =
		options;

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
					el('span', { className: 'fe-result-count__label', text: noun }),
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
	grid.setAttribute('aria-label', listLabel);

	const capNotice = el('p', { className: 'fe-result-grid__cap-notice' });
	const emptyState = el('div', {
		children: [
			el('p', { className: 'fe-result-grid__empty-title', text: emptyTitle }),
			el('p', { className: 'fe-result-grid__empty-hint', text: emptyHint }),
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
	gridElement.setAttribute('aria-label', scrollRegionLabel);
	gridElement.tabIndex = 0;

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
		countNode.classList.add('fe-result-count__number--computing');
		computing.setComputing(true);

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
				countNode.classList.remove('fe-result-count__number--computing');
				computing.setComputing(false);
			}
		};

		frame = requestAnimationFrame(step);
	}

	// ── Incremental grid rendering (batching + hard cap), mirroring the other verticals ──
	let rendered: readonly T[] = [];
	let visible = BATCH_SIZE;

	/** Paint the current slice + the empty / cap affordances. */
	function paintGrid(): void {
		const capped = Math.min(visible, HARD_CAP, rendered.length);

		grid.replaceChildren(
			...rendered.slice(0, capped).map((item) => {
				const card = renderCard(item);

				// Set here rather than in each dataset's renderer, so a new card cannot forget it and
				// silently empty the list for a screen reader.
				card.setAttribute('role', 'listitem');

				return card;
			}),
		);
		setHidden(emptyState, rendered.length > 0);
		setHidden(grid, rendered.length === 0);

		if (capped < rendered.length) {
			setHidden(capNotice, false);
			capNotice.replaceChildren(
				el('span', { className: 'fe-result-grid__cap-shown', text: capped.toLocaleString() }),
				' of ',
				el('span', {
					className: 'fe-result-grid__cap-total',
					text: rendered.length.toLocaleString(),
				}),
				` ${noun} rendered — scroll for more`,
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

		if (isNearBottom && visible < Math.min(rendered.length, HARD_CAP)) {
			visible += BATCH_SIZE;
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
			visible = BATCH_SIZE;
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
										core.removeRule(summary.ruleId);
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
							core.clearRules();
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
