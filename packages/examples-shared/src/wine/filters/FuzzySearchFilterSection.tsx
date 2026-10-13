/**
 * `<FuzzySearchFilterSection />` — parameterized container for a Fuse.js-backed `FuzzySearchRule`
 * text input.
 *
 * @remarks
 * Collapses the Tasting-notes and Winery search sections into one config-driven container. They
 * differ only in rule id, extractor field, Fuse threshold, multi-key set, and copy.
 *
 * **Debounced typeahead.** The search is search-as-you-type: `useTypeaheadSearch` mirrors the text
 * locally, commits a trailing-edge-debounced query to the engine while typing, and flushes
 * immediately on blur / Enter / clear — committing only on blur/Enter would lose the live-search
 * feel. The shared hook also re-syncs
 * from the engine on external change without clobbering an in-flight keystroke sequence.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { SearchInput } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { useTypeaheadSearch } from '../../search/index.js';
import { markUserAction } from '../engineBusy.js';
import { SectionHeader } from './SectionHeader.js';

/**
 * Props for `<FuzzySearchFilterSection />`.
 */
export interface FuzzySearchFilterSectionProps {
	/** Rule id (e.g. `notes` / `winery`). */
	readonly ruleId: string;
	/** Section label. */
	readonly label: string;
	/** Input placeholder. */
	readonly placeholder: string;
	/** Accessible name for the input. */
	readonly ariaLabel: string;
	/** The primary extractor field passed to `fuzzy()` (e.g. `description` / `winery`). */
	readonly field: string;
	/** Fuse.js match threshold — lower is stricter. */
	readonly threshold: number;
	/**
	 * Optional multi-key set. When present, Fuse indexes each listed field (and the positional
	 * `field` arg is ignored per `FuzzySearchRule.action`'s multi-key branch). Tasting-notes search
	 * uses `['description', 'tastingNotes']` so a tasting-note chip token (e.g. "blackberry") still
	 * matches even though it lives in the array field, not the prose blurb.
	 */
	readonly keys?: readonly string[];
}

/**
 * A debounced typeahead fuzzy text-search section.
 */
export const FuzzySearchFilterSection = (props: FuzzySearchFilterSectionProps): React.ReactElement => {
	const { ariaLabel, field, keys, label, placeholder, ruleId, threshold } = props;
	const engine = useFilterEngine<Wine>();
	const rule = useRule(ruleId) as FuzzySearchRule | undefined;
	const ruleQuery = rule?.config.query ?? '';

	const commit = useCallback((trimmed: string): void => {
		// The debounce owns cadence; here we just flip the loader and call the engine a frame later.
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, fuzzy(field, {
				query: trimmed,
				threshold,
				...(keys !== undefined ? { keys } : {}),
			})),
			markBusy: markUserAction,
		});
	}, [engine, ruleId, field, threshold, keys]);
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
