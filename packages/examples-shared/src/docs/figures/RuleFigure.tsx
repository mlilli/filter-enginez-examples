/**
 * `<RuleFigure />` — the one animated figure that serves every rule page.
 *
 * @remarks
 * A filter rule is fundamentally "does this record match this predicate?" — so a single parameterized
 * figure covers all fifteen. It shows the rule's predicate over a short column of sample records; a
 * phosphor evaluation cursor sweeps down, and each record resolves cyan (pass, with a ✓) or gray
 * (fail). Same brand contract as the `/about` figures: cyan = data, phosphor = the evaluation
 * happening. The base (un-animated) state is the resolved frame, so `prefers-reduced-motion` and the
 * off-screen idle both show a legible static result; motion is added only under `no-preference` while
 * on-screen.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../../about/useInView.js';
import { type RuleFigureSpec } from '../content/types.js';

/** Props for {@link RuleFigure}. */
export interface RuleFigureProps {
	/** The predicate + sample records to judge. */
	readonly spec: RuleFigureSpec;
}

const ROW_TOP = 66;
const ROW_STEP = 24;
const SWEEP_MS = 4200;

/**
 * The generic rule figure.
 */
export const RuleFigure = ({ spec }: RuleFigureProps): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });
	const cells = spec.cells.slice(0, 6);
	const matched = cells.filter((cell) => cell.pass).length;
	const height = ROW_TOP + cells.length * ROW_STEP + 34;
	// Precompute stable per-row keys (labels can repeat) + geometry outside the JSX map, so the JSX
	// `key` is a real string rather than the array index (which react/no-array-index-key forbids).
	const rows = cells.map((cell, position) => ({
		cell,
		delayMs: (position / Math.max(cells.length, 1)) * (SWEEP_MS * 0.42),
		key: `row-${position}`,
		y: ROW_TOP + position * ROW_STEP,
	}));

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-rulefig${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label={`Sample records judged against the predicate ${spec.predicate}: ${matched} of ${cells.length} match.`}
		>
			<style>{RULEFIG_CSS}</style>
			<svg viewBox={`0 0 440 ${height}`} xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{/* ── Predicate bar ── */}
				<rect x={16} y={16} width={408} height={34} rx={6} className="fe-rulefig__predicate" />
				<text x={30} y={33} className="fe-rulefig__predicate-tag">
					matches
				</text>
				<text x={94} y={33} className="fe-rulefig__predicate-text">
					{spec.predicate}
				</text>

				{/* ── Sample records ── */}
				{rows.map(({ cell, delayMs, key, y }) => (
					<g
						key={key}
						className={`fe-rulefig__row ${cell.pass ? 'is-pass' : 'is-fail'}`}
						style={{ animationDelay: `${delayMs}ms` }}
					>
						<rect x={16} y={y} width={392} height={ROW_STEP - 5} rx={4} className="fe-rulefig__row-box" />
						<text x={30} y={y + 11} className="fe-rulefig__row-label">
							{cell.label}
						</text>
						<text x={396} y={y + 11} className="fe-rulefig__row-mark">
							{cell.pass ? '✓' : '·'}
						</text>
					</g>
				))}

				{/* ── Phosphor evaluation cursor ── */}
				<rect className="fe-rulefig__cursor" x={16} y={ROW_TOP - 4} width={392} height={2} rx={1} />

				{/* ── Readout ── */}
				<text x={16} y={height - 12} className="fe-rulefig__count">
					{matched} of {cells.length} match
				</text>
			</svg>
		</div>
	);
};

/** Scoped styles + keyframes. Base = resolved frame; motion added only under no-preference. */
const RULEFIG_CSS = `
.fe-rulefig__svg { width: 100%; height: auto; display: block; }
.fe-rulefig__predicate { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1; }
.fe-rulefig__predicate-tag {
	fill: var(--gray-8);
	font-family: var(--font-mono);
	font-size: 10px;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	dominant-baseline: middle;
}
.fe-rulefig__predicate-text {
	fill: var(--accent-glow);
	font-family: var(--font-mono);
	font-size: 13px;
	dominant-baseline: middle;
}
.fe-rulefig__row-box { fill: var(--gray-1); stroke: var(--gray-4); stroke-width: 1; }
.fe-rulefig__row-label {
	fill: var(--gray-9);
	font-family: var(--font-mono);
	font-size: 12px;
	dominant-baseline: middle;
}
.fe-rulefig__row-mark {
	font-family: var(--font-mono);
	font-size: 13px;
	text-anchor: end;
	dominant-baseline: middle;
}
/* Resolved (completed-frame) states. */
.fe-rulefig__row.is-pass .fe-rulefig__row-box { fill: var(--accent-soft); stroke: var(--accent); }
.fe-rulefig__row.is-pass .fe-rulefig__row-label { fill: var(--accent-glow); }
.fe-rulefig__row.is-pass .fe-rulefig__row-mark { fill: var(--accent); }
.fe-rulefig__row.is-fail { opacity: 0.5; }
.fe-rulefig__row.is-fail .fe-rulefig__row-mark { fill: var(--gray-6); }
.fe-rulefig__cursor { fill: var(--engine); opacity: 0; filter: drop-shadow(0 0 5px var(--engine-haze)); }
.fe-rulefig__count {
	fill: var(--accent);
	font-family: var(--font-mono);
	font-size: 12px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: no-preference) {
	.fe-rulefig.is-playing .fe-rulefig__cursor { animation: fe-rulefig-sweep ${SWEEP_MS}ms var(--ease-in-out) infinite; }
	.fe-rulefig.is-playing .fe-rulefig__row.is-pass { animation: fe-rulefig-pass ${SWEEP_MS}ms var(--ease-out) infinite; }
	.fe-rulefig.is-playing .fe-rulefig__row.is-fail { animation: fe-rulefig-fail ${SWEEP_MS}ms var(--ease-out) infinite; }
}

@keyframes fe-rulefig-sweep {
	0% { transform: translateY(0); opacity: 0; }
	4% { opacity: 0.9; }
	42% { transform: translateY(150px); opacity: 0.9; }
	48% { transform: translateY(150px); opacity: 0; }
	100% { transform: translateY(150px); opacity: 0; }
}
/* Rows resolve (with per-row delay) as the cursor passes; base is the resolved state. */
@keyframes fe-rulefig-pass {
	0% { opacity: 1; }
	6% { opacity: 0.35; }
	40% { opacity: 1; }
	100% { opacity: 1; }
}
@keyframes fe-rulefig-fail {
	0% { opacity: 0.5; }
	6% { opacity: 0.35; }
	40% { opacity: 0.5; }
	100% { opacity: 0.5; }
}
`;
