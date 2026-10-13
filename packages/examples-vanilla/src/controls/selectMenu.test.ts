/**
 * Tests for `createSelectMenu` — the labelled `<select>` over the shared `fe-select` classes.
 *
 * @remarks
 * ### The trap this module exists to avoid, and jsdom CAN see it
 *
 * The docblock's central claim is that assigning `select.value` before the options exist is
 * silently dropped: the browser has nothing to match the string against, `value` reverts to `''`,
 * and the menu opens on the placeholder no matter what the caller passed. Nothing throws.
 *
 * **jsdom reproduces it.** Setting `value = 'b'` on an empty select
 * and then inserting options leaves the value at `'a'` — the first option. So the mutant that moves
 * to a `select.value` assignment is fatal here, which is worth stating because the sibling
 * `dom.test.ts` works around jsdom NOT reproducing its module's hazard. The environment
 * question has to be asked per module; the answers differ.
 *
 * ### 🔴 One branch is measurably UNOBSERVABLE, and no test here pretends otherwise
 *
 * The placeholder's own selectedness — `optionElement('', placeholder, value === '')` — cannot be
 * distinguished from passing `false`. A `<select>` with no option marked selected falls back to
 * index 0, and the placeholder IS index 0, so both implementations yield `value === ''` and
 * `selectedIndex === 0` (measured). The expression is defensively correct and stays;
 * what does not exist is a test that would fail if it were wrong, and inventing one that asserts
 * the call rather than the effect would be a guard in name only.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { createSelectMenu, type SelectMenuOption } from './selectMenu.js';

/** Two entries whose labels differ from their values, so the two can never be confused. */
const OPTIONS: readonly SelectMenuOption[] = [
	{ label: 'Bordeaux', value: 'bordeaux' },
	{ label: 'Rioja', value: 'rioja' },
];

/**
 * Mount a menu and render one state.
 *
 * @remarks
 * `null` means "no placeholder", NOT `undefined`. A default parameter fires on an explicitly-passed
 * `undefined`, so `renderMenu(value, undefined)` would silently get the default back — and a
 * no-placeholder test would pass the wrong thing to the module and fail against a correct
 * implementation.
 *
 * @param value - The selected value, or `''` for the placeholder.
 * @param placeholder - The "no selection" label, or `null` to omit it.
 * @returns The control, its `<select>`, and the log of `onChange` calls.
 */
function renderMenu(value: string, placeholder: string | null = 'Any region') {
	const changes: string[] = [];
	const control = createSelectMenu({
		onChange: (next) => {
			changes.push(next);
		},
		placeholder: placeholder ?? undefined,
		selectLabel: 'Region',
	});

	control.update({ options: OPTIONS, value });

	const field = control.element.querySelector('select');

	if (field === null) {
		throw new Error('the menu must render a real <select> — ui-styles positions its chrome around one');
	}

	return { changes, control, element: control.element, field };
}

describe('structure', () => {
	it('names the select for a screen reader', () => {
		// Icon-and-chrome only otherwise: ui-styles suppresses the native arrow and draws its own,
		// so there is no visible label anywhere near this control.
		expect(renderMenu('').field.getAttribute('aria-label')).toBe('Region');
	});

	it('draws the chevron under the class ui-styles positions', () => {
		// `fe-select__chevron` is not decorative naming — ui-styles positions THIS class absolutely
		// at `right: 10px`. A made-up name renders an unstyled arrow flush against the border, which
		// is a visual bug no behavioral assertion would ever reach.
		const { element } = renderMenu('');
		const chevron = element.querySelector('.fe-select__chevron');

		expect(chevron).not.toBeNull();
		expect(chevron?.getAttribute('aria-hidden')).toBe('true');
	});
});

describe('the placeholder', () => {
	it('is a real, selectable option rather than a disabled one', () => {
		// The facet's off switch. Disabled, the filter is one-way: pick a region once and the only
		// route back is a reload or the results header's clear-all.
		const { field } = renderMenu('rioja');
		const placeholder = field.options[0];

		expect(placeholder?.textContent).toBe('Any region');
		expect(placeholder?.value).toBe('');
		expect(placeholder?.disabled).toBe(false);
	});

	it('is omitted entirely when the caller supplies none', () => {
		const { field } = renderMenu('bordeaux', null);

		expect(Array.from(field.options).map((option) => option.value)).toEqual(['bordeaux', 'rioja']);
	});
});

describe('selection', () => {
	it('opens on the selected entry, not on the first one', () => {
		// 🔴 The module's reason to exist. Building the options and THEN assigning `select.value`
		// leaves this at `''` — jsdom reproduces the drop faithfully (see the file remarks).
		const { field } = renderMenu('rioja');

		expect(field.value).toBe('rioja');
		expect(field.selectedIndex).toBe(2);
	});

	it('falls back to the placeholder when the value matches nothing', () => {
		const { field } = renderMenu('');

		expect(field.value).toBe('');
	});

	it('re-selects correctly when the option LIST changes under it', () => {
		// The ordering hazard again, one repaint later: a predictive-disable bundle narrows the
		// vocabulary while a selection is live, so the options are rebuilt around the same value.
		const { control, field } = renderMenu('rioja');

		control.update({ options: [{ label: 'Rioja', value: 'rioja' }], value: 'rioja' });

		expect(field.value).toBe('rioja');
		expect(field.options).toHaveLength(2);
	});

	it('REBUILDS the option list rather than appending to it', () => {
		const { control, field } = renderMenu('');

		control.update({ options: OPTIONS, value: 'bordeaux' });
		control.update({ options: OPTIONS, value: 'rioja' });

		expect(field.options).toHaveLength(OPTIONS.length + 1);
	});
});

describe('onChange', () => {
	it('reports the chosen VALUE, not its label', () => {
		const { changes, field } = renderMenu('');

		field.value = 'bordeaux';
		field.dispatchEvent(new Event('change'));

		expect(changes).toEqual(['bordeaux']);
	});

	it('reports the empty string when the user returns to the placeholder', () => {
		// The off switch has to reach the caller as `''`, which is what the caller reads to remove
		// the rule. Swallowing it would leave the menu showing "Any region" over a live filter.
		const { changes, field } = renderMenu('rioja');

		field.value = '';
		field.dispatchEvent(new Event('change'));

		expect(changes).toEqual(['']);
	});
});
