/**
 * `how-it-works/figures/bayes` — framework-less port of the Bayesian co-occurrence suggestion illustration.
 *
 * @remarks
 * Given the current selection (cyan chips), the engine tallies which options historically co-occur
 * and ranks the most likely next filters as probability bars. The tally connector pulses phosphor
 * (engine working); the chips + bars are cyan (data). Geometry is verbatim from the docs’ React figure; the
 * `fe-fig-bayes__*` animation CSS lives in `@filter-enginez/ui-styles/figures.css`.
 *
 * @packageDocumentation
 */

import { el, svg } from '@filter-enginez/examples-shared/dom';

import { svgText } from './svgText.js';

/** One suggested filter with its co-occurrence probability (0–1). */
interface Suggestion {
	readonly label: string;
	readonly probability: number;
}

/** The ranked suggestions (highest first) — probabilities drive the bar widths. */
const SUGGESTIONS: readonly Suggestion[] = [
	{ label: '90+ points', probability: 0.86 },
	{ label: 'oak', probability: 0.62 },
	{ label: 'red blend', probability: 0.44 },
	{ label: 'reserve', probability: 0.27 },
];

/** The current selection chips. */
const SELECTION = [
	{ label: 'napa', x: 20 },
	{ label: 'cabernet', x: 96 },
] as const;

/** Geometry for the suggestion rows. */
const BAR_X = 150;
const BAR_MAX_WIDTH = 288;
const ROW_TOP = 120;
const ROW_STEP = 30;

/**
 * Y of a suggestion row.
 *
 * @param index - The suggestion's index.
 * @returns The row's top edge in user units.
 */
function rowY(index: number): number {
	return ROW_TOP + index * ROW_STEP;
}

/**
 * Filled bar width for a suggestion.
 *
 * @param suggestion - The suggestion.
 * @returns The bar width in user units.
 */
function barWidth(suggestion: Suggestion): number {
	return suggestion.probability * BAR_MAX_WIDTH;
}

/**
 * Build the Bayesian-suggestion figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createBayesianSuggestFigure(): HTMLElement {
	const chips = SELECTION.map((chip) => {
		const isWide = chip.label.length > 5;

		return svg('g', {}, [
			svg('rect', {
				class: 'fe-fig-bayes__chip is-selected',
				height: 26,
				rx: 13,
				width: isWide ? 84 : 66,
				x: chip.x,
				y: 38,
			}),
			svgText({ class: 'fe-fig-bayes__chip-label is-selected', x: chip.x + (isWide ? 42 : 33), y: 51 }, chip.label),
		]);
	});

	const rows = SUGGESTIONS.map((suggestion, index) =>
		svg('g', { class: index === 0 ? 'fe-fig-bayes__row is-top' : 'fe-fig-bayes__row' }, [
			svgText({ class: 'fe-fig-bayes__row-label', x: BAR_X - 10, y: rowY(index) + 9 }, suggestion.label),
			svg('rect', {
				class: 'fe-fig-bayes__bar-track',
				height: 13,
				rx: 3,
				width: BAR_MAX_WIDTH,
				x: BAR_X,
				y: rowY(index),
			}),
			svg('rect', {
				class: 'fe-fig-bayes__bar',
				height: 13,
				rx: 3,
				style: `animation-delay: ${600 + index * 180}ms`,
				width: barWidth(suggestion),
				x: BAR_X,
				y: rowY(index),
			}),
			svgText(
				{ class: 'fe-fig-bayes__pct', x: BAR_X + barWidth(suggestion) + 8, y: rowY(index) + 9 },
				`${Math.round(suggestion.probability * 100)}%`,
			),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				'From the current filter selection, the engine ranks the filters most likely to be chosen next, shown as probability bars.',
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-bayes__svg', viewBox: '0 0 460 250', xmlns: 'http://www.w3.org/2000/svg' },
				[
					// Current selection
					svgText({ class: 'fe-fig-bayes__eyebrow', x: 20, y: 28 }, 'current selection'),
					...chips,
					// Co-occurrence tally connector (phosphor, transient)
					svg('line', { class: 'fe-fig-bayes__connector', x1: 40, x2: 40, y1: 70, y2: 104 }),
					svg('circle', { class: 'fe-fig-bayes__pulse', cx: 40, cy: 70, r: 3.5 }),
					svgText({ class: 'fe-fig-bayes__eyebrow', x: 20, y: 104 }, 'suggested filters'),
					// Suggestion rows
					...rows,
				],
			),
		],
		className: 'fe-fig fe-fig-bayes',
	});
}
