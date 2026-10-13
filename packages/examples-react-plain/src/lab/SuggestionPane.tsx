/**
 * `<SuggestionPane />` — the `/lab` pane that drives `useSuggestedFilters`, the last of the three
 * engine capabilities the docs advertise and nothing calls.
 *
 * @remarks
 * Shows the filters the Bayesian co-occurrence model ranks as most likely to pair with whatever is
 * currently selected, states the size of the corpus those numbers come from, and records the
 * visitor's own settled selections into it.
 *
 * ### 🔴 The seed runs in a `useState` initializer, and that is not a style choice
 *
 * `useSuggestedFilters` computes inside a `useMemo` keyed on `[engine, activeRuleIds, k]`. Seeding
 * from a `useEffect` would therefore be too late in a way that never recovers: the first render
 * would read an unseeded model, and because seeding changes none of those three dependencies, the
 * memo would not recompute afterwards — the pane would sit empty until the visitor happened to
 * change a filter. A lazy `useState` initializer runs during render, ahead of the hooks below it, so
 * the model is trained before it is first read. `seedSyntheticSessions` is idempotent, which is what
 * makes running it in render safe under strict mode's double invocation.
 *
 * ### The suggestions lag the visitor's current session by one, deliberately
 *
 * Recording is debounced, so the session in progress is not in the model that ranked the list on
 * screen. That is the correct order rather than a compromise — training on the selection you are
 * currently being advised about would let a suggestion justify itself.
 *
 * @packageDocumentation
 */

import type { RuleId } from '@filter-enginez/core';

import { attachSuggestions } from '@filter-enginez/core/suggestions';
import { useActiveRules, useFilterEngine, useSuggestedFilters } from '@filter-enginez/react-signals';
import { useEffect, useRef, useState } from 'react';

import {
	describeSuggestion,
	formatProbability,
	seedSyntheticSessions,
	shouldRecordSession,
	SYNTHETIC_SESSION_COUNT,
} from './labSessions.js';

/** How many suggestions to rank. */
const SUGGESTION_COUNT = 3;

/**
 * How long a selection must hold still before it counts as a session.
 *
 * @remarks
 * `useSuggestedFilters`' own docblock suggests a five-second window. This is shorter because a
 * demonstration surface has to show the corpus growing while somebody is still watching it — a
 * visitor who toggles two filters and leaves would otherwise never see the number move, and would
 * reasonably conclude the recording half does not work.
 */
const RECORD_DEBOUNCE_MS = 1200;

/**
 * The suggestion pane — ranked next filters, the corpus behind them, and live recording into it.
 */
export const SuggestionPane = (): React.ReactElement => {
	const engine = useFilterEngine();
	const activeRules = useActiveRules();
	const { sessionTracker } = attachSuggestions(engine.core);

	// Seeded here rather than in an effect — see the module docblock.
	const [sessionCount, setSessionCount] = useState<number>(() => {
		seedSyntheticSessions(sessionTracker);

		return sessionTracker.size;
	});
	const lastRecordedRef = useRef<undefined | readonly RuleId[]>(undefined);
	const suggestions = useSuggestedFilters(SUGGESTION_COUNT);

	useEffect(() => {
		const ruleIds = [...activeRules.keys()];

		if (!shouldRecordSession(ruleIds, lastRecordedRef.current)) {
			return undefined;
		}
		const timer = setTimeout(() => {
			sessionTracker.recordSession(ruleIds);
			lastRecordedRef.current = ruleIds;
			setSessionCount(sessionTracker.size);
		}, RECORD_DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
		};
	}, [activeRules, sessionTracker]);

	const recordedCount = sessionCount - SYNTHETIC_SESSION_COUNT;

	return (
		<section className="fe-lab__pane" aria-labelledby="fe-lab-suggestions-title">
			<h2 className="fe-lab__pane-title" id="fe-lab-suggestions-title">
				Suggested next filters
			</h2>
			<p className="fe-lab__pane-lead">
				The engine counts which filters get used together and ranks the ones most likely to pair
				with your current selection — combined by noisy-OR over the model&apos;s pairwise
				conditionals, computed from aggregate counts rather than a scan.
			</p>
			<p className="fe-lab__provenance">
				<strong>{sessionCount.toLocaleString()}</strong> sessions in the model:{' '}
				<strong>{SYNTHETIC_SESSION_COUNT.toLocaleString()}</strong> are synthetic, invented for this
				demo because a filter engine records no sessions of its own and a first-time visitor would
				otherwise see an empty list.{' '}
				{recordedCount === 0
					? 'Change a filter and yours will be added.'
					: `${recordedCount.toLocaleString()} ${recordedCount === 1 ? 'is' : 'are'} yours, recorded as you filtered.`}
			</p>

			{suggestions.length === 0 ? (
				<p className="fe-lab__empty">
					The model has nothing to add to this selection — every filter it associates with your
					current one is already applied.
				</p>
			) : (
				<ul className="fe-lab__suggestions">
					{suggestions.map(({ probability, ruleId }) => {
						const { hasLabControl, label } = describeSuggestion(ruleId);

						return (
							<li className="fe-lab__suggestion" key={ruleId}>
								<span className="fe-lab__suggestion-label">{label}</span>
								{hasLabControl ? null : (
									// Reachable whenever the visitor arrives carrying filters from `/books`: the
									// engine is shared, so its rule ids are in the session and can be ranked.
									// Naming them as unavailable beats hiding real output or implying a control.
									<span className="fe-lab__suggestion-note">set on /books — no control here</span>
								)}
								<span className="fe-lab__suggestion-probability">{formatProbability(probability)}</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
};
