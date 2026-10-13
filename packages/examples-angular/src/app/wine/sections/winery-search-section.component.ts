/**
 * `<fe-winery-search-section>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
 *
 * @remarks
 * Tighter threshold than the tasting-note search (0.35 against 0.45), matching React, SvelteKit and
 * Vue. A winery name is a short proper noun, and a loose threshold on short strings matches most of
 * the corpus — which reads as "fuzzy search is broken" rather than as a tuning choice.
 *
 * State is the text variant of the panel's pattern; see `<fe-wine-notes-section>` for the full
 * reasoning, including why the commit path does not write locally.
 *
 * **Unlike the tasting-note search, an empty query still commits a rule here.** Every vertical's
 * winery search behaves this way, and the e2e specs assert the active-filter chips it produces. Change
 * it in all of them together or in none, or the verticals disagree about what an empty winery search
 * means.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
import { commitRule } from '@filter-enginez/examples-shared/wine-domain';

import { SearchInputComponent } from '../../controls/search-input.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';

/** The engine's key for this facet. Converged across all six verticals. */
const RULE_ID = 'winery';

/** Tighter than the notes search, because a winery name is a short proper noun. */
const THRESHOLD = 0.35;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SearchInputComponent, SectionHeaderComponent],
	selector: 'fe-winery-search-section',
	template: `
		<section>
			<fe-section-header label="Winery (typo-tolerant)" />
			<fe-search-input
				ariaLabel="Search wineries with typo tolerance"
				placeholder="Vandermark, Caruso, Hartmann..."
				[value]="query()"
				(commit)="handleCommit($event)"
				(valueChange)="query.set($event)"
			/>
		</section>
	`,
})
export class WinerySearchSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	private readonly _engine = injectFilterEngine<Wine>();

	/** What the input displays — keystrokes while typing, the engine's trimmed query after a commit. */
	protected readonly query = adoptCommittedRule<FuzzySearchRule, string>(
		this._engine,
		() => RULE_ID,
		(rule) => rule?.config.query ?? '',
	);

	/**
	 * Commit on blur or Enter. An empty query still writes a rule — see the class remarks.
	 *
	 * @param next - The raw input value; trimmed before it reaches the engine.
	 */
	protected handleCommit(next: string): void {
		this.leaveExpressionMode()();
		commitRule(this._engine, RULE_ID, fuzzy('winery', { query: next.trim(), threshold: THRESHOLD }));
	}
}
