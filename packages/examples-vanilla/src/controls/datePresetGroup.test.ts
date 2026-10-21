/**
 * Tests for `createDatePresetGroup` — the SINGLE-select pill group with an explicit "any" escape.
 *
 * @remarks
 * The three things this control decides, none of which any other control in the package decides the
 * same way:
 *
 * 1. **"Any" is first, and is not a preset.** It is the escape from the facet rather than a member
 *    of it, so a user scanning left-to-right meets "off" before the choices — and `onSelect(null)`
 *    is a different call from `onSelect(somePreset)`, which is what makes the facet clearable at
 *    all. The sibling `createChipToggleGroup` is multi-select and has no such option.
 * 2. **Selection is single.** Choosing one deselects the rest, because "last 7 days" and "this
 *    year" are one choice rather than a set to union.
 * 3. **`aria-pressed` carries the selection, not color.** Color is never the only channel — a user who
 *    cannot distinguish the cyan still has to know which pill is live. Every selection assertion
 *    below therefore checks the attribute AND the modifier class, because fixing one channel and
 *    not the other is worse than fixing neither.
 *
 * `update` is a full rebuild rather than a diff, which is a decision with a failure mode: an
 * `append` where `replaceChildren` belongs accumulates a fresh row of pills on every repaint, and a
 * facet that repaints on every keystroke would grow without bound. Two updates in one test is the
 * cheapest instrument for it.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { createDatePresetGroup, type DatePreset } from './datePresetGroup.js';

/** A three-preset fixture whose values form a union, as the real call sites' do. */
const PRESETS: readonly DatePreset<'30d' | '7d' | 'year'>[] = [
	{ label: 'Last 7 days', value: '7d' },
	{ label: 'Last 30 days', value: '30d' },
	{ label: 'This year', value: 'year' },
];

/**
 * Mount a group and render one state.
 *
 * @param selected - The active preset, or `null` for "any".
 * @returns The element, its pills, and the log of `onSelect` calls.
 */
function renderGroup(selected: '30d' | '7d' | 'year' | null = null) {
	const chosen: (string | null)[] = [];
	const control = createDatePresetGroup<'30d' | '7d' | 'year'>({
		anyLabel: 'Any time',
		groupLabel: 'Published',
		onSelect: (value) => {
			chosen.push(value);
		},
	});

	control.update({ presets: PRESETS, selected });

	return {
		chosen,
		control,
		element: control.element,
		pills: (): HTMLElement[] => Array.from<HTMLElement>(control.element.querySelectorAll('button')),
	};
}

describe('structure', () => {
	it('names the group for a screen reader without a visible heading', () => {
		const { element } = renderGroup();

		expect(element.getAttribute('role')).toBe('group');
		expect(element.getAttribute('aria-label')).toBe('Published');
	});

	it('puts the "any" escape FIRST, ahead of every preset', () => {
		// Order is the assertion. A group that renders "any" last still works and still reads
		// wrongly — the off switch turns up after the choices it undoes.
		const { pills } = renderGroup();

		expect(pills().map((pill) => pill.textContent)).toEqual(['Any time', 'Last 7 days', 'Last 30 days', 'This year']);
	});

	it('renders every preset as a real button', () => {
		// `<button>`, not a styled div — semantic HTML first, and it is what makes the
		// group keyboard-operable without a single line of key handling.
		const { pills } = renderGroup();

		expect(pills()).toHaveLength(PRESETS.length + 1);
		for (const pill of pills()) {
			expect(pill.getAttribute('type')).toBe('button');
		}
	});
});

describe('selection', () => {
	it('lights "any" on both channels when the filter is off', () => {
		const { pills } = renderGroup(null);
		const any = pills()[0];

		expect(any?.getAttribute('aria-pressed')).toBe('true');
		expect(any?.className).toContain('fe-chip--selected');
	});

	it('moves BOTH channels to the chosen preset, and clears "any"', () => {
		// Single-select stated as an invariant over the whole row rather than as one assertion:
		// exactly one pill is pressed, and it is the one whose value matches.
		const { pills } = renderGroup('30d');
		const pressed = pills().filter((pill) => pill.getAttribute('aria-pressed') === 'true');
		const styled = pills().filter((pill) => pill.className.includes('fe-chip--selected'));

		expect(pressed.map((pill) => pill.textContent)).toEqual(['Last 30 days']);
		expect(styled.map((pill) => pill.textContent)).toEqual(['Last 30 days']);
	});
});

describe('callbacks', () => {
	it('hands back null from "any" — the facet\'s only route to off', () => {
		// `null` rather than a sentinel string: the caller owns the rule, and it removes the rule
		// on null. A preset value here would apply a date window the user just asked to leave.
		const { chosen, pills } = renderGroup('7d');

		pills()[0]?.click();

		expect(chosen).toEqual([null]);
	});

	it('hands back the preset VALUE, not its label', () => {
		const { chosen, pills } = renderGroup();

		pills()[3]?.click();

		expect(chosen).toEqual(['year']);
	});
});

describe('repaint', () => {
	it('repaints the row in place rather than appending to it', () => {
		// An `append` here passes every assertion above — the first four pills are still correct —
		// and grows a new row on every repaint.
		const { control, pills } = renderGroup();

		expect(pills()).toHaveLength(4);

		control.update({ presets: PRESETS, selected: '7d' });
		control.update({ presets: PRESETS, selected: 'year' });

		expect(pills()).toHaveLength(4);
		expect(pills().filter((pill) => pill.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
	});

	it('drops a preset that is no longer offered, and the pill in its place fires ITS value', () => {
		// Keyed by value: a pill is only ever wired to the value it was built for, so clicking after a
		// repaint that removed presets reaches the right one.
		const { chosen, control, pills } = renderGroup();

		control.update({ presets: PRESETS.slice(0, 1), selected: null });
		pills()[1]?.click();

		expect(chosen).toEqual(['7d']);
	});

	it('keeps focus on the pressed pill through the repaint its click causes', () => {
		const { control, element, pills } = renderGroup();
		const sevenDays = pills()[1];

		document.body.replaceChildren(element);
		sevenDays?.focus();
		control.update({ presets: PRESETS, selected: '7d' });

		expect(pills()[1]).toBe(sevenDays);
		expect(document.activeElement).toBe(sevenDays);
		document.body.replaceChildren();
	});

	it('renders the "any" escape even with no presets at all', () => {
		// An empty preset list is reachable — a dataset whose date field is absent — and a group
		// that rendered nothing would leave a labelled, empty box on the panel.
		const { control, pills } = renderGroup();

		control.update({ presets: [], selected: null });

		expect(pills().map((pill) => pill.textContent)).toEqual(['Any time']);
	});
});
