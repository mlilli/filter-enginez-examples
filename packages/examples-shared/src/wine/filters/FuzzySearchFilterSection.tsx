/**
 * `<FuzzySearchFilterSection />` — parameterized container for a Fuse.js-backed `FuzzySearchRule`
 * text input.
 *
 * @remarks
 * Collapses the Tasting-notes and Winery search sections into one container. Everything that differs
 * between them — heading, placeholder, accessible name, searched field, extra Fuse keys and threshold
 * — comes from the shared `WINE_SEARCHES`, and the rule from `wineSearchRule`, so every app's wine
 * searches say and match the same thing.
 *
 * **Debounced typeahead.** The search is search-as-you-type: `useTypeaheadSearch` mirrors the text
 * locally, commits a trailing-edge-debounced query to the engine while typing, and flushes
 * immediately on blur / Enter / clear. It never commits an unchanged query, and re-syncs from the
 * engine on an external change without clobbering an in-flight keystroke sequence.
 *
 * **An empty query removes the rule**, as in every other app's wine search: an empty fuzzy rule would
 * match everything while still riding in the `?f=` link and the action log. The busy mark comes with
 * the write, so a removal marks busy exactly once and an unchanged field marks nothing.
 *
 * @packageDocumentation
 */

import type { FuzzySearchRule } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { SearchInput } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { useTypeaheadSearch } from '../../search/index.js';
import { markUserAction } from '../engineBusy.js';
import { WINE_SEARCHES, type WineSearchId, wineSearchRule } from '../wine-domain/panelCopy.js';
import { SectionHeader } from './SectionHeader.js';
import { useLeaveExpressionMode } from './smartFilterSelection.js';

/**
 * Props for `<FuzzySearchFilterSection />`.
 */
export interface FuzzySearchFilterSectionProps {
	/** Rule id + `WINE_SEARCHES` key (`notes` / `winery`). */
	readonly searchId: WineSearchId;
}

/**
 * A debounced typeahead fuzzy text-search section.
 *
 * @param props - The search; see {@link FuzzySearchFilterSectionProps}.
 * @returns The section.
 */
export const FuzzySearchFilterSection = ({ searchId }: FuzzySearchFilterSectionProps): React.ReactElement => {
	const { ariaLabel, label, placeholder } = WINE_SEARCHES[searchId];
	const engine = useFilterEngine<Wine>();
	// A facet edit drops any active preset first: see `smartFilterSelection.ts`.
	const leaveExpressionMode = useLeaveExpressionMode();
	const rule = useRule(searchId) as FuzzySearchRule | undefined;
	const ruleQuery = rule?.config.query ?? '';

	// Called by the typeahead only for a real change, so every call is a write and marks busy.
	const commit = useCallback((trimmed: string): void => {
		leaveExpressionMode();
		// The debounce owns cadence; here we just flip the loader and call the engine a frame later.
		commitFilterMutation({
			callEngine: () => {
				if (trimmed === '') {
					engine.core.removeRule(searchId);
				} else {
					engine.core.addRule(searchId, wineSearchRule(searchId, trimmed));
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, searchId, leaveExpressionMode]);
	const search = useTypeaheadSearch({ commit, ruleQuery });

	return (
		<section>
			<SectionHeader label={label} />
			<SearchInput
				value={search.value}
				onChange={search.onChange}
				onCommit={search.onCommit}
				placeholder={placeholder}
				ariaLabel={ariaLabel}
			/>
		</section>
	);
};
