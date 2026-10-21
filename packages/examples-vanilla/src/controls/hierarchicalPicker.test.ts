/**
 * Tests for the framework-less hierarchical picker.
 *
 * @remarks
 * The picker is the one control in this app with real logic rather than markup, and every bit of that
 * logic is BORROWED — `indexTree`, `resolveNodeState`, `toggleNodeSelection`, `isRowVisible` and
 * `ariaCheckedFor` all come from `@filter-enginez/examples-shared/picker`, shared with the four other
 * verticals that render this control. So these tests are not really about the algorithm; they are
 * about whether this vertical is calling into it correctly, which is the only way it can drift.
 *
 * Three of them exist because the thing they cover fails SILENTLY:
 *
 *   - **Pre-order.** A flat rendering of a hierarchy is only readable if a parent precedes its
 *     descendants. `indexTree` inserts as it walks, so `Map` order IS pre-order — but nothing enforces
 *     that this module preserves it, and a wrong order still renders every row.
 *   - **`aria-checked="mixed"`.** A half-selected parent that announces `false` looks identical on
 *     screen. This is exactly why the control is `role="checkbox"` and not a toggle button:
 *     `aria-pressed` has no mixed value.
 *   - **A checked row stays enabled.** Disabling a selected row is how a user filters themselves into
 *     a corner with no way back out, and it looks like correct predictive-disable while doing it.
 */

import type { PickerTreeNode } from '@filter-enginez/examples-shared/picker';

import { beforeEach, describe, expect, it } from 'vitest';

import { createHierarchicalPicker, type HierarchicalPickerState } from './hierarchicalPicker.js';

/** Three levels, uneven branching, so depth and pre-order are both distinguishable. */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'IT-PIE', label: 'Piedmont' },
				{ children: [{ id: 'IT-VEN-VAL', label: 'Valpolicella' }], id: 'IT-VEN', label: 'Veneto' },
			],
			id: 'IT',
			label: 'Italy',
		},
		{ id: 'FR', label: 'France' },
	],
	id: 'root',
	label: 'All',
};

/** The indent step the picker applies per level; inverted in the depth assertion. */
const INDENT_REM_PER_LEVEL = 0.875;

/** A neutral state, overridable per test. */
function stateOf(overrides: Partial<HierarchicalPickerState> = {}): HierarchicalPickerState {
	return {
		counts: new Map<string, number>(),
		disabled: new Set<string>(),
		selected: [],
		tree: TREE,
		...overrides,
	};
}

describe('createHierarchicalPicker', () => {
	let emissions: (readonly string[])[] = [];

	beforeEach(() => {
		emissions = [];
	});

	/** Build a picker that records what it emits. */
	function mount(): ReturnType<typeof createHierarchicalPicker> {
		return createHierarchicalPicker({
			groupLabel: 'Origin',
			onChange: (next) => {
				emissions.push(next);
			},
		});
	}

	/** Every rendered row label, in document order. */
	function labels(element: HTMLElement): string[] {
		return [...element.querySelectorAll('.fe-tree__label')].map((node) => node.textContent.trim());
	}

	it('renders only the top level until a branch is opened', () => {
		// Collapsed by default: a ~700-node tree rendered fully expanded opens on a wall of sub-regions
		// with most top-level nodes too far down to find.
		const picker = mount();

		picker.update(stateOf());

		expect(labels(picker.element)).toEqual(['Italy', 'France']);
	});

	it('reveals a branch in pre-order when its disclosure is clicked', () => {
		const picker = mount();

		picker.update(stateOf());
		picker.element.querySelector<HTMLButtonElement>('[aria-label="Expand Italy"]')?.click();

		// Italy's children sit between Italy and its sibling — the parent precedes its descendants.
		expect(labels(picker.element)).toEqual(['Italy', 'Piedmont', 'Veneto', 'France']);
	});

	it('indents each level by the shared step', () => {
		const picker = mount();

		picker.update(stateOf());
		picker.element.querySelector<HTMLButtonElement>('[aria-label="Expand Italy"]')?.click();

		const rows = [...picker.element.querySelectorAll<HTMLElement>('.fe-tree__row')];

		expect(rows[0]?.style.paddingLeft).toBe('0rem');
		expect(rows[1]?.style.paddingLeft).toBe(`${INDENT_REM_PER_LEVEL}rem`);
	});

	it('announces a half-selected parent as mixed', () => {
		// The reason the control is role="checkbox": aria-pressed has no mixed value, so a toggle button
		// would announce a partially-selected country as fully on or fully off.
		const picker = mount();

		picker.update(stateOf({ selected: ['IT-PIE']}));

		const italy = picker.element.querySelector<HTMLElement>('[role="checkbox"]');

		expect(italy?.getAttribute('aria-checked')).toBe('mixed');
	});

	it('emits the WHOLE next selection, not the clicked id', () => {
		// One click can cascade a subtree or de-cascade an ancestor, so there is no single toggled id to
		// report — and a caller that assumed otherwise would drop the cascade on the floor.
		const picker = mount();

		picker.update(stateOf());
		picker.element.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[0]?.click();

		expect(emissions).toHaveLength(1);
		expect(emissions[0]).toEqual(['IT']);
	});

	it('disables a row the bundle rules out, but never a selected one', () => {
		const picker = mount();

		picker.update(stateOf({ disabled: new Set(['IT', 'FR']), selected: ['IT']}));

		const controls = [...picker.element.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];

		// Italy is selected, so it stays clickable — otherwise there is no way to undo it.
		expect(controls[0]?.disabled).toBe(false);
		expect(controls[1]?.disabled).toBe(true);
	});

	it('renders a projected-record count only where the bundle supplied one', () => {
		const picker = mount();

		picker.update(stateOf({ counts: new Map([['IT', 42]]) }));

		const counts = [...picker.element.querySelectorAll('.fe-tree__count')];

		expect(counts).toHaveLength(1);
		expect(counts[0]?.textContent).toBe('42');
	});

	it('keeps expansion across an update, because it is view state and not filter state', () => {
		// A bundle settling must not collapse a branch the user opened. Expansion deliberately lives in
		// the control rather than the engine — in the engine it would end up in the shareable URL.
		const picker = mount();

		picker.update(stateOf());
		picker.element.querySelector<HTMLButtonElement>('[aria-label="Expand Italy"]')?.click();
		picker.update(stateOf({ counts: new Map([['IT', 7]]) }));

		expect(labels(picker.element)).toEqual(['Italy', 'Piedmont', 'Veneto', 'France']);
	});

	it('COLLAPSES a branch on the second click, rather than only ever opening', () => {
		// The disclosure is a toggle built on `expanded.delete(id) || expanded.add(id)`, and every
		// case above only ever opens — so a control that could not close would have passed all of
		// them, on a tree whose whole reason for collapsing is that it is ~700 nodes deep.
		const picker = mount();

		picker.update(stateOf());
		picker.element.querySelector<HTMLButtonElement>('[aria-label="Expand Italy"]')?.click();

		expect(labels(picker.element)).toEqual(['Italy', 'Piedmont', 'Veneto', 'France']);

		// Same button, relabelled — the other half of the state being announced.
		picker.element.querySelector<HTMLButtonElement>('[aria-label="Collapse Italy"]')?.click();

		expect(labels(picker.element)).toEqual(['Italy', 'France']);
	});

	it('keeps keyboard focus on the disclosure that opened a branch, and on a row through an update', () => {
		const picker = mount();

		document.body.replaceChildren(picker.element);
		picker.update(stateOf());

		const disclosure = picker.element.querySelector<HTMLButtonElement>('[aria-label="Expand Italy"]');

		disclosure?.focus();
		disclosure?.click();

		expect(document.activeElement).toBe(disclosure);
		expect(disclosure?.getAttribute('aria-expanded')).toBe('true');
		expect(disclosure?.querySelector('.fe-tree__pm')?.className).toBe('fe-tree__pm fe-tree__pm--open');

		const piedmont = picker.element.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[1];

		piedmont?.focus();
		picker.update(stateOf({ counts: new Map([['IT-PIE', 3]]), selected: ['IT-PIE']}));

		expect(document.activeElement).toBe(piedmont);
		expect(piedmont?.getAttribute('aria-checked')).toBe('true');
		expect(piedmont?.querySelector('.fe-tree__count')?.textContent).toBe('3');
		document.body.replaceChildren();
	});

	it('toggles from the LATEST selection, not the one the row was first drawn under', () => {
		const picker = mount();

		picker.update(stateOf());

		const france = picker.element.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[1];

		picker.update(stateOf({ selected: ['IT']}));
		france?.click();

		expect(emissions.at(-1)).toEqual(['IT', 'FR']);
	});

	it('drops a count and a dead-end title once the bundle stops supplying them', () => {
		const picker = mount();

		picker.update(stateOf({ counts: new Map([['FR', 5]]), disabled: new Set(['FR']) }));

		const france = picker.element.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[1];

		expect(france?.getAttribute('title')).toBe('No matches for France given your other filters');

		picker.update(stateOf());

		expect(france?.hasAttribute('title')).toBe(false);
		expect(france?.querySelector('.fe-tree__count')).toBeNull();
	});

	it('rebuilds its rows for a different tree', () => {
		const picker = mount();

		picker.update(stateOf());
		picker.update(stateOf({ tree: { children: [{ id: 'ES', label: 'Spain' }], id: 'root2', label: 'All' }}));

		expect(labels(picker.element)).toEqual(['Spain']);
	});
});
