/**
 * `<SimulationPane />` — the `/lab` pane that drives `useSimulation`, the first of the three engine
 * capabilities the docs advertise and nothing calls.
 *
 * @remarks
 * For every candidate rule the visitor has NOT applied, the pane shows what the result set WOULD be
 * — `resultCount` and `wouldBeEmpty` — and lets them commit the rule to watch every other
 * projection move.
 *
 * ### Why one component per candidate
 *
 * `useSimulation` is a hook, so it cannot be called in a loop. `<CandidateRow>` exists to give each
 * candidate its own render scope — which is the usage the hook's own `@example` documents, and the
 * reason the engine memoizes: N rows produce N cache lookups against one warm bitmap set rather
 * than N corpus scans.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { useActiveRules, useFilterEngine, useResultCount, useSimulation } from '@filter-enginez/react-signals';
import { useCallback } from 'react';

import { describeDelta, formatProjection, LAB_CANDIDATES, type LabCandidate } from './labCandidates.js';

/**
 * The simulation pane — a live result count, then one row per candidate rule.
 */
export const SimulationPane = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const activeRules = useActiveRules();
	const liveCount = useResultCount();

	const handleToggle = useCallback(
		(candidate: LabCandidate, isCommitted: boolean): void => {
			if (isCommitted) {
				engine.core.removeRule(candidate.ruleId);
			} else {
				engine.core.addRule(candidate.ruleId, candidate.rule);
			}
		},
		[engine],
	);

	return (
		<section className="fe-lab__pane" aria-labelledby="fe-lab-simulation-title">
			<h2 className="fe-lab__pane-title" id="fe-lab-simulation-title">
				What-if projections
			</h2>
			<p className="fe-lab__pane-lead">
				Every row below asks the engine what the result set would look like if that rule were
				applied — without applying it. Commit one and watch the others move: the projections are
				memoized against the active rule set, so changing it invalidates all of them at once.
			</p>
			<p className="fe-lab__live" aria-live="polite">
				<span className="fe-lab__live-count">{liveCount.toLocaleString()}</span>
				{' '}books match the current filters
			</p>
			<ul className="fe-lab__rows">
				{LAB_CANDIDATES.map((candidate) => (
					<CandidateRow
						candidate={candidate}
						isCommitted={activeRules.has(candidate.ruleId)}
						key={candidate.ruleId}
						liveCount={liveCount}
						onToggle={handleToggle}
					/>
				))}
			</ul>
		</section>
	);
};

/** Props for {@link CandidateRow}. */
interface CandidateRowProps {
	/** The rule this row projects and commits. */
	readonly candidate: LabCandidate;
	/** Whether the rule is currently registered on the engine. */
	readonly isCommitted: boolean;
	/** The engine's live result count, for the delta readout. */
	readonly liveCount: number;
	/** Commit or withdraw the candidate. */
	readonly onToggle: (candidate: LabCandidate, isCommitted: boolean) => void;
}

/**
 * One candidate: its label, the engine's projection for it, and a commit toggle.
 *
 * @remarks
 * The `withRule` tuple is rebuilt each render, but its two ENTRIES are stable — the id is a string
 * literal and the rule is a module-level instance — and `useSimulation` memoizes on those entries
 * rather than on the tuple, so the projection is computed once per active-rule-set change.
 *
 * @internal
 */
const CandidateRow = ({ candidate, isCommitted, liveCount, onToggle }: CandidateRowProps): React.ReactElement => {
	// Renamed on destructure: the engine's own field is `wouldBeEmpty`, and `would` is not one of the
	// boolean prefixes `@typescript-eslint/naming-convention` allows for a variable. Renaming the
	// LOCAL keeps the engine's public API spelled as it is rather than bending a published type name
	// to a lint rule about local identifiers.
	const { resultCount, wouldBeEmpty: isProjectedEmpty } = useSimulation<Book>({
		withRule: [candidate.ruleId, candidate.rule],
	});

	return (
		<li className={isCommitted ? 'fe-lab__row fe-lab__row--committed' : 'fe-lab__row'}>
			<div className="fe-lab__row-text">
				<span className="fe-lab__row-label">{candidate.label}</span>
				<span className="fe-lab__row-description">{candidate.description}</span>
			</div>
			<div className="fe-lab__row-projection">
				<span className={isProjectedEmpty ? 'fe-lab__projection fe-lab__projection--empty' : 'fe-lab__projection'}>
					{formatProjection(resultCount, isProjectedEmpty)}
				</span>
				<span className="fe-lab__delta">{describeDelta(resultCount, liveCount)}</span>
			</div>
			<button
				aria-pressed={isCommitted}
				className="fe-lab__commit"
				onClick={() => {
					onToggle(candidate, isCommitted);
				}}
				type="button"
			>
				{isCommitted ? 'Withdraw' : 'Apply'}
			</button>
		</li>
	);
};
