/**
 * `createNumberField` — a numeric input over the shared `fe-number-field` class.
 *
 * @remarks
 * The framework-less counterpart to react-ui's, SvelteKit's, Vue's and Angular's `NumberField`.
 * Styling is entirely `ui-styles`; this contributes markup and a commit rule and nothing else. Wine's
 * score-comparison facet is its only consumer, and it is the last control this app lacked before that
 * panel could be written.
 *
 * **Commits on `change`, never `input`.** A number field emits an event per keystroke, and mid-typing
 * values are usually nonsense — typing "95" passes through "9" first, which would fire a filter for
 * scores above nine and briefly show the whole corpus. `change` fires on blur or Enter, when the
 * number the user meant is actually there. On wine's worker tier that difference is not cosmetic: each
 * intermediate value would be a full Comlink round trip against 150k records.
 *
 * **A non-numeric or empty field is ignored rather than coerced.** `Number('')` is `0`, which would
 * silently become a real threshold the moment someone cleared the box to retype — a points filter of
 * "≥ 0" looks exactly like no filter at all while being a live rule.
 *
 * **`fieldLabel`, not `ariaLabel`.** A control's label option is named after the thing it labels,
 * never after the HTML attribute it ends up in, so it still reads correctly beside `selectLabel`,
 * `groupLabel` and `listLabel` on the sibling controls.
 *
 * @packageDocumentation
 */

import { el } from '@filter-enginez/examples-shared/dom';

import type { Control } from './controls.js';

/** Construction-time configuration. */
export interface NumberFieldOptions {
	/** Accessible name for the input. See the module remarks for why it is not `ariaLabel`. */
	readonly fieldLabel: string;
	/** Called with a committed, finite value. The caller commits the rule change. */
	readonly onChange: (next: number) => void;
	/** Upper bound hint for the native control. */
	readonly max?: number;
	/** Lower bound hint for the native control. */
	readonly min?: number;
	/** Native step granularity. */
	readonly step?: number;
}

/** State a number field renders from. */
export interface NumberFieldState {
	/** The value to display. */
	readonly value: number;
}

/**
 * Build a numeric input that commits on blur or Enter.
 *
 * @param options - Label, change callback, and the optional native bounds.
 * @returns The mounted field; `update(state)` re-renders the displayed value.
 */
export function createNumberField(options: NumberFieldOptions): Control<NumberFieldState> {
	const { fieldLabel, max, min, onChange, step } = options;

	const element = el('input', {
		attrs: {
			'aria-label': fieldLabel,
			...(max === undefined ? {} : { max: String(max) }),
			...(min === undefined ? {} : { min: String(min) }),
			step: String(step ?? 1),
			type: 'number',
		},
		className: 'fe-number-field',
		on: {
			change: (event) => {
				const next = Number.parseFloat((event.target as HTMLInputElement).value);

				// Not `Number()` and not a truthiness check: see the module remarks. `Number.isFinite`
				// also rejects the Infinity a lone "e" or an overflowing exponent can produce.
				if (Number.isFinite(next)) {
					onChange(next);
				}
			},
		},
	});

	return {
		element,
		update: ({ value }) => {
			// Written only when it actually differs. Assigning `input.value` resets the field's editing
			// position even when the string is identical, so an unconditional write during an unrelated
			// re-render jumps the caret mid-edit — the kind of thing that reads as a flaky keyboard
			// rather than as a bug in a render pass. The test asserts the WRITE rather than the caret,
			// because selection APIs throw on `type="number"`.
			const next = String(value);

			if (element.value !== next) {
				element.value = next;
			}
		},
	};
}
