/**
 * Tests for `<HierarchicalPicker />` — the recursive, exclusion-aware accordion-tree picker.
 *
 * @remarks
 * jsdom render via `createElement`. One 3-deep fixture (US → CA → {Napa, Sonoma}; US → OR →
 * Willamette) drives the whole matrix. Collapsed children stay in the DOM (rendered `hidden`, not
 * unmounted), so `getByText` resolves every node regardless of the parent's open state. Every row —
 * parent or leaf — is a `.fe-tree__row`, so `boxFor` locates a node's checkbox from its label.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HierarchicalPicker, type PickerTreeNode } from './HierarchicalPicker.js';

afterEach(cleanup);

/** Virtual root whose children are the top-level rows: US → CA → {Napa, Sonoma}; US → OR → Willamette. */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{
					children: [
						{ id: 'napa', label: 'Napa' },
						{ id: 'sonoma', label: 'Sonoma' },
					],
					id: 'ca',
					label: 'CA',
				},
				{
					children: [{ id: 'willamette', label: 'Willamette' }],
					id: 'or',
					label: 'OR',
				},
			],
			id: 'us',
			label: 'US',
		},
	],
	id: 'root',
	label: 'root',
};

/**
 * The selection control for the row carrying `label`.
 *
 * @remarks
 * A `<button role="checkbox">` spanning the whole row, not a native `<input>` — the row IS the hit
 * target. State is read from `aria-checked` rather than the `.checked` / `.indeterminate` DOM
 * properties a native input carried, which is also what a screen reader reads.
 *
 * @param label - The node's visible label.
 * @returns The row's control.
 */
function boxFor(label: string): HTMLButtonElement {
	const container = screen.getByText(label).closest('.fe-tree__row');

	return container?.querySelector<HTMLButtonElement>('.fe-tree__control') as HTMLButtonElement;
}

/**
 * The tri-state a row is announcing.
 *
 * @param label - The node's visible label.
 * @returns `'true' | 'false' | 'mixed'`.
 */
function stateFor(label: string): string | null {
	return boxFor(label).getAttribute('aria-checked');
}

/** Render the picker with the standard tree and the supplied prop overrides. */
function renderPicker(overrides: Record<string, unknown> = {}): ReturnType<typeof render> {
	return render(
		createElement(HierarchicalPicker, { onChange: vi.fn(), selected: [], tree: TREE, ...overrides }),
	);
}

describe('HierarchicalPicker', () => {
	it('is a group named by groupLabel, scrolling within maxHeight', () => {
		renderPicker({ groupLabel: 'Origin', maxHeight: '16rem' });

		const group = screen.getByRole('group', { name: 'Origin' });

		expect(group.className).toBe('fe-tree');
		expect(group.style.getPropertyValue('--fe-tree-max-height')).toBe('16rem');
	});

	it('leaves the height to the stylesheet when no maxHeight is given', () => {
		const { container } = renderPicker();

		expect(container.querySelector('.fe-tree')?.getAttribute('style')).toBeNull();
	});

	it('renders checked-via-own-id, indeterminate-via-descendant, and unchecked states', () => {
		renderPicker({ selected: ['napa']});

		// Napa: checked by its own id.
		expect(stateFor('Napa')).toBe('true');
		expect(screen.getByText('Napa').className).toContain('fe-tree__label--checked');
		// CA: mixed via a directly-selected child; US: mixed via a deeper descendant.
		expect(stateFor('CA')).toBe('mixed');
		expect(screen.getByText('CA').className).toContain('fe-tree__label--indeterminate');
		expect(stateFor('US')).toBe('mixed');
		// Sonoma: plain unchecked, no label modifier, no title on the control.
		expect(stateFor('Sonoma')).toBe('false');
		expect(screen.getByText('Sonoma').className).toBe('fe-tree__label');
		expect(boxFor('Sonoma').getAttribute('title')).toBeNull();
	});

	it('checks the entire subtree when an ancestor is selected', () => {
		renderPicker({ selected: ['us']});

		expect(stateFor('US')).toBe('true');
		expect(stateFor('CA')).toBe('true');
		expect(stateFor('Napa')).toBe('true');
		expect(stateFor('Willamette')).toBe('true');
		expect(screen.getByText('CA').className).toContain('fe-tree__label--checked');
	});

	it('deselects a node selected by its own id', () => {
		const onChange = vi.fn();

		renderPicker({ onChange, selected: ['napa']});
		fireEvent.click(boxFor('Napa'));

		expect(onChange).toHaveBeenCalledWith([]);
	});

	it('de-cascades a node checked via an ancestor, keeping the off-path siblings', () => {
		const onChange = vi.fn();

		renderPicker({ onChange, selected: ['us']});
		fireEvent.click(boxFor('Napa'));

		// Drop the 'us' ancestor; re-add OR (sibling of CA) and Sonoma (sibling of Napa).
		expect(onChange).toHaveBeenCalledWith(['or', 'sonoma']);
	});

	it('subsumes individually-selected descendants when a parent is selected', () => {
		const onChange = vi.fn();

		renderPicker({ onChange, selected: ['napa']});
		fireEvent.click(boxFor('CA'));

		// collectDescendantIds(CA) = {napa, sonoma}; drop napa, push ca.
		expect(onChange).toHaveBeenCalledWith(['ca']);
	});

	it('hard-disables a node whose selection would empty results and blocks its toggle', () => {
		const onChange = vi.fn();

		renderPicker({ disabledNodes: new Set(['sonoma']), onChange, selected: []});
		const sonoma = boxFor('Sonoma');

		expect(sonoma.disabled).toBe(true);
		expect(screen.getByText('Sonoma').className).toContain('fe-tree__label--disabled');
		// The explanation lives on the CONTROL now, not the label span — the control is the whole row,
		// so the tooltip covers the whole hoverable area rather than the text alone.
		expect(sonoma.getAttribute('title')).toBe('No matches for Sonoma given your other filters');
		expect(screen.getByText('Sonoma').closest('.fe-tree__row')?.className).toContain('fe-tree__row--disabled');

		// A disabled <button> swallows the click outright; the `isDisabled` guard in `handleToggle` is
		// belt-and-braces for the case where a caller renders the control enabled but passes a
		// disabled node.
		fireEvent.click(sonoma);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('never disables a node that is rendered checked', () => {
		renderPicker({ disabledNodes: new Set(['napa']), selected: ['napa']});

		expect(boxFor('Napa').disabled).toBe(false);
	});

	it('gives parents a disclosure toggle button and renders leaves as plain rows (no <details>)', () => {
		const { container } = renderPicker({ selected: []});

		// The native disclosure elements are gone — the accessible disclosure is a button.
		expect(container.querySelectorAll('details, summary')).toHaveLength(0);
		// US, CA, OR each have children → three toggle buttons; leaves have none.
		expect(container.querySelectorAll('.fe-tree__toggle')).toHaveLength(3);
		expect(screen.getByText('Napa').closest('.fe-tree__row')?.tagName.toLowerCase()).toBe('div');
		// The disclosure icon is a two-bar plus/minus, not a glyph — asserting on its STRUCTURE rather
		// than on text, since the whole point is that it animates between states instead of swapping
		// characters. The leaf's disclosure column is an empty spacer holding the alignment.
		const usToggle = screen.getByText('US').closest('.fe-tree__row')?.querySelector('.fe-tree__toggle');

		expect(usToggle?.querySelectorAll('.fe-tree__pm-bar')).toHaveLength(2);
		expect(usToggle?.querySelector('.fe-tree__pm-bar--pivot')).not.toBeNull();

		// A leaf reserves the disclosure column through `--leaf`'s `::before`, never through an element.
		// Both halves matter: the modifier must be present (drop it and leaf labels shift left out of
		// alignment with their siblings), and no chevron ELEMENT may appear (an empty
		// `<span class="fe-tree__chevron">` reads as a broken chevron to anyone inspecting a leaf
		// row). jsdom applies no stylesheet, so the class is the only assertable half of the pair.
		const napaRow = screen.getByText('Napa').closest('.fe-tree__row');

		expect(napaRow?.classList.contains('fe-tree__row--leaf')).toBe(true);
		expect(napaRow?.querySelector('.fe-tree__chevron')).toBeNull();
	});

	it('wraps every expandable node in a classed branch element', () => {
		// A wrapper holding a parent's row plus its children with no class is a plain block and applies
		// no gap between the two: sibling rows get their 2px while a parent and its first child sit
		// flush. No tuning of the container gaps can fix that — the difference is STRUCTURAL, so it would
		// survive a property-by-property comparison against the Svelte picker (which has one flat list,
		// where the container's gap reaches every row).
		//
		// jsdom applies no stylesheet, so the class is the assertable half: every branch must carry it,
		// and one must exist per expandable node.
		const { container } = renderPicker({ selected: []});
		const branches = container.querySelectorAll('.fe-tree__branch');

		expect(branches).toHaveLength(container.querySelectorAll('.fe-tree__toggle').length);
		for (const branch of branches) {
			expect(branch.querySelector(':scope > .fe-tree__row')).not.toBeNull();
			expect(branch.querySelector(':scope > .fe-tree__children')).not.toBeNull();
		}
	});

	it('gives the spacer modifier to leaves only', () => {
		// A parent wearing `--leaf` would reserve the column TWICE — once via the pseudo-element and once
		// via its real toggle button — and its label would sit a column further right than its siblings'.
		const { container } = renderPicker({ selected: []});

		for (const row of container.querySelectorAll('.fe-tree__row--leaf')) {
			expect(row.querySelector('.fe-tree__toggle')).toBeNull();
		}
		expect(screen.getByText('US').closest('.fe-tree__row')?.classList.contains('fe-tree__row--leaf')).toBe(false);
	});

	it('indents by nesting rather than by a per-depth inline margin', () => {
		// Rows are already nested in the DOM, so an inline `marginLeft: depth * 14` applied at each level
		// would compound on top of every ancestor's — depth 2 would render at 56px instead of 28px, and
		// the error would widen with depth. The indent is ONE constant step on `.fe-tree__children` in
		// `ui-styles`, which nesting accumulates correctly. Pinning the absence of inline margins is what stops the
		// per-depth version out: jsdom applies no stylesheet, so the step itself is not assertable here,
		// but an inline margin is.
		const { container } = renderPicker({ selected: []});

		for (const element of container.querySelectorAll<HTMLElement>('*')) {
			expect(element.style.marginLeft).toBe('');
		}
	});

	it('flips the plus to a minus by class, and back', () => {
		// The icon has no text to assert on, so the open state is carried by a modifier class. That is
		// also what the CSS rotation hangs off, so this pins the contract between the two.
		const { container } = renderPicker({ selected: []});
		const usToggle = screen.getByText('US').closest('.fe-tree__row')?.querySelector('.fe-tree__toggle');

		expect(usToggle?.querySelector('.fe-tree__pm--open')).toBeNull();

		fireEvent.click(usToggle as Element);

		expect(usToggle?.querySelector('.fe-tree__pm--open')).not.toBeNull();
		expect(usToggle?.getAttribute('aria-expanded')).toBe('true');

		fireEvent.click(usToggle as Element);

		expect(usToggle?.querySelector('.fe-tree__pm--open')).toBeNull();
		expect(container.querySelectorAll('.fe-tree__toggle')).toHaveLength(3);
	});

	it('renders NO badge when the caller supplies no counts', () => {
		// The count is engine-derived, so before the first predictive-disable bundle settles there is
		// no honest number to show. Rendering a placeholder — or a count of the node's leaf
		// descendants — puts a number on screen that does not match the results the click produces.
		renderPicker({ selected: []});

		expect(screen.getByText('US').closest('.fe-tree__row')?.querySelector('.fe-tree__count')).toBeNull();
	});

	it('renders the caller-supplied projected count, per node', () => {
		renderPicker({ nodeCounts: new Map([['us', 42], ['napa', 7]]), selected: []});

		expect(screen.getByText('US').closest('.fe-tree__row')?.querySelector('.fe-tree__count')?.textContent).toBe('42');
		expect(screen.getByText('Napa').closest('.fe-tree__row')?.querySelector('.fe-tree__count')?.textContent).toBe('7');
		// A node the map does not mention renders no badge rather than a zero.
		expect(screen.getByText('Sonoma').closest('.fe-tree__row')?.querySelector('.fe-tree__count')).toBeNull();
	});

	it('toggles a parent open/closed via its disclosure button (children hidden while collapsed)', () => {
		renderPicker({ selected: []});
		const toggle = screen.getByText('US').closest('.fe-tree__row')?.querySelector('.fe-tree__toggle') as HTMLButtonElement;
		// The children container is the row's next sibling within the parent's wrapper.
		const childrenBox = toggle.closest('.fe-tree__row')?.nextElementSibling as HTMLElement;

		// Collapsed by default.
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.getAttribute('aria-label')).toBe('Expand US');
		expect(childrenBox.hidden).toBe(true);

		fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.getAttribute('aria-label')).toBe('Collapse US');
		expect(childrenBox.hidden).toBe(false);

		// Toggle back closed.
		fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(childrenBox.hidden).toBe(true);
	});

	it('renders nothing when the root has no children', () => {
		const { container } = render(
			createElement(HierarchicalPicker, { onChange: vi.fn(), selected: [], tree: { id: 'root', label: 'root' }}),
		);

		expect(container.querySelector('.fe-tree')?.children).toHaveLength(0);
	});

	it('announces the mixed state through aria-checked, and unmounts cleanly', () => {
		// The button carries `aria-checked="mixed"` declaratively — no native `indeterminate` DOM
		// property set through a ref (React has no prop for it), so there is no null-on-unmount arm.
		const { unmount } = renderPicker({ selected: ['napa']});

		expect(stateFor('CA')).toBe('mixed');
		expect(() => unmount()).not.toThrow();
	});

	it('renders a mark ONLY when checked or mixed', () => {
		// An always-present empty box reads as a control switched off; absence reads as "not chosen".
		renderPicker({ selected: ['napa']});

		expect(boxFor('Napa').querySelector('.fe-tree__mark')?.textContent).toBe('✓');
		expect(boxFor('CA').querySelector('.fe-tree__mark')?.textContent).toBe('–');
		expect(boxFor('Sonoma').querySelector('.fe-tree__mark')?.textContent).toBe('');
	});

	it('makes the WHOLE ROW the control, not just a checkbox', () => {
		// The reported discrepancy: a wide row looked interactive along its full width and responded
		// on a 13px sliver. Asserting there is no native input left is what keeps it from coming back.
		const { container } = renderPicker({ selected: []});

		expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
		expect(boxFor('Napa').querySelector('.fe-tree__label')?.textContent).toBe('Napa');
		expect(boxFor('Napa').querySelector('.fe-tree__label')?.textContent).toBe('Napa');
	});
});
