/**
 * `<fe-number-field>` — a numeric input over the shared `fe-number-field` class.
 *
 * @remarks
 * The Angular counterpart to react-ui's, SvelteKit's and Vue's `NumberField`. Styling is entirely
 * `ui-styles`; this component contributes markup and a commit rule and nothing else. Wine's
 * score-comparison facet is its only consumer.
 *
 * **Commits on `change`, never `input`.** A number field emits an event per keystroke, and mid-typing
 * values are usually nonsense — typing "95" passes through "9" first, which would fire a filter for
 * scores above nine and briefly show the whole corpus. `change` fires on blur or Enter, when the
 * number the user meant is actually there. On wine's worker tier that difference is not cosmetic:
 * each intermediate value would be a full Comlink round trip against 150k records.
 *
 * **A non-numeric or empty field is ignored rather than coerced.** `Number('')` is `0`, which would
 * silently become a real threshold the moment someone cleared the box to retype — a points filter of
 * "≥ 0" looks exactly like no filter at all while being a live rule.
 *
 * **`fieldLabel`, not `ariaLabel`.** A template `aria-label` binding is matched against the global
 * HTML aria typing before an input of that name, so an input called `ariaLabel` reads as never
 * supplied — the trap `hierarchical-picker`'s docblock records and the reason `groupLabel`,
 * `selectLabel` and `listLabel` are named as they are. This one is optional and would survive the
 * name, but the convention is worth more than the exception.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-number-field',
	template: `
		<input
			type="number"
			class="fe-number-field"
			[attr.aria-label]="fieldLabel()"
			[attr.max]="max()"
			[attr.min]="min()"
			[step]="step()"
			[value]="value()"
			(change)="handleChange($event)"
		/>
	`,
})
export class NumberFieldComponent {
	/** Accessible name for the input. Not `ariaLabel` — see the docblock. */
	public readonly fieldLabel = input.required<string>();

	public readonly max = input<number>();

	public readonly min = input<number>();

	public readonly step = input<number>(1);

	public readonly value = input.required<number>();

	/** Emitted on commit — blur or Enter — and only when the field parses to a finite number. */
	public readonly valueChange = output<number>();

	/**
	 * Parse and forward a committed value, dropping anything that is not a real number.
	 *
	 * @param event - The input's `change` event.
	 */
	protected handleChange(event: Event): void {
		const input_ = event.target as HTMLInputElement;
		const next = Number.parseFloat(input_.value);

		if (Number.isFinite(next)) {
			this.valueChange.emit(next);
		}
	}
}
