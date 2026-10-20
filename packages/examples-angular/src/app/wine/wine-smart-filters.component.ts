/**
 * `<fe-wine-smart-filters>` — the expression-mode presets, and the only control in the panel that is
 * not backed by a rule.
 *
 * @remarks
 * Each preset commits a curated `CompositeRule` through `setExpression`, which is the whole point of
 * the facet: it is the one place in the app where a user drives the engine's expression algebra rather
 * than its flat-map mode.
 *
 * ## "Match any (OR)" is the section, not a garnish
 *
 * Single-select applies one canned expression; OR mode unions the selected presets into `or(...)`. The
 * expression is built by `buildSmartFilterExpression`, shared with every other vertical — its
 * single-selection special case has to agree exactly with `deriveSelectedPresetIds`, which reads the
 * chips back, so the two live beside each other rather than in six panels.
 *
 * ## `isMulti` is seeded AND adopted, and the adopt is ONE-WAY
 *
 * More than one preset can only have been committed through OR mode, so a `?f` link carrying two must
 * restore the checkbox on — otherwise the chips come back multi-selected while the control claims
 * single-select, and the next click silently drops the others.
 *
 * The seed alone is not enough: `selected` derives off the engine's expression, and on this tier
 * `loadConfig` is fire-and-forget, so a restored expression can land a round trip AFTER this renders.
 * Hence the `linkedSignal` — and its computation is deliberately **one-way**. Deriving
 * `selected().length > 1` outright would flip the checkbox off the moment a user in OR mode deselected
 * down to one preset, silently changing the mode they chose. Turning it ON when the selection proves it
 * must already be on cannot be wrong, so the computation falls back to its own previous value:
 *
 *   `(count, previous) => count > 1 || (previous?.value ?? false)`
 *
 * `changeMode` then writes it directly, which is the only path that may turn it off.
 *
 * ## Applying a preset does not need to blank the manual controls
 *
 * `clearAllFacetRules` removes the flat rules and every facet section re-seeds off its own rule's
 * removal. There is no reset handshake, because every section derives its state from the engine.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	commitSmartFilterSelection,
	exitExpressionMode,
	WINE_SMART_FILTERS,
} from '@filter-enginez/examples-shared/wine-domain';

import { ChipToggleGroupComponent } from '../controls/chip-toggle-group.component.js';
import { SectionHeaderComponent } from '../controls/section-header.component.js';

/** The chip vocabulary — preset ids, rendered through the label lookup. */
const PRESET_IDS: readonly string[] = WINE_SMART_FILTERS.map((preset) => preset.id);

/**
 * The human label for a preset id.
 *
 * @param id - The preset id.
 * @returns Its label, or the id when unknown.
 */
function labelForPreset(id: string): string {
	return WINE_SMART_FILTERS.find((preset) => preset.id === id)?.label ?? id;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ChipToggleGroupComponent, SectionHeaderComponent],
	selector: 'fe-wine-smart-filters',
	template: `
		<section class="fe-filter-panel__section--divided">
			<fe-section-header label="Smart filters" note="(expression mode)" />

			<label class="fe-wine-smart__mode">
				<input type="checkbox" [checked]="isMulti()" (change)="changeMode($event)" />
				<span>Match any (OR)</span>
			</label>

			<fe-chip-toggle-group
				[formatLabel]="labelForPreset"
				[options]="presetIds"
				[selected]="selected()"
				(toggled)="toggle($event)"
			/>

			@if (selected().length > 0) {
				<div class="fe-wine-smart__paused">
					<span>Manual filters are paused.</span>
					<button type="button" class="fe-wine-smart__clear" (click)="apply([])">
						Clear smart filters
					</button>
				</div>
			}
		</section>
	`,
})
export class WineSmartFiltersComponent {
	/** The lit preset ids, derived by the panel off the engine's expression. */
	public readonly selected = input<readonly string[]>([]);

	/** The panel paints this locally before the engine round trip confirms it. */
	public readonly selectedChange = output<readonly string[]>();

	/** Bound into the template. */
	protected readonly presetIds = PRESET_IDS;

	/** Bound into the template; see {@link labelForPreset}. */
	protected readonly labelForPreset = labelForPreset;

	private readonly _engine = injectFilterEngine<Wine>();

	/** How many presets are lit — the source the mode checkbox adopts from. */
	private readonly _selectedCount = computed(() => this.selected().length);

	/** Whether "Match any (OR)" is on. Seeded, then adopted ONE-WAY — see the class remarks. */
	protected readonly isMulti = linkedSignal<number, boolean>({
		computation: (count, previous) => count > 1 || (previous?.value ?? false),
		source: this._selectedCount,
	});

	/**
	 * Apply a selection as an expression, or clear it.
	 *
	 * @param next - The preset ids to apply.
	 */
	protected apply(next: readonly string[]): void {
		this.selectedChange.emit(next);
		// The shared helper every vertical's preset row calls. A non-empty selection clears the flat
		// facets first: an expression AND a leftover flat rule would both be on the engine, the rule
		// dormant behind the expression and back the moment the preset is cleared. An empty selection
		// only leaves expression mode.
		commitSmartFilterSelection(this._engine, next);
	}

	/**
	 * Toggle one preset, honoring the current combination mode.
	 *
	 * @param id - The preset clicked.
	 */
	protected toggle(id: string): void {
		const current = this.selected();

		if (current.includes(id)) {
			this.apply(current.filter((entry) => entry !== id));

			return;
		}
		this.apply(this.isMulti() ? [...current, id] : [id]);
	}

	/**
	 * Switch between single-select and OR, clearing the current selection.
	 *
	 * @param event - The checkbox's change event.
	 */
	protected changeMode(event: Event): void {
		this.isMulti.set((event.currentTarget as HTMLInputElement).checked);
		this.selectedChange.emit([]);
		exitExpressionMode(this._engine);
	}
}
