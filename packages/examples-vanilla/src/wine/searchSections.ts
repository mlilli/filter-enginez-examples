/**
 * `wine/searchSections` — the two `FuzzySearchRule` facets.
 *
 * @remarks
 * ## The field is bound to the shared typeahead controller
 *
 * `../controls/typeaheadSearch.ts` binds the field to `createTypeaheadController`, the one every
 * vertical's search uses: typing re-arms a 250 ms trailing commit, blur / Enter / the clear button
 * flush at once, and a query equal to the one already committed is never written — so Enter and the
 * blur after it write once, and an untouched field's blur writes nothing and marks nothing busy. An
 * external change (Clear all, a pill's ×, Undo, a `?f` link) is adopted into the field; the echo of
 * the field's own commit is not, so a worker round trip can never yank the text mid-word.
 *
 * ## Copy, Fuse settings and the rule are the shared ones
 *
 * `WINE_SEARCHES` carries each facet's label, placeholder, accessible name, field, keys and
 * threshold, and `wineSearchRule` builds the rule from them. Tasting notes search long free-form
 * prose at a loose 0.45; a winery name is a short proper noun, where a loose threshold matches most
 * of the corpus.
 *
 * **An empty query removes the rule, for both facets**, as every vertical's wine search does: an
 * empty fuzzy query is not a filter, and a pill reading `Winery: ""` would claim one.
 *
 * @packageDocumentation
 */

import type { FuzzySearchRule, RuleId } from '@filter-enginez/core';

import {
	clearRule,
	commitRule,
	WINE_SEARCHES,
	type WineSearchId,
	wineSearchRule,
} from '@filter-enginez/examples-shared/wine-domain';

import type { WineSection, WineSectionContext } from './sections.js';

import { section } from '../controls/sections.js';
import { createTypeaheadSearch } from '../controls/typeaheadSearch.js';

/**
 * Build one fuzzy-search section.
 *
 * @param facetId - Which of the two — also the rule id.
 * @param context - The panel's shared write path.
 * @returns The mounted section.
 */
export function createSearchSection(facetId: WineSearchId, context: WineSectionContext): WineSection {
	const spec = WINE_SEARCHES[facetId];
	const { host, leaveExpressionMode } = context;
	const search = createTypeaheadSearch({
		ariaLabel: spec.ariaLabel,
		// Called only on a real change, so the busy mark inside the commit helpers fires only when
		// something is written.
		commit: (trimmed) => {
			leaveExpressionMode();
			if (trimmed === '') {
				clearRule(host, facetId);

				return;
			}
			commitRule(host, facetId, wineSearchRule(facetId, trimmed));
		},
		initialQuery: committedQuery(host.core.getRules(), facetId),
		placeholder: spec.placeholder,
	});

	return {
		element: section(spec.label, search.element),
		update: ({ rules }) => {
			search.adopt(committedQuery(rules, facetId));
		},
	};
}

/** The query the engine is filtering on, or `''` when the facet carries no rule. @internal */
function committedQuery(rules: ReadonlyMap<RuleId, unknown>, ruleId: RuleId): string {
	return (rules.get(ruleId) as FuzzySearchRule | undefined)?.config.query ?? '';
}
