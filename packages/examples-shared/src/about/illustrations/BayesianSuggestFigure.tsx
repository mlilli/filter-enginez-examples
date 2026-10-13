/**
 * `<BayesianSuggestFigure />` — animated illustration for the Bayesian co-occurrence suggestion model.
 *
 * @remarks
 * Given the current selection (cyan chips), the engine tallies which other filter-options historically
 * co-occur with it and ranks the most likely next filters, drawn as probability bars. The tally is the
 * engine working (a transient phosphor pulse down the connector); the selection chips and the
 * resulting probability bars are data (cyan). The base frame shows the bars filled — the settled
 * ranking — so reduced-motion and off-screen idle read as a clean suggestions panel.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

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

/** Geometry for the suggestion rows. */
const BAR_X = 150;
const BAR_MAX_WIDTH = 288;
const ROW_TOP = 120;
const ROW_STEP = 30;

/**
 * The Bayesian-suggestion figure.
 */
export const BayesianSuggestFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-bayes${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="From the current filter selection, the engine ranks the filters most likely to be chosen next, shown as probability bars."
		>
			<svg viewBox="0 0 460 250" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{/* ── Current selection ── */}
				<text x={20} y={28} className="fe-fig-bayes__eyebrow">
					current selection
				</text>
				{[{ label: 'napa', x: 20 }, { label: 'cabernet', x: 96 }].map((chip) => (
					<g key={chip.label}>
						<rect x={chip.x} y={38} width={chip.label.length > 5 ? 84 : 66} height={26} rx={13} className="fe-fig-bayes__chip is-selected" />
						<text x={chip.x + (chip.label.length > 5 ? 42 : 33)} y={51} className="fe-fig-bayes__chip-label is-selected">
							{chip.label}
						</text>
					</g>
				))}

				{/* ── Co-occurrence tally connector (phosphor, transient) ── */}
				<line x1={40} y1={70} x2={40} y2={104} className="fe-fig-bayes__connector" />
				<circle className="fe-fig-bayes__pulse" cx={40} cy={70} r={3.5} />

				<text x={20} y={104} className="fe-fig-bayes__eyebrow">
					suggested filters
				</text>

				{/* ── Suggestion rows ── */}
				{SUGGESTIONS.map((suggestion, index) => {
					const y = ROW_TOP + index * ROW_STEP;
					const width = suggestion.probability * BAR_MAX_WIDTH;

					return (
						<g key={suggestion.label} className={index === 0 ? 'fe-fig-bayes__row is-top' : 'fe-fig-bayes__row'}>
							<text x={BAR_X - 10} y={y + 9} className="fe-fig-bayes__row-label">
								{suggestion.label}
							</text>
							<rect x={BAR_X} y={y} width={BAR_MAX_WIDTH} height={13} rx={3} className="fe-fig-bayes__bar-track" />
							<rect
								x={BAR_X}
								y={y}
								width={width}
								height={13}
								rx={3}
								className="fe-fig-bayes__bar"
								style={{ animationDelay: `${600 + index * 180}ms` }}
							/>
							<text x={BAR_X + width + 8} y={y + 9} className="fe-fig-bayes__pct">
								{Math.round(suggestion.probability * 100)}%
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
};
