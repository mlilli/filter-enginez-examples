/**
 * `controls/datePresetGroup` — a SINGLE-select pill group with an explicit "any" escape, over the
 * shared `fe-chip*` classes.
 *
 * @remarks
 * **Why not `createChipToggleGroup`.** That control is multi-select and exclusion-driven; this one is
 * neither. Relative date presets are mutually exclusive by nature — "last 7 days" and "this year" are
 * not a set to union, they are one choice — so selecting one must deselect the rest, and the neutral
 * state needs a real option rather than "nothing selected", which reads as broken. Forcing that
 * through a multi-select control would mean fighting its semantics at every call site.
 *
 * **No predictive disable, deliberately.** Every other facet dims options that would empty the result
 * set, but a `DateRangeRule` preset resolves against `Date.now()` at EVALUATION time — that is what
 * keeps "last 7 days" meaning the last seven days rather than the seven before page load. A projected
 * count computed at bundle-fetch time would therefore describe a slightly different window than the
 * one the rule will actually apply, so the honest thing is not to project at all. React's, Vue's,
 * Svelte's and Angular's sections all make the same call.
 *
 * `aria-pressed` carries the selection, not color alone — the group is a set of toggle buttons, and a
 * user who cannot distinguish the cyan still needs to know which is active.
 *
 * ### The generic
 *
 * `V extends string` is carried through from the other verticals so a call site's preset union
 * survives into the callback: a panel passing `'7d' | '30d' | 'year'` gets that union back out of
 * `onSelect`, not a bare `string` it has to re-narrow before building the rule. None of the
 * generic-erasure traps the Vue port documents exist here — there is no template type-checker to
 * confuse — but the four verticals agreeing on the shape is worth more than the saving.
 *
 * @packageDocumentation
 */

import { el } from '@filter-enginez/examples-shared/dom';

import type { Control } from './controls.js';

import { createKeyedParts, type KeyedPart, reconcileChildren } from './keyedChildren.js';

/** One selectable preset. */
export interface DatePreset<V extends string> {
	/** Visible text, e.g. `'Last 7 days'`. */
	readonly label: string;
	/** The value handed back on selection. */
	readonly value: V;
}

/** Construction-time options for a date-preset group. */
export interface DatePresetGroupOptions<V extends string> {
	/** Label for the option that clears the filter, e.g. `'Any time'`. */
	readonly anyLabel: string;
	/**
	 * Accessible name for the group.
	 *
	 * @remarks
	 * `groupLabel`, not `ariaLabel` — a control's label prop is named after what it labels, never after
	 * the HTML attribute it happens to end up in.
	 */
	readonly groupLabel: string;
	/** Called with the chosen value, or `null` for the "any" option. The caller owns the rule. */
	readonly onSelect: (value: V | null) => void;
}

/** State a date-preset group renders from. */
export interface DatePresetGroupState<V extends string> {
	/** The selectable presets, in display order. */
	readonly presets: readonly DatePreset<V>[];
	/** The active preset, or `null` when the filter is off. */
	readonly selected: V | null;
}

/**
 * Build a single-select preset pill group.
 *
 * @typeParam V - The preset value union, preserved into `onSelect`.
 * @param options - The "any" label, the group's accessible name, and the selection callback.
 * @returns The mounted preset group.
 */
export function createDatePresetGroup<V extends string>(
	options: DatePresetGroupOptions<V>,
): Control<DatePresetGroupState<V>> {
	const { anyLabel, groupLabel, onSelect } = options;

	const element = el('div', {
		attrs: { 'aria-label': groupLabel, role: 'group' },
		className: 'fe-chip-toggle',
	});
	/** The "any" pill is keyed as `null`, which no preset value can collide with. */
	const pills = createKeyedParts<V | null, { readonly element: HTMLButtonElement } & KeyedPart<V | null>>(
		(value) => ({
			element: el('button', {
				attrs: { type: 'button' },
				on: {
					click: () => {
						onSelect(value);
					},
				},
			}),
			key: value,
		}),
	);

	return {
		element,
		// In place, keyed by value, like `createChipToggleGroup`: the pill a keyboard user just pressed
		// keeps focus through the repaint its own click causes.
		update: ({ presets, selected }) => {
			// The "any" chip is FIRST and is not one of the presets — it is the escape from the facet,
			// not a member of it, and a user scanning left-to-right should meet "off" before the
			// choices.
			const labels = new Map<V | null, string>([[null, anyLabel]]);

			for (const preset of presets) {
				labels.set(preset.value, preset.label);
			}

			const parts = pills.resolve([...labels.keys()]);

			for (const { element: pill, key } of parts) {
				const isSelected = key === selected;

				pill.className = isSelected ? 'fe-chip fe-chip--selected' : 'fe-chip';
				pill.setAttribute('aria-pressed', String(isSelected));
				// `String()` rather than `?? ''`: every key came out of `labels`, so the lookup always hits.
				pill.textContent = String(labels.get(key));
			}
			reconcileChildren(element, parts.map((part) => part.element));
		},
	};
}
