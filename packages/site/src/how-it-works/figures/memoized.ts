/**
 * `how-it-works/figures/memoized` — framework-less port of the Memoized-Simulation (LRU) illustration.
 *
 * @remarks
 * Two lanes race the same what-if `simulate(+2015)` query: the top lane is a cache HIT (answer
 * returns instantly from the LRU shelf); the bottom lane is the MISS that computed once through the
 * engine block (which pulses phosphor). Same answer, wildly different work. Geometry is verbatim from
 * the React figure; the `fe-fig-memo__*` animation CSS lives in `@filter-enginez/ui-styles/figures.css`.
 *
 * @packageDocumentation
 */

import { el, svg } from '@filter-enginez/examples-shared/dom';

import { svgText } from './svgText.js';

/** Y centers of the two lanes in the 460×236 viewBox. */
const HIT_Y = 70;
const MISS_Y = 166;
/** Horizontal track extents shared by both lanes. */
const TRACK_START = 132;
const TRACK_END = 372;

/** The two lanes rendered as a common diagram. */
const LANES = [
	{ id: 'hit', tag: 'cached', time: '0.01 ms', y: HIT_Y },
	{ id: 'miss', tag: 'computed once', time: '≈ 28 ms', y: MISS_Y },
] as const;

/** Travel distance for the query tokens, handed to the CSS as a custom property. */
const trackDelta = `${TRACK_END - TRACK_START}px`;

/**
 * Build the Memoized-Simulation figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createMemoizedSimulationFigure(): HTMLElement {
	const laneGroups = LANES.map((lane) =>
		svg('g', {}, [
			// Track
			svg('line', { class: 'fe-fig-memo__track', x1: TRACK_START, x2: TRACK_END, y1: lane.y, y2: lane.y }),
			// Lane tag
			svgText({ class: 'fe-fig-memo__tag', x: 24, y: lane.y - 26 }, lane.tag),
			// Question card
			svg('rect', { class: 'fe-fig-memo__card', height: 34, rx: 6, width: 110, x: 20, y: lane.y - 17 }),
			svgText({ class: 'fe-fig-memo__card-label', x: 75, y: lane.y }, 'simulate(+2015)'),
			// Answer badge
			svg('rect', { class: 'fe-fig-memo__answer', height: 30, rx: 15, width: 54, x: TRACK_END, y: lane.y - 15 }),
			svgText({ class: 'fe-fig-memo__answer-label', x: TRACK_END + 27, y: lane.y }, '847'),
			// Timing tag
			svgText({ class: 'fe-fig-memo__time', x: TRACK_END + 27, y: lane.y + 32 }, lane.time),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				'The same what-if query on two lanes: a cache hit returns an answer instantly from a shelf, while a cache miss computes it once through the engine. Both return the same count.',
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-memo__svg', viewBox: '0 0 460 236', xmlns: 'http://www.w3.org/2000/svg' },
				[
					...laneGroups,
					// LRU shelf on the hit lane
					svg('g', { class: 'fe-fig-memo__shelf', transform: `translate(210, ${HIT_Y})` }, [
						svg('rect', { class: 'fe-fig-memo__shelf-box', height: 48, rx: 5, width: 60, x: -30, y: -24 }),
						svg('rect', { class: 'fe-fig-memo__shelf-slot is-active', height: 9, rx: 2, width: 44, x: -22, y: -17 }),
						svg('rect', { class: 'fe-fig-memo__shelf-slot', height: 9, rx: 2, width: 44, x: -22, y: -4 }),
						svg('rect', { class: 'fe-fig-memo__shelf-slot', height: 9, rx: 2, width: 44, x: -22, y: 9 }),
						svgText({ class: 'fe-fig-memo__module-label', x: 0, y: 38 }, 'LRU'),
					]),
					// Engine block on the miss lane
					svg('g', { class: 'fe-fig-memo__engine', transform: `translate(214, ${MISS_Y})` }, [
						svg('line', { class: 'fe-fig-memo__engine-link', x1: -12, x2: 10, y1: -6, y2: -8 }),
						svg('line', { class: 'fe-fig-memo__engine-link', x1: 10, x2: 0, y1: -8, y2: 12 }),
						svg('line', { class: 'fe-fig-memo__engine-link', x1: 0, x2: -12, y1: 12, y2: -6 }),
						svg('circle', { class: 'fe-fig-memo__engine-node', cx: -12, cy: -6, r: 7 }),
						svg('circle', { class: 'fe-fig-memo__engine-node', cx: 10, cy: -8, r: 7 }),
						svg('circle', { class: 'fe-fig-memo__engine-node', cx: 0, cy: 12, r: 7 }),
						svgText({ class: 'fe-fig-memo__module-label', x: 0, y: 38 }, 'engine'),
					]),
					// Traveling query tokens (cyan data in motion)
					svg('circle', {
						class: 'fe-fig-memo__token is-hit',
						cx: TRACK_START,
						cy: HIT_Y,
						r: 4.5,
						style: `--dx: ${trackDelta}`,
					}),
					svg('circle', {
						class: 'fe-fig-memo__token is-miss',
						cx: TRACK_START,
						cy: MISS_Y,
						r: 4.5,
						style: `--dx: ${trackDelta}`,
					}),
				],
			),
		],
		className: 'fe-fig fe-fig-memo',
	});
}
