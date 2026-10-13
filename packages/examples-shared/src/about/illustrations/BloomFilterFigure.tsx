/**
 * `<BloomFilterFigure />` — animated illustration for the `BloomMembershipRule` probabilistic filter.
 *
 * @remarks
 * Two membership tests over a bit-array. The top query's k hash probes all land on set bits — the
 * verdict is "probably yes" (a rare false positive is possible, never a false negative). The bottom
 * query has a probe that lands on an unset bit, so it is "definitely not" — rejected in a few bit
 * checks, before any exact comparison. The bit-array (data) and the verdicts are cyan/gray; the hash
 * probes (the engine checking) are phosphor and transient. The base frame shows both verdicts settled.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

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

/** X center of a bit cell. */
function cellCenter(index: number): number {
	return GRID_LEFT + index * CELL_STEP + CELL_WIDTH / 2;
}

/**
 * The Bloom-filter membership figure.
 */
export const BloomFilterFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-bloom${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="Two membership tests over a bit array: one query's hash probes all hit set bits (probably yes), another has a probe hitting an unset bit (definitely not)."
		>
			<svg viewBox="0 0 460 210" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{LANES.map((lane) => {
					const litSet = new Set(lane.lit);
					const probeSet = new Set(lane.probes);

					return (
						<g key={lane.query} className={lane.verdict ? 'fe-fig-bloom__lane is-yes' : 'fe-fig-bloom__lane is-no'}>
							{/* Query chip */}
							<rect x={12} y={lane.cy - 16} width={84} height={32} rx={6} className="fe-fig-bloom__query" />
							<text x={54} y={lane.cy} className="fe-fig-bloom__query-label">
								{lane.query}
							</text>

							{/* Bit array */}
							{Array.from({ length: CELL_COUNT }, (_, index) => {
								const isProbeMiss = probeSet.has(index) && !litSet.has(index);

								return (
									<rect
										key={index}
										x={GRID_LEFT + index * CELL_STEP}
										y={lane.cy - 9}
										width={CELL_WIDTH}
										height={18}
										rx={2}
										className={
											litSet.has(index)
												? 'fe-fig-bloom__bit is-set'
												: isProbeMiss
													? 'fe-fig-bloom__bit is-miss'
													: 'fe-fig-bloom__bit'
										}
									/>
								);
							})}

							{/* Hash probes (phosphor) */}
							{lane.probes.map((index, order) => (
								<line
									key={index}
									x1={54}
									y1={lane.cy - 16}
									x2={cellCenter(index)}
									y2={lane.cy - 11}
									className="fe-fig-bloom__probe"
									style={{ animationDelay: `${300 + order * 220}ms` }}
								/>
							))}

							{/* Verdict */}
							<text x={366} y={lane.cy} className="fe-fig-bloom__verdict">
								{lane.verdict ? 'probably yes' : 'definitely not'}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
};
