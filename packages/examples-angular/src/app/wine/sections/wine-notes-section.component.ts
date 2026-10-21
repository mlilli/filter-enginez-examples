/**
 * `<fe-wine-notes-section>` — a `FuzzySearchRule` over a wine's tasting notes.
 *
 * @remarks
 * The heading, placeholder, accessible name and Fuse settings come from `WINE_SEARCHES.notes`, and the
 * rule from `wineSearchRule`, so the field reads and matches the same in all six apps. The search runs
 * over `description` with `tastingNotes` as a second key, at a loose threshold: the text is long
 * free-form prose where people paraphrase and misspell.
 *
 * `<fe-search-input>` owns the timing (debounced while typing, at once on blur, Enter or clear, never
 * an unchanged query) and hands this section only real changes. The section reads the committed query
 * through `adoptCommittedRule`, the panel's writable derived: a commit paints it at once, and an
 * external change (Clear all, a pill's ×, Undo, a `?f=` link) re-seeds it when the worker settles.
 *
 * An empty query REMOVES the rule: a `FuzzySearchRule` with an empty query is not neutral, and leaving
 * it installed would show an active-filter pill for a search nobody is running. The winery search
 * does the same.
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
const RULE_ID = 'notes';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SearchInputComponent, SectionHeaderComponent],
	selector: 'fe-wine-notes-section',
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
export class WineNotesSectionComponent {
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
	 * @remarks
	 * `commitRule` and `clearRule` mark the busy tracker before they write.
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
