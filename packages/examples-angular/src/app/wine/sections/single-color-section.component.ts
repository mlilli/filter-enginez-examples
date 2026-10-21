/**
 * `<fe-single-color-section>` — an exact-match `ValueRule` over a wine's color.
 *
 * @remarks
 * Sits directly beneath the color CHIPS, which are an `InSetRule` over the same field. The adjacency
 * is the point: the demo exists to contrast the two rule types, and that contrast only reads if they
 * are neighbors.
 *
 * **`ValueRule` is the one rule whose `config` IS its value** rather than an object wrapping it, so an
 * absent rule and a cleared one both read back as the empty placeholder — and `''` is a primitive, so
 * the reference-stability contract in `adopted-rule-state.ts` is satisfied trivially.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { value, type ValueRule } from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';

import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { SelectMenuComponent } from '../../controls/select-menu.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';

/** The engine's key for this facet — distinct from the chip group's `color`. */
const RULE_ID = 'color-value';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [SectionHeaderComponent, SelectMenuComponent],
	selector: 'fe-single-color-section',
	template: `
		<section>
			<fe-section-header label="Single color (exact)" />
			<fe-select-menu
				[options]="menuOptions()"
				placeholder="— any color —"
				selectLabel="Filter by exact wine color"
				[value]="selected()"
				(valueChange)="handleChange($event)"
			/>
		</section>
	`,
})
export class SingleColorSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** The colors the corpus carries, in the hand-set order (`orderedPresentOptions(COLOR_ORDER, …)`). */
	public readonly options = input.required<readonly string[]>();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The painted selection — written on change, re-seeded on settle. `''` means the facet is off. */
	protected readonly selected = adoptCommittedRule<ValueRule<string>, string>(
		this._engine,
		() => RULE_ID,
		(rule) => rule?.config ?? '',
	);

	/** The menu entries, derived from the corpus vocabulary. */
	protected readonly menuOptions = computed(() =>
		this.options().map((entry) => ({ label: entry, value: entry })),
	);

	/**
	 * Commit an exact color, or clear the facet when the placeholder is chosen.
	 *
	 * @param next - The chosen color, or `''` for "any".
	 */
	protected handleChange(next: string): void {
		this.leaveExpressionMode()();
		this.selected.set(next);

		if (next === '') {
			clearRule(this._engine, RULE_ID);

			return;
		}
		commitRule(this._engine, RULE_ID, value<string>('color', next));
	}
}
