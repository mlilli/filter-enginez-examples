/**
 * `<TextIndexFigure />` — animated illustration for the inverted text index.
 *
 * @remarks
 * A whole-word phrase search ("buttery oak") is split into words; each word maps to a posting list of
 * the documents that contain it, and the answer is the intersection of those lists — resolved
 * straight from the index instead of scanning every string. Framed around words + posting lists (not
 * bit-lanes) so it reads distinctly from the Roaring-bitmap figure. The intersect step is the engine
 * working (a transient phosphor `∩` pulse); the words, postings, and matched documents are data
 * (cyan). The base frame shows the matches resolved.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

/** A posting-list entry: a document id and whether it survives the intersection. */
interface Posting {
	readonly id: number;
	readonly isMatch: boolean;
}

const POSTINGS_A: readonly Posting[] = [
	{ id: 12, isMatch: false },
	{ id: 47, isMatch: true },
	{ id: 88, isMatch: true },
	{ id: 150, isMatch: false },
];
const POSTINGS_B: readonly Posting[] = [
	{ id: 47, isMatch: true },
	{ id: 88, isMatch: true },
	{ id: 201, isMatch: false },
];

const ROW_STEP = 27;

/** Render a posting column at `x`, starting at `top`. */
function postingColumn(postings: readonly Posting[], x: number, top: number): React.ReactElement[] {
	return postings.map((posting, index) => {
		const y = top + index * ROW_STEP;

		return (
			<g key={posting.id} className={posting.isMatch ? 'fe-fig-text__post is-match' : 'fe-fig-text__post'} style={posting.isMatch ? { animationDelay: `${700 + index * 120}ms` } : undefined}>
				<rect x={x} y={y} width={80} height={22} rx={3} className="fe-fig-text__post-box" />
				<text x={x + 40} y={y + 11} className="fe-fig-text__post-id">
					#{posting.id}
				</text>
			</g>
		);
	});
}

/**
 * The inverted-text-index figure.
 */
export const TextIndexFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-text${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="A two-word search is split into words; each maps to a posting list of documents, and the matching documents are the intersection of the two lists."
		>
			<svg viewBox="0 0 460 250" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{/* ── Search box ── */}
				<rect x={20} y={16} width={214} height={34} rx={6} className="fe-fig-text__search" />
				<circle cx={40} cy={33} r={6} className="fe-fig-text__glass" />
				<line x1={44} y1={37} x2={49} y2={42} className="fe-fig-text__glass-handle" />
				<text x={60} y={33} className="fe-fig-text__search-text">
					buttery oak
				</text>

				{/* ── Word tokens ── */}
				{[{ label: 'buttery', width: 78, x: 34 }, { label: 'oak', width: 52, x: 168 }].map((word) => (
					<g key={word.label}>
						<rect x={word.x} y={72} width={word.width} height={26} rx={13} className="fe-fig-text__word" />
						<text x={word.x + word.width / 2} y={85} className="fe-fig-text__word-label">
							{word.label}
						</text>
					</g>
				))}

				<text x={34} y={116} className="fe-fig-text__eyebrow">
					postings
				</text>
				<text x={168} y={116} className="fe-fig-text__eyebrow">
					postings
				</text>

				{postingColumn(POSTINGS_A, 34, 124)}
				{postingColumn(POSTINGS_B, 168, 124)}

				{/* ── Intersect ── */}
				<text x={280} y={158} className="fe-fig-text__cap">
					∩
				</text>
				<circle className="fe-fig-text__pulse" cx={280} cy={172} r={4} />

				{/* ── Matches ── */}
				<rect x={318} y={120} width={124} height={92} rx={6} className="fe-fig-text__result" />
				<text x={380} y={138} className="fe-fig-text__eyebrow is-centered">
					matches
				</text>
				{[47, 88].map((id, index) => (
					<g key={id} className="fe-fig-text__match" style={{ animationDelay: `${1100 + index * 160}ms` }}>
						<rect x={332} y={150 + index * 30} width={96} height={24} rx={4} className="fe-fig-text__match-box" />
						<text x={380} y={162 + index * 30} className="fe-fig-text__match-id">
							#{id}
						</text>
					</g>
				))}
			</svg>
		</div>
	);
};
