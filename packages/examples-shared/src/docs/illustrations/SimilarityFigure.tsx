/**
 * `<SimilarityFigure />` — animated illustration for the MinHash + LSH "find similar" engine.
 *
 * @remarks
 * A query item is reduced to a compact MinHash signature; LSH banding drops items with matching
 * signatures into the same bucket, so "find similar" is a bucket lookup rather than an all-pairs
 * comparison. The signature computation is the engine working (a transient phosphor scan across the
 * signature cells); the signature values, the bucket, and the surfaced neighbors are data (cyan). The
 * base frame shows the neighbors already surfaced.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

/** The MinHash signature values (illustrative min-hashes). */
const SIGNATURE = ['3', '7', '1', '9', '2', '5', '8', '4'] as const;

/** Nearest neighbors surfaced from the shared bucket, with match scores. */
const NEIGHBORS: readonly { label: string; score: number }[] = [
	{ label: 'malbec', score: 94 },
	{ label: 'syrah', score: 89 },
	{ label: 'tempranillo', score: 82 },
];

const CELL_STEP = 19;
const SIG_LEFT = 128;
const SIG_Y = 56;

/**
 * The MinHash + LSH similarity figure.
 */
export const SimilarityFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-sim${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="A query item is reduced to a MinHash signature; LSH banding buckets similar items, and the nearest neighbors light up."
		>
			<svg viewBox="0 0 460 214" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{/* ── Query item ── */}
				<rect x={14} y={82} width={92} height={48} rx={6} className="fe-fig-sim__query" />
				<text x={60} y={106} className="fe-fig-sim__query-label">
					this wine
				</text>

				{/* ── MinHash signature ── */}
				<text x={SIG_LEFT} y={44} className="fe-fig-sim__eyebrow">
					MinHash signature
				</text>
				{SIGNATURE.map((value, index) => (
					<g key={value}>
						<rect x={SIG_LEFT + index * CELL_STEP} y={SIG_Y} width={16} height={22} rx={2} className="fe-fig-sim__cell" />
						<text x={SIG_LEFT + index * CELL_STEP + 8} y={SIG_Y + 11} className="fe-fig-sim__cell-value">
							{value}
						</text>
					</g>
				))}
				{/* Phosphor compute scan across the signature */}
				<rect className="fe-fig-sim__scan" x={SIG_LEFT - 2} y={SIG_Y - 3} width={2.5} height={28} rx={1.25} />

				{/* ── LSH bucket ── */}
				<rect x={296} y={44} width={150} height={150} rx={6} className="fe-fig-sim__bucket" />
				<text x={371} y={62} className="fe-fig-sim__eyebrow is-centered">
					LSH bucket
				</text>
				{NEIGHBORS.map((neighbor, index) => {
					const y = 78 + index * 36;

					return (
						<g key={neighbor.label} className="fe-fig-sim__neighbor" style={{ animationDelay: `${900 + index * 200}ms` }}>
							<rect x={308} y={y} width={126} height={28} rx={4} className="fe-fig-sim__neighbor-box" />
							<text x={318} y={y + 14} className="fe-fig-sim__neighbor-label">
								{neighbor.label}
							</text>
							<text x={426} y={y + 14} className="fe-fig-sim__neighbor-score">
								{neighbor.score}%
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
};
