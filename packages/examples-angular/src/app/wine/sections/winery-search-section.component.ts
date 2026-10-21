/**
 * `<fe-winery-search-section>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
 *
 * @remarks
 * Copy and Fuse settings come from `WINE_SEARCHES.winery`, and the rule from `wineSearchRule`. The
 * threshold is tighter than the tasting-note search's: a winery name is a short proper noun, and a
 * loose threshold on short strings matches most of the corpus.
 *
 * Timing and state follow `<fe-wine-notes-section>`: `<fe-search-input>` commits debounced while
 * typing and at once on blur, Enter or clear, never an unchanged query, and an empty query REMOVES
 * the rule, the same in every app.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { type FuzzySearchRule } from '@filter-enginez/core';
import {
	clearRule,
	commitRule,
	WINE_SEARCHES,
	wineSearchRule,
} from '@filter-enginez/examples-shared/wine-domain';

import { SearchInputComponent } from '../../controls/search-input.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';

/** The engine's key for this facet, which is also its `WINE_SEARCHES` entry. */
const RULE_ID = 'winery';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SearchInputComponent, SectionHeaderComponent],
	selector: 'fe-winery-search-section',
	template: `
		<section>
			<fe-section-header [label]="copy.label" />
			<fe-search-input
				[ariaLabel]="copy.ariaLabel"
				[placeholder]="copy.placeholder"
				[query]="query()"
				(commit)="handleCommit($event)"
			/>
		</section>
	`,
})
export class WinerySearchSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** The field's heading, placeholder and accessible name. */
	protected readonly copy = WINE_SEARCHES[RULE_ID];

	private readonly _engine = injectFilterEngine<Wine>();

	/** The committed query; `''` when there is no rule. */
	protected readonly query = adoptCommittedRule<FuzzySearchRule, string>(
		this._engine,
		() => RULE_ID,
		(rule) => rule?.config.query ?? '',
	);

	/**
	 * Write a changed query: the rule for a non-empty one, a removal for an empty one.
	 *
	 * @param trimmedQuery - The trimmed query, already known to differ from the committed one.
	 */
	protected handleCommit(trimmedQuery: string): void {
		this.leaveExpressionMode()();
		this.query.set(trimmedQuery);

		if (trimmedQuery === '') {
			clearRule(this._engine, RULE_ID);

			return;
		}
		commitRule(this._engine, RULE_ID, wineSearchRule(RULE_ID, trimmedQuery));
	}
}
