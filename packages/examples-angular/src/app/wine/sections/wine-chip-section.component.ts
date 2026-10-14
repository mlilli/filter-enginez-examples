/**
 * `<fe-wine-chip-section>` — one exclusion-aware `InSetRule` chip group.
 *
 * @remarks
 * Color, body, sweetness and varietal are four near-identical facets differing only in label,
 * vocabulary, and whether the group scrolls. That is exactly the shape where a fourth copy quietly
 * disagrees with the other three, so it is one component four times over — as it is in React,
 * SvelteKit and Vue.
 *
 * **The rule id doubles as the field name.** `color`, `body`, `sweetness` and `varietal` are each both
 * the engine's key for the rule and the `Wine` property it constrains. A facet where those diverge
 * needs its own section rather than a second input here.
 *
 * ## The selection is painted state, not a derivation
 *
 * `adoptCommittedRule` carries the whole argument and the trap that comes with it; read it before
 * changing anything here. The short version: this is the worker tier, `.core` mutations are
 * fire-and-forget, and a read-only `computed` would flick the clicked chip back off for the length of
 * a 150k-record round trip.
 *
 * `EMPTY_SELECTION` rather than an inline `?? []` because the projection must be reference-stable for
 * the absent case — a fresh `[]` every evaluation reads as a change and makes this section adopt on
 * every unrelated settle.
 *
 * ## It injects the bundle rather than taking it as an input
 *
 * The exclusion map changes on every settle, so threading it down would mean the panel re-deriving
 * four values per bundle purely to hand them to four children. See `wine-bundle.ts`.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { inSet, type InSetRule, type RuleId } from '@filter-enginez/core';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import {
	chipExclusionMap,
	commitSelection,
	EMPTY_SELECTION,
} from '@filter-enginez/examples-shared/wine-domain';

import { ChipToggleGroupComponent } from '../../controls/chip-toggle-group.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';
import { injectWineBundle } from '../wine-bundle.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ChipToggleGroupComponent, SectionHeaderComponent],
	selector: 'fe-wine-chip-section',
	template: `
		<section>
			<fe-section-header [label]="label()" />
			<fe-chip-toggle-group
				[exclusion]="exclusion()"
				[isScrollable]="isScrollable()"
				[options]="options()"
				[selected]="selected()"
				[shouldShowCount]="shouldShowCount()"
				(toggled)="handleToggle($event)"
			/>
		</section>
	`,
})
export class WineChipSectionComponent {
	/** Section heading. Varietal's carries its vocabulary size, so this is not derivable from the id. */
	public readonly label = input.required<string>();

	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** The candidate values, in display order. */
	public readonly options = input.required<readonly string[]>();

	/** The rule id — also the `Wine` field the `InSetRule` constrains. See the class remarks. */
	public readonly ruleId = input.required<RuleId>();

	/** Cap the group's height and let it scroll. Varietal only; the other three fit. */
	public readonly isScrollable = input<boolean>(false);

	/** Show projected-count badges on unselected chips. */
	public readonly shouldShowCount = input<boolean>(false);

	private readonly _bundle = injectWineBundle();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The painted selection — seeded from the engine, written on click, re-seeded on settle. */
	protected readonly selected = adoptCommittedRule<InSetRule<string>, readonly string[]>(
		this._engine,
		this.ruleId,
		(rule) => rule?.config.set ?? EMPTY_SELECTION,
	);

	/** Which chips would empty the results, and by how much. Empty until the first bundle — all enabled. */
	protected readonly exclusion = computed(() =>
		chipExclusionMap(this._bundle?.current() ?? null, this.ruleId()),
	);

	/**
	 * Toggle one value, painting locally before the engine round trip.
	 *
	 * @param value - The chip clicked.
	 */
	protected handleToggle(value: string): void {
		this.leaveExpressionMode()();

		const ruleId = this.ruleId();
		const next = toggleSetValue(this.selected(), value);

		this.selected.set(next);
		commitSelection(this._engine, ruleId, next, (values) => inSet<string>(ruleId, values));
	}
}
