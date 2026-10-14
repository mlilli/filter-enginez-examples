/**
 * `<fe-wine-filter-panel>` — the thirteen-section wine panel, plus the preset block above it.
 *
 * @remarks
 * ## The scroller and the body are two elements, and only wine splits them
 *
 * Every other panel in the repo composes `.fe-filter-panel__scroller` and `.fe-filter-panel__body`
 * onto one element. Wine cannot: the smart-filter block has to scroll WITH the panel while staying
 * interactive as everything below it dims and locks. A preset that greyed out its own clear button
 * would be a trap.
 *
 * Omitting the scroller class entirely does not look broken — the panel silently stops scrolling and
 * the page scrolls instead, which is easy to miss on a short corpus.
 *
 * ## `inert` for expression mode ONLY, deliberately not for computing
 *
 * `inert` removes descendants from the focus order and **blurs whatever is focused inside**. On a
 * transient state that is user-hostile: committing a filter by keyboard sets `isComputing`, which
 * would blur the row the user just activated and drop them at the top of the document. Mouse users
 * would never notice — they hold no focus position — so the failure is easy to overlook.
 *
 * Expression mode is different. It is a persistent state the user chose, the sections really are
 * dormant while a preset drives the results, and the smart-filter block sits OUTSIDE this container so
 * there is always a reachable way back out.
 *
 * Computing keeps the visual dim and `pointer-events: none` from `--busy`. A keystroke landing
 * mid-recompute is harmless: the busy tracker is version-based and resolves out-of-order commits by
 * design, which is exactly why it counts versions instead of holding a boolean.
 *
 * **`[attr.inert]`, not `[inert]`.** Angular's DOM schema drives the property-binding check, and a
 * property it does not know about is a template error rather than a pass-through. The attribute form
 * is also the one that expresses "absent" correctly: `null` removes it, where `[inert]="false"` on the
 * attribute form would render `inert="false"`, which is still inert.
 *
 * ## Selection state lives in the sections, with one exception
 *
 * Twelve facets own their own painted state through `adoptCommittedRule`. The preset chips are the
 * exception, because they are the one facet that is not a rule: they derive off the engine's
 * EXPRESSION, so the panel holds them and hands them down. Deriving rather than seeding once is why
 * there is no reset registry — the header's "Clear all" and the smart-filter chip's × both just call
 * `clearAllWineFilters`, and these chips go out on their own.
 *
 * The panel also READS the committed varietal selection, without owning it: the varietal group shows
 * the most-reviewed `VARIETAL_CHIP_LIMIT` chips, and `visibleVarietalChips` needs the selection to keep
 * a rarer varietal that arrived through a shared link on screen, where it can be seen and cleared.
 *
 * @packageDocumentation
 */

import type { InSetRule } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	BODY_ORDER,
	COLOR_ORDER,
	commitExpression,
	deriveSelectedPresetIds,
	EMPTY_SELECTION,
	type OriginNodeSpec,
	type PickerTreeNode,
	SWEETNESS_ORDER,
	visibleVarietalChips,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';

import { PanelHeaderComponent } from '../controls/panel-header.component.js';
import { ScoreCompareSectionComponent } from './sections/score-compare-section.component.js';
import { SingleColorSectionComponent } from './sections/single-color-section.component.js';
import { WineChipSectionComponent } from './sections/wine-chip-section.component.js';
import { WineNotesSectionComponent } from './sections/wine-notes-section.component.js';
import { WineOriginSectionComponent } from './sections/wine-origin-section.component.js';
import { WineRangeSectionComponent } from './sections/wine-range-section.component.js';
import { WineVintageSectionComponent } from './sections/wine-vintage-section.component.js';
import { WinerySearchSectionComponent } from './sections/winery-search-section.component.js';
import { WineSmartFiltersComponent } from './wine-smart-filters.component.js';

/**
 * Per-slider drag granularity.
 *
 * @remarks
 * **NOT `SLIDER_STEPS`.** That record is the grid the BASELINE BOUNDS are rounded outward onto, and it
 * is all zeros deliberately — padding price by 5 once turned a $4 corpus minimum into a displayed $0.
 * These are drag and keyboard granularity, matching React's panel: price snaps to whole dollars, which
 * the log-scaled price track can place by hand at the dense low end.
 */
const DRAG_STEPS = { abv: 0.1, points: 1, price: 1, vintage: 1 } as const;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		PanelHeaderComponent,
		ScoreCompareSectionComponent,
		SingleColorSectionComponent,
		WineChipSectionComponent,
		WineNotesSectionComponent,
		WineOriginSectionComponent,
		WineRangeSectionComponent,
		WinerySearchSectionComponent,
		WineSmartFiltersComponent,
		WineVintageSectionComponent,
	],
	selector: 'fe-wine-filter-panel',
	// The ONLY CSS this component authors, and it is a host-GEOMETRY fix rather than styling —
	// everything visual still comes from `ui-styles`. `<fe-real-estate-filter-panel>` carries the
	// identical line with the full argument; the short version is that Angular inserts a host element
	// the other five verticals do not have, an unknown element defaults to `display: inline`, and that
	// severs the bounded-height chain from `.fe-sidebar-app__filters` down to
	// `.fe-filter-panel__scroller`. The panel then does not scroll and its lower sections are
	// unreachable — the scroller class is present and correct, which is what makes this hard to see.
	//
	// Every Angular filter panel (books, real estate, wine) carries this line, because each sits in the
	// same DOM chain. The other verticals scrolling correctly proves nothing about this one, because
	// the host element is Angular's alone.
	styles: [':host { display: flex; flex: 1 1 0%; flex-direction: column; min-height: 0; }'],
	template: `
		<div class="fe-filter-panel">
			<fe-panel-header />

			<!--
				The scroll container. The smart filters scroll with the panel but stay INTERACTIVE while
				the manual sections below dim and lock — see the class remarks.
			-->
			<div class="fe-filter-panel__scroller">
				<fe-wine-smart-filters
					[selected]="activePresets()"
					(selectedChange)="activePresets.set($event)"
				/>

				<div
					class="fe-filter-panel__body"
					[class.fe-filter-panel__body--busy]="isComputing() && !isExpressionMode()"
					[class.fe-filter-panel__body--expression]="isExpressionMode()"
					[attr.inert]="isExpressionMode() ? '' : null"
				>
					<fe-wine-range-section
						field="priceUsd"
						label="Price (USD)"
						[leaveExpressionMode]="leaveExpressionMode"
						ruleId="price"
						sliderLabel="Filter by price"
						[step]="dragSteps.price"
					/>

					<fe-wine-range-section
						field="points"
						label="Points"
						[leaveExpressionMode]="leaveExpressionMode"
						ruleId="points"
						sliderLabel="Filter by points"
						[step]="dragSteps.points"
					/>

					<fe-score-compare-section [leaveExpressionMode]="leaveExpressionMode" />

					<fe-wine-chip-section
						label="Color"
						[leaveExpressionMode]="leaveExpressionMode"
						[options]="colorOptions()"
						ruleId="color"
						[shouldShowCount]="true"
					/>

					<fe-single-color-section
						[leaveExpressionMode]="leaveExpressionMode"
						[options]="vocabularies().color"
					/>

					<fe-wine-chip-section
						[isScrollable]="true"
						[label]="varietalLabel()"
						[leaveExpressionMode]="leaveExpressionMode"
						[options]="varietalOptions()"
						ruleId="varietal"
					/>

					<fe-wine-origin-section
						[leaveExpressionMode]="leaveExpressionMode"
						[specs]="originSpecs()"
						[tree]="originTree()"
					/>

					<fe-wine-vintage-section
						[leaveExpressionMode]="leaveExpressionMode"
						[step]="dragSteps.vintage"
					/>

					<fe-wine-range-section
						field="abv"
						label="ABV (%)"
						[leaveExpressionMode]="leaveExpressionMode"
						ruleId="abv"
						sliderLabel="Filter by ABV"
						[step]="dragSteps.abv"
					/>

					<fe-wine-chip-section
						label="Body"
						[leaveExpressionMode]="leaveExpressionMode"
						[options]="bodyOptions()"
						ruleId="body"
					/>

					<fe-wine-chip-section
						label="Sweetness"
						[leaveExpressionMode]="leaveExpressionMode"
						[options]="sweetnessOptions()"
						ruleId="sweetness"
					/>

					<fe-wine-notes-section [leaveExpressionMode]="leaveExpressionMode" />

					<fe-winery-search-section [leaveExpressionMode]="leaveExpressionMode" />
				</div>
			</div>
		</div>
	`,
})
export class WineFilterPanelComponent {
	/** Dims + locks the manual sections while a bundle round trip is pending. */
	public readonly isComputing = input<boolean>(false);

	/** Dims + locks them harder while a preset holds the engine in expression mode. */
	public readonly isExpressionMode = input<boolean>(false);

	/** The flattened origin tree — every node plus the leaf ids selecting it would activate. */
	public readonly originSpecs = input.required<readonly OriginNodeSpec[]>();

	/** The origin tree itself. `null` until the corpus lands. */
	public readonly originTree = input.required<PickerTreeNode | null>();

	/** The chip vocabularies the corpus actually contains. */
	public readonly vocabularies = input.required<WineChipVocabularies>();

	/** Bound into the template. */
	protected readonly dragSteps = DRAG_STEPS;

	private readonly _engine = injectFilterEngine<Wine>();

	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	private readonly _expression = toSignal(this._engine.expression$, { requireSync: true });

	/**
	 * The committed varietal selection — a read, for {@link varietalOptions} only.
	 *
	 * @remarks
	 * The chip section owns the painted selection; this lags it by a round trip, which is harmless here
	 * because only a selection BEYOND the chip limit changes the options, and that arrives through a
	 * link or a config load rather than a click. `EMPTY_SELECTION` keeps the absent case
	 * reference-stable, so an unrelated facet's settle does not rebuild the chip list.
	 */
	private readonly _selectedVarietals = computed<readonly string[]>(
		() => (this._activeRules().get('varietal') as InSetRule<string> | undefined)?.config.set ?? EMPTY_SELECTION,
	);

	/** The preset ids the committed expression implies. */
	private readonly _committedPresets = computed(() =>
		deriveSelectedPresetIds(this._expression()),
	);

	/**
	 * The lit preset chips — the panel's ONE piece of control state, because it is the one facet that
	 * is not a rule.
	 *
	 * @remarks
	 * A writable derived for the same reason every section is one: on this tier the expression lands a
	 * round trip after the write, so a read-only derivation would blank the chips between the click and
	 * the settle. See `adopted-rule-state.ts` — this is the same construct, off a different source.
	 */
	protected readonly activePresets = linkedSignal<readonly string[], readonly string[]>({
		computation: (value) => value,
		source: this._committedPresets,
	});

	/** The color chips the corpus actually contains, in canonical order. */
	protected readonly bodyOptions = computed(() =>
		BODY_ORDER.filter((entry) => this.vocabularies().body.includes(entry)),
	);

	protected readonly colorOptions = computed(() =>
		COLOR_ORDER.filter((entry) => this.vocabularies().color.includes(entry)),
	);

	protected readonly sweetnessOptions = computed(() =>
		SWEETNESS_ORDER.filter((entry) => this.vocabularies().sweetness.includes(entry)),
	);

	/**
	 * The varietal chips: the most-reviewed `VARIETAL_CHIP_LIMIT`, plus any selected varietal ranked
	 * below them.
	 *
	 * @remarks
	 * The vocabulary runs to hundreds and arrives ranked by wine count (`deriveWineFacets`), so the
	 * chips shown are the varieties most wines are, and the group scrolls.
	 */
	protected readonly varietalOptions = computed(() =>
		visibleVarietalChips(this.vocabularies().varietal, this._selectedVarietals()),
	);

	/** Carries the FULL vocabulary size, not the shown one — the heading is a fact about the corpus. */
	protected readonly varietalLabel = computed(
		() => `Varietal (${String(this.vocabularies().varietal.length)})`,
	);

	/**
	 * Drop any active preset — a facet edit means the user is back in flat-map mode.
	 *
	 * @remarks
	 * An arrow field rather than a method, because it is passed DOWN as a function input to twelve
	 * sections and must keep its `this`.
	 */
	protected readonly leaveExpressionMode = (): void => {
		if (this.activePresets().length === 0) {
			return;
		}
		this.activePresets.set([]);
		commitExpression(this._engine, null);
	};
}
