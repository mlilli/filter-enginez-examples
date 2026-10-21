/**
 * `<fe-date-preset-group>` — a SINGLE-select pill group with an explicit "any" escape, over the
 * shared `fe-chip*` classes.
 *
 * @remarks
 * **Why not `<fe-chip-toggle-group>`.** That control is multi-select and exclusion-driven; this one is
 * neither. Relative date presets are mutually exclusive by nature — "last 7 days" and "this year" are
 * not a set to union, they are one choice — so selecting one must deselect the rest, and the neutral
 * state needs a real option rather than "nothing selected", which reads as broken. Forcing that
 * through a multi-select control would mean fighting its semantics at every call site.
 *
 * **No predictive disable, deliberately.** Every other facet dims options that would empty the result
 * set, but a `DateRangeRule` preset resolves against `Date.now()` at EVALUATION time — that is what
 * keeps "last 7 days" meaning the last seven days rather than the seven before page load. A projected
 * count computed at bundle-fetch time would therefore describe a slightly different window than the
 * one the rule will actually apply, so the honest thing is not to project at all. React's, Vue's and
 * Svelte's sections make the same call.
 *
 * `aria-pressed` carries the selection, not color alone — the group is a set of toggle buttons, and a
 * user who cannot distinguish the cyan still needs to know which is active.
 *
 * ### The generic
 *
 * `V extends string` is carried through from the Vue original so a call site's preset union survives
 * into the emission: a books page passing `'7d' | '30d' | 'year'` gets that union back out of
 * `presetSelected`, not a bare `string` it has to re-narrow. Angular infers `V` from `presets` under
 * `strictTemplates`, and none of Vue's generic-erasure traps (`withDefaults`, `:aria-label`) have an
 * Angular equivalent — the only defense needed is the `groupLabel` naming, which is house style here
 * regardless.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One selectable preset. */
export interface DatePreset<V extends string> {
	/** Visible text, e.g. `'Last 7 days'`. */
	readonly label: string;
	/** The value handed back on selection. */
	readonly value: V;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-date-preset-group',
	template: `
		<div class="fe-chip-toggle" role="group" [attr.aria-label]="groupLabel()">
			<button
				type="button"
				class="fe-chip"
				[class.fe-chip--selected]="selected() === null"
				[attr.aria-pressed]="selected() === null"
				(click)="presetSelected.emit(null)"
			>{{ anyLabel() }}</button>
			@for (preset of presets(); track preset.value) {
				<button
					type="button"
					class="fe-chip"
					[class.fe-chip--selected]="selected() === preset.value"
					[attr.aria-pressed]="selected() === preset.value"
					(click)="presetSelected.emit(preset.value)"
				>{{ preset.label }}</button>
			}
		</div>
	`,
})
export class DatePresetGroupComponent<V extends string> {
	/** Label for the option that clears the filter, e.g. `'Any time'`. */
	public readonly anyLabel = input.required<string>();

	/**
	 * Accessible name for the group.
	 *
	 * @remarks
	 * `groupLabel`, not `ariaLabel` — see the note on `<fe-result-grid>`'s `listLabel`. A control's
	 * label prop is named after what it labels, never after the HTML attribute it happens to end up in.
	 */
	public readonly groupLabel = input.required<string>();

	/** The selectable presets, in display order. */
	public readonly presets = input.required<readonly DatePreset<V>[]>();

	/** The active preset, or `null` when the filter is off. */
	public readonly selected = input.required<V | null>();

	/**
	 * Emitted with the chosen value, or `null` for the "any" option. The caller owns the rule.
	 *
	 * @remarks
	 * Not `select`: that is a native DOM event name, so an output using it would shadow the real event
	 * on any host that listens for both (and `@angular-eslint/no-output-native` rejects it outright).
	 */
	public readonly presetSelected = output<V | null>();
}
