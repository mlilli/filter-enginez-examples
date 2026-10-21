/**
 * `controls/controls` — the chip-group, search-input, and checkbox controls, hand-built over the shared
 * `ui-styles` classes.
 *
 * @remarks
 * The framework-less counterparts to `react-ui`'s controls and their Vue / Svelte ports. Each builder
 * returns a `{ element, update }` pair: `element` is mounted once, and `update` re-applies state
 * in place. That split is what lets the two page wirings differ — `/books` calls a single control's
 * `update` when its signal fires, while `/books-raw` calls every `update` after one coarse change —
 * without either page knowing how the DOM is built.
 *
 * Markup + class names mirror the other verticals exactly, so all six render identically. The list-shaped
 * controls update in place, keyed by value, so focus survives every repaint — see `keyedChildren.ts`.
 *
 * @packageDocumentation
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/books-domain';

import { el, setHidden, svg } from '@filter-enginez/examples-shared/dom';

import { createKeyedParts, type KeyedPart, reconcileChildren, setOptionalAttribute } from './keyedChildren.js';

/** A mounted control: a stable root element plus an in-place state updater. */
export interface Control<State> {
	/** The root element — appended once, never replaced. */
	readonly element: HTMLElement;
	/** Re-apply state in place. */
	readonly update: (state: State) => void;
}

/** State a chip group renders from. */
export interface ChipGroupState {
	/** All candidate values, in display order. */
	readonly options: readonly string[];
	/** Currently-selected values. */
	readonly selected: readonly string[];
	/** Predictive-disable data; chips that would empty the result set are subdued + disabled. */
	readonly exclusion?: ExclusionMap;
}

/** Construction-time options for a chip group. */
export interface ChipGroupOptions {
	/** Called with the clicked value; the caller commits the rule change. */
	readonly onToggle: (value: string) => void;
	/** Show projected-count badges on unselected chips when exclusion data is present. */
	readonly showCount?: boolean;
	/** Per-chip label formatter. Defaults to identity. */
	readonly formatLabel?: (value: string) => string;
	/**
	 * Cap the group's height and let it scroll.
	 *
	 * @remarks
	 * For a vocabulary too long to lay flat — wine's varietals are the only case. `ui-styles` supplies
	 * `fe-chip-toggle--capped` for exactly this, so it is a modifier rather than a second control.
	 */
	readonly scrollable?: boolean;
}

/**
 * Build a chip-toggle set for `InSet`-style filters, with exclusion-aware disabling.
 *
 * @remarks
 * A chip whose addition would empty the result set renders subdued + `disabled`, telling the user
 * "this would give zero matches" before they click. Selected chips always stay clickable so the user
 * can deselect to escape a dead end.
 *
 * **Updated in place, keyed by value.** Each value keeps one `<button>` for as long as it is offered,
 * and `update` rewrites its classes, ARIA state and contents rather than replacing it — so the chip a
 * keyboard user just toggled keeps focus through its own repaint and through the engine's answer.
 * See `keyedChildren.ts`.
 *
 * @param options - Toggle callback + display options.
 * @returns The mounted chip group.
 */
export function createChipToggleGroup(options: ChipGroupOptions): Control<ChipGroupState> {
	const {
		formatLabel = (value: string): string => value,
		onToggle,
		scrollable: isScrollable = false,
		showCount: shouldShowCount = false,
	} = options;
	const element = el('div', {
		className: isScrollable ? 'fe-chip-toggle fe-chip-toggle--capped' : 'fe-chip-toggle',
	});
	const chips = createKeyedParts<string, ChipPart>((value) => ({
		element: el('button', {
			attrs: { type: 'button' },
			on: {
				click: () => {
					onToggle(value);
				},
			},
		}),
		key: value,
	}));

	return {
		element,
		update: ({ exclusion, options: values, selected }) => {
			const parts = chips.resolve(values);

			for (const { element: button, key: value } of parts) {
				const isSelected = selected.includes(value);
				const data = exclusion?.get(value);
				const isUnavailable = (data?.wouldBeEmpty ?? false) && !isSelected;
				const label = formatLabel(value);

				button.className = chipClass(isSelected, isUnavailable);
				button.setAttribute('aria-pressed', String(isSelected));
				button.disabled = isUnavailable;
				setOptionalAttribute(button, 'title', chipTitle(label, data?.projectedCount, isUnavailable, shouldShowCount));
				button.replaceChildren(
					label,
					...(shouldShowCount && data !== undefined && !isSelected
						? [
							el('span', {
								className: isUnavailable
									? 'fe-chip__count fe-chip__count--unavailable'
									: 'fe-chip__count',
								text: `(${data.projectedCount.toLocaleString()})`,
							}),
						]
						: []),
				);
			}
			reconcileChildren(element, parts.map((part) => part.element));
		},
	};
}

/** One chip: its value and its button. */
interface ChipPart extends KeyedPart<string> {
	/** The chip's button, kept for as long as the value is offered. */
	readonly element: HTMLButtonElement;
}

/** State a checkbox list renders from — the same shape as a chip group's. */
export type CheckboxListState = ChipGroupState;

/** Construction-time options for a checkbox list. */
export interface CheckboxListOptions {
	/** Scroll-viewport height, as a CSS length. */
	readonly maxHeight: string;
	/** Called with the toggled value; the caller commits the rule change. */
	readonly onToggle: (value: string) => void;
	/** Show the projected-count column on unselected rows when exclusion data is present. */
	readonly showCount?: boolean;
}

/** One checkbox-list row and the three nodes its update rewrites. */
interface CheckboxRowPart extends KeyedPart<string> {
	/** The box. */
	readonly box: HTMLInputElement;
	/** The projected count, moved in and out of the row. */
	readonly count: HTMLElement;
	/** The row `<label>`. */
	readonly element: HTMLLabelElement;
}

/**
 * Build a scrolling checkbox list for a multi-select `InSet` facet too long for chips.
 *
 * @remarks
 * The framework-less `<CheckboxList>`: one `<label class="fe-checkbox-list__row">` per value holding
 * the box and its label, plus a right-aligned projected count. Same exclusion rule as the chips — an
 * unselected row whose selection would empty the results is disabled and says why in its title — and
 * the same in-place, keyed update, so the box a keyboard user just toggled keeps focus.
 *
 * @param options - Toggle callback, viewport height and the count column.
 * @returns The mounted list.
 */
export function createCheckboxList(options: CheckboxListOptions): Control<CheckboxListState> {
	const { maxHeight, onToggle, showCount: shouldShowCount = false } = options;
	const element = el('div', { className: 'fe-checkbox-list', style: { maxHeight }});
	const rows = createKeyedParts<string, CheckboxRowPart>((value) => {
		const box = el('input', {
			attrs: { type: 'checkbox' },
			className: 'fe-checkbox-list__box',
			on: {
				change: () => {
					onToggle(value);
				},
			},
		});

		return {
			box,
			count: el('span', { className: 'fe-checkbox-list__count' }),
			element: el('label', {
				children: [
					el('span', {
						children: [box, el('span', { className: 'fe-checkbox-list__label', text: value })],
						className: 'fe-checkbox-list__main',
					}),
				],
			}),
			key: value,
		};
	});

	return {
		element,
		update: ({ exclusion, options: values, selected }) => {
			const parts = rows.resolve(values);

			for (const { box, count, element: row, key: value } of parts) {
				const isSelected = selected.includes(value);
				const data = exclusion?.get(value);
				const isUnavailable = (data?.wouldBeEmpty ?? false) && !isSelected;
				const rowClasses = ['fe-checkbox-list__row'];

				if (isSelected) {
					rowClasses.push('fe-checkbox-list__row--selected');
				}
				if (isUnavailable) {
					rowClasses.push('fe-checkbox-list__row--unavailable');
				}
				row.className = rowClasses.join(' ');
				setOptionalAttribute(row, 'title', isUnavailable ? `No matches for ${value} given your other filters` : null);
				box.checked = isSelected;
				box.disabled = isUnavailable;
				count.className = isUnavailable
					? 'fe-checkbox-list__count fe-checkbox-list__count--unavailable'
					: 'fe-checkbox-list__count';
				// Moved in and out rather than the row rebuilt: rebuilding would detach the box, and with
				// it the focus.
				if (shouldShowCount && data !== undefined && !isSelected) {
					count.textContent = data.projectedCount.toLocaleString();
					row.append(count);
				} else {
					count.remove();
				}
			}
			reconcileChildren(element, parts.map((part) => part.element));
		},
	};
}

/** Construction-time options for a search input. */
export interface SearchInputOptions {
	/** Fires per keystroke so the caller can mirror the typed text. */
	readonly onChange: (value: string) => void;
	/** Fires on blur / Enter / clear — where expensive engine work belongs. */
	readonly onCommit: (value: string) => void;
	/** Placeholder text. */
	readonly placeholder?: string;
	/** Accessible name for the field. */
	readonly ariaLabel?: string;
}

/**
 * Build a search input with a magnifier icon and a clear-X affordance.
 *
 * @remarks
 * `onChange` fires per keystroke; `onCommit` fires on blur, Enter, or clear — once for each, so the
 * blur that follows Enter does not commit the same text again. Callers bind both to the shared
 * typeahead controller (`typeaheadSearch.ts`), which owns the debounce and drops unchanged commits. The focus halo and the
 * clear-X hover are pure CSS, so this holds no state beyond the field value.
 *
 * @param options - Change/commit callbacks + display options.
 * @returns The mounted search input; `update(value)` sets the field text.
 */
export function createSearchInput(options: SearchInputOptions): Control<string> {
	const { ariaLabel, onChange, onCommit, placeholder } = options;
	/** Set only for the synchronous blur that Enter's own `target.blur()` dispatches. */
	let isBlurringAfterEnter = false;

	const field = el('input', {
		attrs: {
			'aria-label': ariaLabel ?? null,
			placeholder: placeholder ?? null,
			type: 'search',
		},
		className: 'fe-search-input__field',
		on: {
			blur: (event) => {
				// Enter has already committed this text; the blur its `target.blur()` causes must not
				// commit it a second time.
				if (isBlurringAfterEnter) {
					return;
				}
				onCommit((event.target as HTMLInputElement).value);
			},
			input: (event) => {
				const { value } = event.target as HTMLInputElement;

				syncClear(value);
				onChange(value);
			},
			keydown: (event) => {
				const keyEvent = event as KeyboardEvent;
				const target = keyEvent.currentTarget as HTMLInputElement;

				if (keyEvent.key === 'Enter') {
					keyEvent.preventDefault();
					onCommit(target.value);
					isBlurringAfterEnter = true;
					target.blur();
					isBlurringAfterEnter = false;
				} else if (keyEvent.key === 'Escape') {
					target.blur();
				}
			},
		},
	});

	const clearButton = el('button', {
		attrs: { 'aria-label': 'Clear search', type: 'button' },
		children: [
			svg(
				'svg',
				{
					fill: 'none',
					height: 14,
					stroke: 'currentColor',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'round',
					'stroke-width': 1.75,
					viewBox: '0 0 24 24',
					width: 14,
				},
				[svg('path', { d: 'M18 6 6 18M6 6l12 12' })],
			),
		],
		className: 'fe-search-input__clear',
		on: {
			click: () => {
				field.value = '';
				syncClear('');
				onChange('');
				onCommit('');
			},
		},
	});

	/** Show the clear-X only when there is text (mirrors the other verticals' `v-if` / `{#if}`). */
	function syncClear(value: string): void {
		setHidden(clearButton, value.length === 0);
	}

	const element = el('div', {
		children: [magnifierIcon(), field, clearButton],
		className: 'fe-search-input',
	});

	syncClear('');

	return {
		element,
		update: (value) => {
			// Don't clobber what the user is actively typing; only re-sync on external change.
			if (field.value !== value) {
				field.value = value;
			}
			syncClear(value);
		},
	};
}

/** The tooltip on a checkbox that predictive disable has switched off. */
export const TOGGLE_DISABLED_TITLE = 'No matches given your other filters';

/** State a checkbox control renders from. */
export interface CheckboxState {
	/** Whether the box is checked. */
	readonly checked: boolean;
	/** Whether the control is disabled (its rule would empty the result set). */
	readonly disabled?: boolean;
}

/** Construction-time options for a checkbox control. */
export interface CheckboxOptions {
	/** Visible label text. */
	readonly label: string;
	/** Called with the next checked state. */
	readonly onToggle: (checked: boolean) => void;
}

/**
 * Build a labelled checkbox for `Boolean` / `Exists` / Bloom-membership toggles.
 *
 * @param options - Label + toggle callback.
 * @returns The mounted checkbox control.
 */
export function createCheckboxControl(options: CheckboxOptions): Control<CheckboxState> {
	const { label, onToggle } = options;
	const input = el('input', {
		attrs: { type: 'checkbox' },
		on: {
			change: (event) => {
				onToggle((event.target as HTMLInputElement).checked);
			},
		},
	});
	const element = el('label', {
		children: [input, el('span', { text: label })],
		className: 'fe-books-checkbox',
	});

	return {
		element,
		update: ({ checked, disabled = false }) => {
			input.checked = checked;
			input.disabled = disabled;
			element.className = disabled ? 'fe-books-checkbox fe-books-checkbox--disabled' : 'fe-books-checkbox';
			// The same words every vertical's checkbox carries when predictive disable switches it off.
			setOptionalAttribute(element, 'title', disabled ? TOGGLE_DISABLED_TITLE : null);
		},
	};
}

/**
 * The magnifier glyph for {@link createSearchInput}.
 *
 * @internal
 */
function magnifierIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			class: 'fe-search-input__icon',
			fill: 'none',
			height: 14,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 14,
		},
		[svg('circle', { cx: 11, cy: 11, r: 8 }), svg('path', { d: 'm21 21-4.3-4.3' })],
	);
}

/**
 * Class list for a chip button.
 *
 * @internal
 */
function chipClass(isSelected: boolean, isUnavailable: boolean): string {
	const classNames = ['fe-chip'];

	if (isSelected) {
		classNames.push('fe-chip--selected');
	}
	if (isUnavailable) {
		classNames.push('fe-chip--unavailable');
	}

	return classNames.join(' ');
}

/**
 * The `title` tooltip for a chip: a dead-end explanation when unavailable, otherwise the projected
 * count when counts are shown.
 *
 * @internal
 */
function chipTitle(
	label: string,
	projectedCount: number | undefined,
	isUnavailable: boolean,
	shouldShowCount: boolean,
): string | null {
	if (isUnavailable) {
		return `No matches for ${label} given your other filters`;
	}
	if (shouldShowCount && projectedCount !== undefined) {
		return `${projectedCount.toLocaleString()} would match`;
	}

	return null;
}
