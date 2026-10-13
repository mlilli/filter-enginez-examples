/**
 * `<fe-wine-notes-section>` — a `FuzzySearchRule` over a wine's tasting notes.
 *
 * @remarks
 * Searches `description` with `tastingNotes` as a secondary key, at a loose 0.45 threshold: the text
 * is long free-form prose where people paraphrase and misspell, so a tight threshold reads as "fuzzy
 * search is broken".
 *
 * ## The text variant of the panel's state pattern
 *
 * Same writable derived as every other facet, and here it is doing double duty: it holds **uncommitted
 * keystrokes** as well as absorbing the worker's round-trip lag. A read-only `computed` would make the
 * field unusable outright — every character typed would be overwritten by the engine's last committed
 * query on the next tick.
 *
 * **The commit path deliberately does NOT write locally.** Every other handler in this panel paints
 * first; this one lets the re-seed happen instead, so the input ends up showing the **trimmed** query
 * the engine actually holds rather than the raw keystrokes. Typing `" oak "` and blurring should leave
 * `oak` in the box, because that is what is filtering.
 *
 * An empty query CLEARS the rule rather than committing an empty one — a `FuzzySearchRule` with an
 * empty query is not neutral, and leaving it installed would show an active-filter chip for a search
 * nobody is running. `<fe-winery-search-section>` deliberately differs; see its docblock.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';

import { SearchInputComponent } from '../../controls/search-input.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';

/** The engine's key for this facet. Converged across all six verticals. */
const RULE_ID = 'notes';

/** Loose, because the searched text is long free-form prose. See the class remarks. */
const THRESHOLD = 0.45;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SearchInputComponent, SectionHeaderComponent],
	selector: 'fe-wine-notes-section',
	template: `
		<section>
			<fe-section-header label="Tasting notes search" />
			<fe-search-input
				ariaLabel="Search tasting notes"
				placeholder="cherry, oak, tannin…"
				[value]="query()"
				(commit)="handleCommit($event)"
				(valueChange)="query.set($event)"
			/>
		</section>
	`,
})
export class WineNotesSectionComponent {
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
	 * Commit on blur or Enter.
	 *
	 * @param next - The raw input value; trimmed before it reaches the engine.
	 */
	protected handleCommit(next: string): void {
		this.leaveExpressionMode()();

		// No local write here — see the class remarks. The re-seed brings the trimmed value back.
		if (next.trim().length === 0) {
			clearRule(this._engine, RULE_ID);

			return;
		}
		commitRule(
			this._engine,
			RULE_ID,
			fuzzy('description', {
				keys: ['description', 'tastingNotes'],
				query: next.trim(),
				threshold: THRESHOLD,
			}),
		);
	}
}
