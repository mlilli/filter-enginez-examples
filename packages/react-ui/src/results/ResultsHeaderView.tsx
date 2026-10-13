/**
 * `<ResultsHeaderView />` — the dumb, prop-driven view for the results strip (active-filter chips +
 * result count + computing indicator). All engine subscriptions and the rule→summary mapping live
 * in the app container; this component renders from plain data + callbacks.
 *
 * @remarks
 * Styling is the `fe-results-header` / `fe-active-filters` / `fe-filter-chip` / `fe-result-count` /
 * `fe-computing-indicator` classes in `@filter-enginez/ui-styles`. The idle/computing loaders come
 * from `@filter-enginez/brand`. No engine or state-library import.
 *
 * The public surface is just `ResultsHeaderView` + the `FilterSummary` contract; `FilterChip`,
 * `ResultCountRow`, `ComputingIndicator`, and `useTickingNumber` are private internals.
 */

import { NeuralCluster, SynapticOrbit } from '@filter-enginez/brand';
import { prefersReducedMotion } from '@filter-enginez/brand/motion';
import { useEffect, useRef, useState } from 'react';

/**
 * One active-filter chip's display data. `ruleId` is an opaque key the container maps back to its
 * own rule id in the remove callback.
 */
export interface FilterSummary {
	readonly isNumeric: boolean;
	readonly label: string;
	readonly ruleId: string;
	readonly value: string;
}

/**
 * Props for `<ResultsHeaderView />`.
 */
export interface ResultsHeaderViewProps {
	/** One entry per active, constraining rule (already filtered of no-op rules by the container). */
	readonly summaries: readonly FilterSummary[];
	/** Current filtered result count (the ticking target). */
	readonly resultCount: number;
	/** Full corpus size, for the delta + "filtered from N total" caption. */
	readonly totalCount: number;
	/** Whether a worker round-trip is in flight (drives the computing indicator alongside the tick). */
	readonly isFetching: boolean;
	/** Remove a single rule (the chip ×). */
	readonly onRemoveRule: (ruleId: string) => void;
	/** Clear every rule (the "Clear all" link). */
	readonly onClearAll: () => void;
	/**
	 * Optional: active-rule count read from a state mirror (e.g. the redux-bridge slice's
	 * `activeRuleIds.length`) rather than derived from `summaries`. When provided, renders a small
	 * provenance badge in the count row — the RTK app uses it to show the Redux mirror agreeing
	 * with the signals-derived chips. Omitted by the signals-only plain app.
	 */
	readonly mirrorActiveCount?: number;
	/**
	 * Optional: the rule id most recently mutated (e.g. the redux-bridge slice's
	 * `lastChangeRuleId`). When it matches a chip's `ruleId`, that chip gets a brief
	 * "recently changed" emphasis. Omitted by the plain app.
	 */
	readonly recentlyChangedRuleId?: string | null;
}

/**
 * The results strip: active-filter chips above, result-count row below.
 */
export const ResultsHeaderView = (props: ResultsHeaderViewProps): React.ReactElement => {
	const {
		isFetching,
		mirrorActiveCount,
		onClearAll,
		onRemoveRule,
		recentlyChangedRuleId = null,
		resultCount,
		summaries,
		totalCount,
	} = props;

	return (
		<div className="fe-results-header">
			<ActiveFiltersBar
				summaries={summaries}
				onRemoveRule={onRemoveRule}
				onClearAll={onClearAll}
				recentlyChangedRuleId={recentlyChangedRuleId}
				mirrorActiveCount={mirrorActiveCount}
			/>
			<ResultCountRow
				resultCount={resultCount}
				totalCount={totalCount}
				isFetching={isFetching}
			/>
		</div>
	);
};

/**
 * Active-filter chip readout — one capsule per active rule + a "Clear all" link.
 *
 * @internal
 */
const ActiveFiltersBar = ({
	mirrorActiveCount,
	onClearAll,
	onRemoveRule,
	recentlyChangedRuleId,
	summaries,
}: {
	readonly mirrorActiveCount?: number;
	readonly onClearAll: () => void;
	readonly onRemoveRule: (ruleId: string) => void;
	readonly recentlyChangedRuleId: string | null;
	readonly summaries: readonly FilterSummary[];
}): React.ReactElement => {
	if (summaries.length === 0) {
		return <div className="fe-active-filters__empty">No filters active — showing the full corpus.</div>;
	}

	return (
		<div className="fe-active-filters">
			<span className="fe-active-filters__count">
				{summaries.length} {summaries.length === 1 ? 'filter' : 'filters'}
			</span>
			<div className="fe-active-filters__chips">
				{summaries.map((summary) => (
					<FilterChip
						key={summary.ruleId}
						label={summary.label}
						value={summary.value}
						isNumeric={summary.isNumeric}
						isRecentlyChanged={summary.ruleId === recentlyChangedRuleId}
						onRemove={() => onRemoveRule(summary.ruleId)}
					/>
				))}
				<button type="button" className="fe-active-filters__clear" onClick={onClearAll}>
					Clear all
				</button>
				{/* Redux-mirror provenance badge — present only when the container passes a mirror-sourced
				    active-rule count (the RTK app). Sits right after "Clear all" so the mirror agreement
				    reads alongside the filter controls it corroborates. */}
				{mirrorActiveCount !== undefined && (
					<span className="fe-active-filters__mirror" title="Active filter count read from the Redux mirror slice (redux-bridge)">
						redux mirror · {mirrorActiveCount} active
					</span>
				)}
			</div>
		</div>
	);
};

/**
 * Single removable filter capsule.
 *
 * @internal
 */
const FilterChip = ({
	isNumeric,
	isRecentlyChanged,
	label,
	onRemove,
	value,
}: {
	readonly isNumeric: boolean;
	readonly isRecentlyChanged: boolean;
	readonly label: string;
	readonly onRemove: () => void;
	readonly value: string;
}): React.ReactElement => {
	return (
		<div className={`fe-filter-chip${isRecentlyChanged ? ' fe-filter-chip--recent' : ''}`}>
			<span aria-hidden="true" className="fe-filter-chip__dot" />
			<span className="fe-filter-chip__label">{label}</span>
			<span className={`fe-filter-chip__value${isNumeric ? ' fe-filter-chip__value--numeric' : ''}`}>
				{value}
			</span>
			<button
				type="button"
				className="fe-filter-chip__remove"
				onClick={onRemove}
				aria-label={`Remove ${label} filter`}
			>
				<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	);
};

/**
 * Canonical result-count row — large accent number (ticking), results label, delta pill, and the
 * computing indicator pinned right. `isComputing` is the union of an in-flight fetch and a
 * mid-tick animation.
 *
 * @internal
 */
const ResultCountRow = ({
	isFetching,
	resultCount,
	totalCount,
}: {
	readonly isFetching: boolean;
	readonly resultCount: number;
	readonly totalCount: number;
}): React.ReactElement => {
	const [displayedCount, isTicking] = useTickingNumber(resultCount);
	const delta = resultCount - totalCount;
	const isComputing = isFetching || isTicking;

	// DOM order (number, label, delta, total, status) is deliberate: on mobile the count identity
	// stays on line 1, the "filtered from N total" caption sits right beneath it, and the engine
	// status drops to its own line. At `lg` the CSS reorders the status inline-right (`margin-left:
	// auto`) and floats the caption onto its own line below — see `fe-result-count` in ui-styles.
	return (
		<div className="fe-result-count">
			<span className={`fe-result-count__number${isComputing ? ' fe-result-count__number--computing' : ''}`}>
				{displayedCount.toLocaleString()}
			</span>
			<span className="fe-result-count__label">results</span>
			{delta !== 0 && (
				<span className={`fe-result-count__delta ${delta < 0 ? 'fe-result-count__delta--down' : 'fe-result-count__delta--up'}`}>
					{delta > 0 ? '+' : ''}{delta.toLocaleString()}
				</span>
			)}
			<span className="fe-result-count__total">filtered from {totalCount.toLocaleString()} total</span>
			<span className="fe-result-count__status">
				<ComputingIndicator isComputing={isComputing} />
			</span>
		</div>
	);
};


/**
 * `useTickingNumber` — ease the displayed value toward `target` over 600ms via rAF + cubic
 * ease-out, so the count visibly rolls through intermediate values. Returns `[displayed, isAnimating]`.
 *
 * @remarks
 * A new `target` is handled in two halves. What it changes about STATE — snapping straight to it
 * under reduced motion, or entering the animating state — is decided during render, against the
 * target last seen, so that render already shows it. What it starts in the OUTSIDE world — the rAF
 * loop — is the effect's job, as is its cancellation.
 *
 * @internal
 */
function useTickingNumber(target: number): [number, boolean] {
	const [n, setN] = useState(target);
	const [isAnimating, setIsAnimating] = useState(false);
	const [lastSeenTarget, setLastSeenTarget] = useState(target);
	// The value currently on screen, which is where the next roll starts from. Written only by the
	// effects and the frame callback below — never during render.
	const fromRef = useRef(target);

	if (!Object.is(target, lastSeenTarget)) {
		setLastSeenTarget(target);

		if (prefersReducedMotion()) {
			// Reduced motion: land on the value immediately rather than rolling to it.
			setN(target);
		} else {
			// Roll only when the screen is not already showing the new target. A target that returns to
			// the displayed value mid-roll (A → B → A before B's first frame) ENDS the roll: the effect
			// below has nothing to schedule for it, so leaving `isAnimating` set would keep the
			// computing indicator lit with no frame left to clear it.
			setIsAnimating(!Object.is(n, target));
		}
	}

	// Keep the roll's starting point on the committed display, which the reduced-motion snap above
	// moves without a frame callback. Declared BEFORE the roll effect so it has run by the time that
	// effect reads `fromRef`.
	useEffect(() => {
		fromRef.current = n;
	}, [n]);

	useEffect(() => {
		const from = fromRef.current;

		// Nothing to roll: either already there, or the reduced-motion snap above has landed it.
		if (from === target) {
			return undefined;
		}
		const t0 = performance.now();
		const dur = 600;
		let raf = 0;
		const tick = (t: number): void => {
			const p = Math.min(1, (t - t0) / dur);
			const eased = 1 - Math.pow(1 - p, 3);
			const v = Math.round(from + (target - from) * eased);

			setN(v);
			fromRef.current = v;
			if (p < 1) {
				raf = requestAnimationFrame(tick);
			} else {
				setIsAnimating(false);
			}
		};

		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
		};
	}, [target]);

	return [n, isAnimating];
}

/**
 * `<ComputingIndicator />` — engine status pill swapping the ambient SynapticOrbit (idle) for the
 * active NeuralCluster (computing), per the dual-accent semantic.
 *
 * @internal
 */
const ComputingIndicator = ({ isComputing }: { readonly isComputing: boolean }): React.ReactElement => {
	return (
		<span
			aria-live="polite"
			aria-label={isComputing ? 'Engine computing' : 'Engine idle'}
			className={`fe-computing-indicator${isComputing ? ' fe-computing-indicator--computing' : ''}`}
		>
			<span aria-hidden="true" className="fe-computing-indicator__icon">
				{isComputing
					? <NeuralCluster size={40} theme="phosphor" ariaLabel="" />
					: <SynapticOrbit size={40} theme="acid" ariaLabel="" />}
			</span>
			<span className={`fe-computing-indicator__label${isComputing ? ' fe-computing-indicator__label--computing' : ''}`}>
				engine{' '}
				<span className="fe-computing-indicator__sep">·</span>{' '}
				{isComputing ? 'computing' : 'idle'}
			</span>
		</span>
	);
};
