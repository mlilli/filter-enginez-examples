/**
 * `<fe-bloom-filter-figure>` — the `BloomMembershipRule` illustration.
 *
 * @remarks
 * Two membership tests over a bit-array: the top query's k hash probes all hit set bits ("probably
 * yes"); the bottom query has a probe on an unset bit ("definitely not"), rejected in a few bit
 * checks. The probes are phosphor (engine checking); the bits + verdicts are cyan/gray (data).
 * Geometry is verbatim from the React / Vue figures; the `fe-fig-bloom__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * The Vue original resolves each bit's class and each probe's endpoint with template helpers; here
 * they are resolved once into a rendered-lane table, so the markup stays declarative and nothing is
 * recomputed on every change-detection pass. The emitted SVG is identical.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

/** One membership-test lane, as authored. */
interface BloomLane {
	/** Y center of the lane in the 460×210 viewBox. */
	readonly cy: number;
	/** Indices of the bits that are set in this lane's array (0–15). */
	readonly lit: readonly number[];
	/** The k hash-probe bit indices. */
	readonly probes: readonly number[];
	readonly query: string;
	/** `true` when every probe hits a set bit → "probably yes"; `false` → "definitely not". */
	readonly verdict: boolean;
}

/** One bit cell, resolved. */
interface RenderedBit {
	readonly className: string;
	readonly x: number;
}

/** One hash probe, resolved to its landing point and stagger delay. */
interface RenderedProbe {
	readonly delayMs: number;
	readonly x2: number;
}

/** A lane with every per-element value resolved. */
interface RenderedLane {
	readonly bits: readonly RenderedBit[];
	readonly cy: number;
	readonly laneClass: string;
	readonly probes: readonly RenderedProbe[];
	readonly query: string;
	readonly verdictLabel: string;
}

const CELL_COUNT = 16;
const CELL_STEP = 15;
const CELL_WIDTH = 13;
const GRID_LEFT = 112;

/** The two lanes. Top: all probes hit set bits. Bottom: probe at 8 hits an unset bit. */
const LANES: readonly BloomLane[] = [
	{ cy: 54, lit: [1, 2, 4, 7, 9, 12, 14], probes: [2, 7, 12], query: 'id 4417', verdict: true },
	{ cy: 150, lit: [0, 3, 5, 10, 13, 15], probes: [3, 8, 13], query: 'id 9902', verdict: false },
];

/** Bit-cell indices, for iteration. */
const CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, index) => index);

/** X center of a bit cell — where a probe lands. */
function cellCenter(index: number): number {
	return GRID_LEFT + index * CELL_STEP + CELL_WIDTH / 2;
}

/** Class for a bit cell: set bits light up, a probe landing on an unset bit is the miss. */
function bitClass(lane: BloomLane, index: number): string {
	if (lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-set';
	}

	if (lane.probes.includes(index) && !lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-miss';
	}

	return 'fe-fig-bloom__bit';
}

/** The lanes with every per-element value resolved. */
const RENDERED_LANES: readonly RenderedLane[] = LANES.map((lane) => ({
	bits: CELLS.map((index) => ({ className: bitClass(lane, index), x: GRID_LEFT + index * CELL_STEP })),
	cy: lane.cy,
	laneClass: lane.verdict ? 'fe-fig-bloom__lane is-yes' : 'fe-fig-bloom__lane is-no',
	probes: lane.probes.map((index, order) => ({ delayMs: 300 + order * 220, x2: cellCenter(index) })),
	query: lane.query,
	verdictLabel: lane.verdict ? 'probably yes' : 'definitely not',
}));

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-bloom-filter-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-bloom"
			role="img"
			aria-label="Two membership tests over a bit array: one query's hash probes all hit set bits (probably yes), another has a probe hitting an unset bit (definitely not)."
		>
			<svg viewBox="0 0 460 210" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-bloom__svg">
				@for (lane of lanes; track lane.query) {
					<g [class]="lane.laneClass">
						<!-- Query chip -->
						<rect x="12" [attr.y]="lane.cy - 16" width="84" height="32" rx="6" class="fe-fig-bloom__query" />
						<text x="54" [attr.y]="lane.cy" class="fe-fig-bloom__query-label">{{ lane.query }}</text>

						<!-- Bit array -->
						@for (bit of lane.bits; track $index) {
							<rect
								[attr.x]="bit.x"
								[attr.y]="lane.cy - 9"
								[attr.width]="cellWidth"
								height="18"
								rx="2"
								[class]="bit.className"
							/>
						}

						<!-- Hash probes (phosphor) -->
						@for (probe of lane.probes; track $index) {
							<line
								x1="54"
								[attr.y1]="lane.cy - 16"
								[attr.x2]="probe.x2"
								[attr.y2]="lane.cy - 11"
								class="fe-fig-bloom__probe"
								[style.animation-delay.ms]="probe.delayMs"
							/>
						}

						<!-- Verdict -->
						<text x="366" [attr.y]="lane.cy" class="fe-fig-bloom__verdict">{{ lane.verdictLabel }}</text>
					</g>
				}
			</svg>
		</div>
	`,
})
export class BloomFilterFigureComponent {
	/** Width of a single bit cell. */
	protected readonly cellWidth = CELL_WIDTH;

	/** The two resolved lanes, exposed for the template. */
	protected readonly lanes = RENDERED_LANES;
}
