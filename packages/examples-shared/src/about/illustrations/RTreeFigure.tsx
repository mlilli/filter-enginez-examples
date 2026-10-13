/**
 * `<RTreeFigure />` — animated hero illustration for the R-tree spatial-index layer.
 *
 * @remarks
 * A map of listings (dots) wrapped in nested bounding boxes. A cyan search circle ("within 5 mi")
 * sits off-center. The traversal tests each root box: boxes that can't intersect the circle — and
 * every dot inside them — sink to gray (pruned, never checked); the one box that does intersect hands
 * off to its children, and only the dots actually inside the circle ignite cyan. The engine throws
 * away whole regions instead of testing every point. Box-test pulses (engine working) are phosphor;
 * the circle and the result dots (query + data) are cyan. Pruning sinks to gray — it's a win, never
 * an error, so never red.
 *
 * The BASE frame is the resolved post-traversal state (branches pruned, results glowing) — the
 * reduced-motion fallback — and every keyframe returns to it, re-running the traversal each loop for
 * a live-instrument feel. Motion is added only under `no-preference` while on-screen.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

/** A dot (listing) on the map. */
type Dot = readonly [x: number, y: number];

/** Dots inside the search circle — ignite cyan. */
const RESULT_DOTS: readonly Dot[] = [[285, 120], [320, 140], [300, 170], [340, 158], [270, 148], [315, 112], [298, 192], [343, 185]];
/** Dots inside the intersecting box but outside the circle — stay mid-gray. */
const NEUTRAL_DOTS: readonly Dot[] = [[232, 64], [392, 72], [388, 150], [228, 182]];
/** Dots inside the top-left pruned box. */
const PRUNED_A_DOTS: readonly Dot[] = [[60, 60], [112, 50], [150, 92], [82, 112], [132, 120]];
/** Dots inside the bottom-left pruned box. */
const PRUNED_C_DOTS: readonly Dot[] = [[60, 205], [112, 192], [152, 232], [82, 252], [122, 256]];

/** Render a list of dots with a shared class. */
function dots(list: readonly Dot[], className: string): React.ReactElement[] {
	return list.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} className={className} />);
}

/**
 * The R-tree spatial-index figure.
 */
export const RTreeFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-rtree${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="A map of listings in nested bounding boxes with a search circle. Boxes that can't overlap the circle dim to gray along with their points; only points inside the circle light up."
		>
			<svg viewBox="0 0 440 322" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				<rect x={8} y={8} width={424} height={284} rx={8} className="fe-fig-rtree__panel" />

				{/* ── Pruned root box A (top-left) + its dots ── */}
				<g className="fe-fig-rtree__box is-pruned" style={{ animationDelay: '0ms' }}>
					<rect x={30} y={30} width={155} height={115} rx={4} className="fe-fig-rtree__box-rect" />
					{dots(PRUNED_A_DOTS, 'fe-fig-rtree__dot is-pruned')}
				</g>

				{/* ── Pruned root box C (bottom-left) + its dots ── */}
				<g className="fe-fig-rtree__box is-pruned" style={{ animationDelay: '260ms' }}>
					<rect x={30} y={175} width={155} height={100} rx={4} className="fe-fig-rtree__box-rect" />
					{dots(PRUNED_C_DOTS, 'fe-fig-rtree__dot is-pruned')}
				</g>

				{/* ── Visited root box B (right) with two children ── */}
				<g className="fe-fig-rtree__box is-visited">
					<rect x={205} y={42} width={210} height={170} rx={4} className="fe-fig-rtree__box-rect" />
				</g>
				<g className="fe-fig-rtree__box is-child" style={{ animationDelay: '0ms' }}>
					<rect x={222} y={58} width={92} height={130} rx={3} className="fe-fig-rtree__box-rect" />
				</g>
				<g className="fe-fig-rtree__box is-child" style={{ animationDelay: '180ms' }}>
					<rect x={322} y={64} width={84} height={120} rx={3} className="fe-fig-rtree__box-rect" />
				</g>

				{/* ── Neutral dots (visited box, outside circle) ── */}
				{dots(NEUTRAL_DOTS, 'fe-fig-rtree__dot is-neutral')}

				{/* ── Search circle (cyan query) ── */}
				<circle cx={305} cy={150} r={80} className="fe-fig-rtree__circle" />
				<text x={305} y={150} className="fe-fig-rtree__circle-label">
					within 5 mi
				</text>

				{/* ── Result dots (cyan, ignite) ── */}
				{RESULT_DOTS.map(([x, y], index) => (
					<circle
						key={`${x}-${y}`}
						cx={x}
						cy={y}
						r={4}
						className="fe-fig-rtree__dot is-result"
						style={{ animationDelay: `${index * 55}ms` }}
					/>
				))}

				{/* ── Readout ── */}
				<text x={12} y={312} className="fe-fig-rtree__count">
					8 results
				</text>
				<text x={104} y={312} className="fe-fig-rtree__pruned">
					· 2 branches pruned
				</text>
			</svg>
		</div>
	);
};
