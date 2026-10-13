/**
 * `about/figures/bloom` — framework-less port of the `BloomMembershipRule` illustration.
 *
 * @remarks
 * Two membership tests over a bit-array: the top query's k hash probes all hit set bits ("probably
 * yes"); the bottom query has a probe on an unset bit ("definitely not"), rejected in a few bit
 * checks. The probes are phosphor (engine checking); the bits + verdicts are cyan/gray (data).
 * Geometry is verbatim from the React figure; the `fe-fig-bloom__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import { el, svg } from '../../dom.js';
import { svgText } from './svgText.js';

/** One membership-test lane. */
interface BloomLane {
	/** Indices of the bits that are set in this lane's array (0–15). */
	readonly lit: readonly number[];
	/** The k hash-probe bit indices. */
	readonly probes: readonly number[];
	readonly query: string;
	/** `true` when every probe hits a set bit → "probably yes"; `false` → "definitely not". */
	readonly verdict: boolean;
}

const CELL_COUNT = 16;
const CELL_STEP = 15;
const CELL_WIDTH = 13;
const GRID_LEFT = 112;

/** The two lanes. Top: all probes hit set bits. Bottom: probe at 8 hits an unset bit. */
const LANES: readonly ({ cy: number } & BloomLane)[] = [
	{ cy: 54, lit: [1, 2, 4, 7, 9, 12, 14], probes: [2, 7, 12], query: 'id 4417', verdict: true },
	{ cy: 150, lit: [0, 3, 5, 10, 13, 15], probes: [3, 8, 13], query: 'id 9902', verdict: false },
];

/** Bit-cell indices, for iteration. */
const CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, index) => index);

/**
 * X center of a bit cell.
 *
 * @param index - The cell index.
 * @returns The cell's horizontal center in user units.
 */
function cellCenter(index: number): number {
	return GRID_LEFT + index * CELL_STEP + CELL_WIDTH / 2;
}

/**
 * Class for a bit cell: set bits read cyan, a probed-but-unset bit reads as the miss that ends the
 * test, everything else stays neutral.
 *
 * @param lane - The lane being rendered.
 * @param index - The cell index.
 * @returns The cell's class list.
 */
function bitClass(lane: BloomLane, index: number): string {
	if (lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-set';
	}

	if (lane.probes.includes(index) && !lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-miss';
	}

	return 'fe-fig-bloom__bit';
}

/**
 * Build the Bloom-membership figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createBloomFilterFigure(): HTMLElement {
	const laneGroups = LANES.map((lane) =>
		svg('g', { class: lane.verdict ? 'fe-fig-bloom__lane is-yes' : 'fe-fig-bloom__lane is-no' }, [
			// Query chip
			svg('rect', { class: 'fe-fig-bloom__query', height: 32, rx: 6, width: 84, x: 12, y: lane.cy - 16 }),
			svgText({ class: 'fe-fig-bloom__query-label', x: 54, y: lane.cy }, lane.query),
			// Bit array
			...CELLS.map((index) =>
				svg('rect', {
					class: bitClass(lane, index),
					height: 18,
					rx: 2,
					width: CELL_WIDTH,
					x: GRID_LEFT + index * CELL_STEP,
					y: lane.cy - 9,
				}),
			),
			// Hash probes (phosphor)
			...lane.probes.map((index, order) =>
				svg('line', {
					class: 'fe-fig-bloom__probe',
					style: `animation-delay: ${300 + order * 220}ms`,
					x1: 54,
					x2: cellCenter(index),
					y1: lane.cy - 16,
					y2: lane.cy - 11,
				}),
			),
			// Verdict
			svgText({ class: 'fe-fig-bloom__verdict', x: 366, y: lane.cy }, lane.verdict ? 'probably yes' : 'definitely not'),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				"Two membership tests over a bit array: one query's hash probes all hit set bits (probably yes), another has a probe hitting an unset bit (definitely not).",
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-bloom__svg', viewBox: '0 0 460 210', xmlns: 'http://www.w3.org/2000/svg' },
				laneGroups,
			),
		],
		className: 'fe-fig fe-fig-bloom',
	});
}
