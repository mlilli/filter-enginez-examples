/**
 * `wine/searchSections` — the two `FuzzySearchRule` facets.
 *
 * @remarks
 * ## The text variant of the panel's state pattern
 *
 * Same adopter as every other facet, and here the local value does double duty: it holds
 * **uncommitted keystrokes** as well as absorbing the worker's round-trip lag.
 *
 * **The commit path deliberately does NOT paint.** Every other handler in this panel writes locally
 * first; these let the adopter take the value back instead, so the field ends up showing the
 * **trimmed** query the engine actually holds rather than the raw keystrokes. Typing `" oak "` and
 * blurring should leave `oak` in the box, because that is what is filtering.
 *
 * ## The thresholds differ, and so does what an empty query means
 *
 * Tasting notes search long free-form prose at a loose 0.45; a winery name is a short proper noun,
 * where a loose threshold matches most of the corpus and reads as "fuzzy search is broken" rather
 * than as a tuning choice.
 *
 * **An empty query clears the notes rule but still commits a winery one.** Every vertical behaves
 * this way, and the active-filter chips the e2e specs assert depend on it — so it changes in all of
 * them together or in none, or the verticals disagree about what an empty winery search means.
 *
 * @packageDocumentation
 */

import { fuzzy, type FuzzySearchRule, type RuleId } from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';

import type { WineSection, WineSectionContext } from './sections.js';

import { createSearchInput } from '../controls/controls.js';
import { section } from '../controls/sections.js';
import { createFacetAdopter } from './facetState.js';

/** The two fuzzy facets. */
export type WineSearchFacetId = 'notes' | 'winery';

/** One fuzzy search facet's fixed properties. */
interface SearchFacetConfig {
	/** Accessible name for the field. */
	readonly ariaLabel: string;
	/** Whether an empty query clears the rule. See the module docblock — the two differ. */
	readonly clearsWhenEmpty: boolean;
	/** The primary field the rule searches. */
	readonly field: string;
	/** Extra fields Fuse also indexes, when the facet searches more than one. */
	readonly keys?: readonly string[];
	/** Section heading. */
	readonly label: string;
	/** Placeholder text. */
	readonly placeholder: string;
	/** Fuse threshold — lower is stricter. */
	readonly threshold: number;
}

const SEARCH_FACETS: Record<WineSearchFacetId, SearchFacetConfig> = {
	notes: {
		ariaLabel: 'Search tasting notes',
		clearsWhenEmpty: true,
		field: 'description',
		keys: ['description', 'tastingNotes'],
		label: 'Tasting notes search',
		placeholder: 'cherry, oak, tannin…',
		threshold: 0.45,
	},
	winery: {
		ariaLabel: 'Search wineries with typo tolerance',
		clearsWhenEmpty: false,
		field: 'winery',
		label: 'Winery (typo-tolerant)',
		placeholder: 'Vandermark, Caruso, Hartmann...',
		threshold: 0.35,
	},
};

/**
 * Build one fuzzy-search section.
 *
 * @param facetId - Which of the two — also the rule id.
 * @param context - The panel's shared write path.
 * @returns The mounted section.
 */
export function createSearchSection(
	facetId: WineSearchFacetId,
	context: WineSectionContext,
): WineSection {
	const config = SEARCH_FACETS[facetId];
	const { host, leaveExpressionMode } = context;
	const query = createFacetAdopter<string>(committedQuery(host.core.getRules(), facetId));

	const input = createSearchInput({
		ariaLabel: config.ariaLabel,
		// Typing alone does not filter. The rule commits on blur / Enter / clear, so a fuzzy scan of
		// 150k records runs once per query rather than once per character.
		onChange: (next) => {
			query.paint(next);
		},
		onCommit: (next) => {
			leaveExpressionMode();

			const trimmed = next.trim();

			// No local paint here — see the module docblock. The adopter takes the trimmed value back.
			if (trimmed.length === 0 && config.clearsWhenEmpty) {
				clearRule(host, facetId);

				return;
			}
			commitRule(
				host,
				facetId,
				fuzzy(config.field, {
					...(config.keys === undefined ? {} : { keys: [...config.keys]}),
					query: trimmed,
					threshold: config.threshold,
				}),
			);
		},
		placeholder: config.placeholder,
	});

	return {
		element: section(config.label, input.element),
		update: ({ rules }) => {
			// Repaint only on adoption. The input guards against clobbering what is being typed, but
			// calling it on every unrelated settle would still fight a user mid-keystroke on the frame
			// the engine happens to hold the same string.
			if (query.adopt(committedQuery(rules, facetId))) {
				input.update(query.value());
			}
		},
	};
}

/** The query the engine is filtering on, or `''` when the facet carries no rule. @internal */
function committedQuery(rules: ReadonlyMap<RuleId, unknown>, ruleId: RuleId): string {
	return (rules.get(ruleId) as FuzzySearchRule | undefined)?.config.query ?? '';
}
