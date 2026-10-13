/**
 * Tests for `<HierarchicalPicker>`, the flat tri-state tree picker.
 *
 * @remarks
 * The load-bearing test here is the first one. The predictive-disable BUNDLE has its own
 * pre-flattened candidate list (`buildOriginNodeSpecs`, `buildLocationNodeSpecs`), and real estate's
 * emits `{ leafIds, value }` with no `depth` and no `label`, because a bundle candidate never needs
 * either — so the picker cannot render from it.
 *
 * Rows come from walking the tree instead, which decouples them — so something has to keep the two
 * orderings honest, since a reader looking at the panel cannot tell which list produced which. If the
 * rendered order ever diverges from the bundle's pre-order flatten, the picker's disabled states and
 * count badges would attach to the wrong rows: silently, plausibly, and only for trees deep enough to
 * notice.
 */

import type { PickerTreeNode } from '@filter-enginez/examples-shared/picker';
import type { ComponentProps } from 'svelte';

import { buildOriginNodeSpecs } from '@filter-enginez/examples-shared/wine-domain';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HierarchicalPicker from './HierarchicalPicker.svelte';

/** The component's own prop shape, so a renamed or retyped prop fails here rather than at runtime. */
type PickerProps = ComponentProps<typeof HierarchicalPicker>;

// Not automatic in this app's vitest setup — without it each render stacks another copy in the same
// document, and a `getByRole` that should match one control finds every previous test's too.
afterEach(cleanup);

/** Three levels, uneven branching, so depth and pre-order are both distinguishable. */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'IT-PIE', label: 'Piedmont' },
				{
					children: [{ id: 'IT-VEN-VAL', label: 'Valpolicella' }],
					id: 'IT-VEN',
					label: 'Veneto',
				},
			],
			id: 'IT',
			label: 'Italy',
		},
		{ id: 'FR', label: 'France' },
	],
	id: 'root',
	label: 'All',
};

/** Default props; each test overrides only what it is about. */
function baseProps(): PickerProps {
	return {
		ariaLabel: 'Origin',
		counts: new Map<string, number>(),
		disabled: new Set<string>(),
		onChange: (): void => undefined,
		selected: [],
		tree: TREE,
	};
}

/** Expand every parent so the whole tree is on screen. */
async function expandAll(container: HTMLElement): Promise<void> {
	// Re-queried each pass: expanding a branch inserts rows whose own disclosures did not exist yet.
	for (let pass = 0; pass < 3; pass += 1) {
		const collapsed = [...container.querySelectorAll('.fe-tree__toggle')].filter(
			(button) => button.getAttribute('aria-expanded') === 'false',
		);

		for (const button of collapsed) {
			await fireEvent.click(button);
		}
	}
}

describe('row derivation', () => {
	it('renders the same nodes, in the same pre-order, at the same depths as the bundle flattener', async () => {
		const { container } = render(HierarchicalPicker, { props: baseProps() });

		await expandAll(container);

		const rows = [...container.querySelectorAll('.fe-tree__row')];
		const rendered = rows.map((row) => ({
			// `depth * 0.875rem`, the inline indent — inverted back so the assertion is about DEPTH
			// rather than about a pixel value that could be restyled.
			depth: Math.round((parseFloat(/padding-left:\s*([\d.]+)rem/u.exec(row.getAttribute('style') ?? '')?.[1] ?? '0') / 0.875)),
			label: row.querySelector('.fe-tree__label')?.textContent ?? '',
		}));

		const expected = buildOriginNodeSpecs(TREE).map((spec) => ({ depth: spec.depth, label: spec.label }));

		expect(rendered).toEqual(expected);
	});

	it('never renders the root', () => {
		// The root is a container nobody selects. Rendering it would offer a single click that selects
		// the entire corpus — which is what "no filter" already means.
		const { container } = render(HierarchicalPicker, { props: baseProps() });

		expect(container.textContent).not.toContain('All');
	});

	it('starts collapsed, showing only the top level', () => {
		const { container } = render(HierarchicalPicker, { props: baseProps() });

		expect([...container.querySelectorAll('.fe-tree__label')].map((el) => el.textContent)).toEqual([
			'Italy',
			'France',
		]);
	});

	it('reveals a branch on expand and hides it again on collapse', async () => {
		const { container, getByLabelText } = render(HierarchicalPicker, { props: baseProps() });

		await fireEvent.click(getByLabelText('Expand Italy'));
		expect(container.textContent).toContain('Piedmont');

		await fireEvent.click(getByLabelText('Collapse Italy'));
		expect(container.textContent).not.toContain('Piedmont');
	});

	it('marks leaves so they reserve the disclosure column', () => {
		const { container } = render(HierarchicalPicker, { props: baseProps() });
		const rows = [...container.querySelectorAll('.fe-tree__row')];

		// Italy has children, France does not.
		expect(rows.map((row) => row.classList.contains('fe-tree__row--leaf'))).toEqual([false, true]);
	});
});

describe('selection', () => {
	it('hands back the whole next selection, not the clicked id', async () => {
		// One click can cascade a subtree or de-cascade an ancestor into its siblings, so "which id
		// changed" is not expressible — the compact model means the caller needs the whole array.
		const onChange = vi.fn();
		const { getByRole } = render(HierarchicalPicker, { props: { ...baseProps(), onChange }});

		await fireEvent.click(getByRole('checkbox', { name: /Italy/u }));

		expect(onChange).toHaveBeenCalledWith(['IT']);
	});

	it('announces a partly-selected parent as mixed', async () => {
		const { container, getByLabelText } = render(HierarchicalPicker, {
			props: { ...baseProps(), selected: ['IT-PIE']},
		});

		await fireEvent.click(getByLabelText('Expand Italy'));

		// `aria-checked="mixed"` is why these rows are buttons with `role="checkbox"` rather than
		// toggle buttons: `aria-pressed` has no mixed value, so a half-selected country would announce
		// as fully on or fully off.
		const italy = container.querySelector('.fe-tree__control');

		expect(italy?.getAttribute('aria-checked')).toBe('mixed');
	});

	it('marks a node checked through its ancestor', async () => {
		const { getByLabelText, getByRole } = render(HierarchicalPicker, {
			props: { ...baseProps(), selected: ['IT']},
		});

		await fireEvent.click(getByLabelText('Expand Italy'));

		expect(getByRole('checkbox', { name: /Piedmont/u }).getAttribute('aria-checked')).toBe('true');
	});
});

describe('predictive disable', () => {
	it('disables a node whose selection would empty the results', () => {
		const { getByRole } = render(HierarchicalPicker, {
			props: { ...baseProps(), disabled: new Set(['FR']) },
		});

		expect(getByRole('checkbox', { name: /France/u }).hasAttribute('disabled')).toBe(true);
	});

	it('leaves a checked node clickable even when it would be empty', () => {
		// The escape hatch. Without it a user who filtered themselves into a corner has no way out:
		// the only control that could widen the results is the one they cannot press.
		const { getByRole } = render(HierarchicalPicker, {
			props: { ...baseProps(), disabled: new Set(['FR']), selected: ['FR']},
		});

		expect(getByRole('checkbox', { name: /France/u }).hasAttribute('disabled')).toBe(false);
	});

	it('renders no badge for a node the bundle has not answered for', () => {
		// Empty counts means the bundle has not settled. A placeholder number would be replaced moments
		// later by a different one, which reads as the UI correcting itself.
		const { container } = render(HierarchicalPicker, { props: baseProps() });

		expect(container.querySelectorAll('.fe-tree__count')).toHaveLength(0);
	});

	it('renders the projected count when the bundle has one', () => {
		const { container } = render(HierarchicalPicker, {
			props: { ...baseProps(), counts: new Map([['FR', 42]]) },
		});

		expect([...container.querySelectorAll('.fe-tree__count')].map((el) => el.textContent)).toEqual(['42']);
	});
});
