/**
 * `<fe-wine-origin-section>` — the cascading country → province → region → subregion picker, over an
 * `InSetofSetsRule`.
 *
 * @remarks
 * The headline facet of the wine demo, and the only one whose rule is a set OF sets: selecting a
 * country commits the leaf ids beneath it, so one click covers a whole subtree without the rule
 * needing to understand hierarchy. The rule is built by the shared `commitOriginSelection`, as in every
 * app, so an origin selection reads the same in a link from any of them (`wine-domain/originRule.ts`).
 *
 * ## Selection is COMPACT — the highest selected node per branch, never the closure
 *
 * `deriveOriginSelection` recovers that compact form from the committed leaf sets. Rendering the
 * closure instead would light every descendant of a selected country, and the next click would then
 * de-select one leaf rather than the country the user actually picked.
 *
 * `specs` is empty until the corpus lands, and `deriveOriginSelection` reads an empty spec list as an
 * empty selection. That is safe only because the route resolves the engine after filling the specs, so
 * this never renders before them.
 *
 * ## The counts come from the engine, not the tree
 *
 * Both the disabled set and the per-node badges come from the bundle. Only the engine's projection
 * knows how many WINES a node covers; the tree knows its own shape, so a country with one leaf region
 * beneath it reads `1` while producing two hundred results.
 *
 * ## The `@if` around the picker is load-bearing
 *
 * `<fe-hierarchical-picker>`'s `tree` is `input.required<PickerTreeNode>()` — non-nullable — while
 * `tree` here is `null` until the corpus lands. Guarding at the call site is what makes those two
 * agree, and it is what Vue does with `v-if`. Widening the shared control's input instead would push a
 * nullable tree onto real estate, which never has one.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { type InSetofSetsRule } from '@filter-enginez/core';
import {
	chipDisabledSet,
	chipProjectedCounts,
	commitOriginSelection,
	deriveOriginSelection,
	EMPTY_SELECTION,
	type OriginNodeSpec,
	type PickerTreeNode,
	WINE_ORIGIN_TREE,
} from '@filter-enginez/examples-shared/wine-domain';

import { HierarchicalPickerComponent } from '../../controls/hierarchical-picker.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';
import { injectWineBundle } from '../wine-bundle.js';

/** The engine's key for this facet. */
const RULE_ID = 'origin';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [HierarchicalPickerComponent, SectionHeaderComponent],
	selector: 'fe-wine-origin-section',
	template: `
		<section>
			<fe-section-header [label]="treeCopy.groupLabel" />
			@if (tree(); as originTree) {
				<fe-hierarchical-picker
					[counts]="counts()"
					[disabled]="disabled()"
					[groupLabel]="treeCopy.groupLabel"
					[maxHeight]="treeCopy.maxHeight"
					[selected]="selected()"
					[tree]="originTree"
					(selectionChange)="handleChange($event)"
				/>
			}
		</section>
	`,
})
export class WineOriginSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** The flattened tree — every node plus the leaf ids selecting it would activate. */
	public readonly specs = input.required<readonly OriginNodeSpec[]>();

	/** The tree itself, for the picker's cascade semantics. `null` until the corpus lands. */
	public readonly tree = input.required<PickerTreeNode | null>();

	/** The tree's `role="group"` name (also the heading) and the height it scrolls within. */
	protected readonly treeCopy = WINE_ORIGIN_TREE;

	private readonly _bundle = injectWineBundle();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The painted compact selection — written on click, re-seeded on settle. */
	protected readonly selected = adoptCommittedRule<InSetofSetsRule<string>, readonly string[]>(
		this._engine,
		() => RULE_ID,
		(rule) => (rule === undefined ? EMPTY_SELECTION : deriveOriginSelection(rule.config.set, this.specs())),
	);

	/** The current bundle, or `null` before the first round trip — and in isolation tests. */
	private readonly _currentBundle = computed(() => this._bundle?.current() ?? null);

	/** Nodes whose whole subtree would yield zero results. Empty until the first bundle — all enabled. */
	protected readonly disabled = computed(() => chipDisabledSet(this._currentBundle(), RULE_ID));

	/** Node id → projected wine count, for the row badges. See the class remarks. */
	protected readonly counts = computed(() => chipProjectedCounts(this._currentBundle(), RULE_ID));

	/**
	 * Commit a whole new selection.
	 *
	 * @remarks
	 * The picker hands back the ENTIRE next selection rather than one toggled value: a single click can
	 * select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is not
	 * expressible.
	 *
	 * @param next - The compact selection after the click.
	 */
	protected handleChange(next: readonly string[]): void {
		this.leaveExpressionMode()();
		this.selected.set(next);
		commitOriginSelection(this._engine, next, this.specs());
	}
}
