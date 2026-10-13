/**
 * Tests for `<HierarchicalPicker>`, the flat tri-state tree picker.
 *
 * @remarks
 * The load-bearing test here is the first one. The predictive-disable BUNDLE uses a pre-flattened
 * `specs` array (`buildOriginNodeSpecs` for wine, `buildLocationNodeSpecs` for real estate), and those
 * specs are not render-ready: real estate's emits `{ leafIds, value }` with no `depth` and no `label`,
 * because a bundle candidate never needs either.
 *
 * Rows come from walking the tree instead, which decouples the two lists — so something has to keep
 * their orderings honest, since a reader looking at the panel cannot tell which list produced which. If the
 * rendered order ever diverges from the bundle's pre-order flatten, the picker's disabled states and
 * count badges would attach to the wrong rows: silently, plausibly, and only for trees deep enough to
 * notice.
 */

import type { PickerTreeNode } from '@filter-enginez/examples-shared/picker';

import { buildOriginNodeSpecs } from '@filter-enginez/examples-shared/wine-domain';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import HierarchicalPicker from './HierarchicalPicker.vue';

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
function baseProps(): InstanceType<typeof HierarchicalPicker>['$props'] {
	return {
		counts: new Map<string, number>(),
		disabled: new Set<string>(),
		groupLabel: 'Origin',
		selected: [],
		tree: TREE,
	};
}

/** Mount with the default props, overridden by `overrides`. */
function mountPicker(overrides: Record<string, unknown> = {}): ReturnType<typeof mount> {
	return mount(HierarchicalPicker, { props: { ...baseProps(), ...overrides }});
}

/** Expand every parent so the whole tree is on screen. */
async function expandAll(wrapper: ReturnType<typeof mount>): Promise<void> {
	// Re-queried each pass: expanding a branch inserts rows whose own disclosures did not exist yet.
	for (let pass = 0; pass < 3; pass += 1) {
		const collapsed = wrapper
			.findAll('.fe-tree__toggle')
			.filter((button) => button.attributes('aria-expanded') === 'false');

		for (const button of collapsed) {
			await button.trigger('click');
		}
		await flushPromises();
	}
}

describe('row derivation', () => {
	it('renders the same nodes, in the same pre-order, at the same depths as the bundle flattener', async () => {
		const wrapper = mountPicker();

		await expandAll(wrapper);

		const rendered = wrapper.findAll('.fe-tree__row').map((row) => ({
			// `depth * 0.875rem`, the inline indent — inverted back so the assertion is about DEPTH rather
			// than about a pixel value that could be restyled.
			depth: Math.round(
				parseFloat(/padding-left:\s*([\d.]+)rem/u.exec(row.attributes('style') ?? '')?.[1] ?? '0') / 0.875,
			),
			label: row.find('.fe-tree__label').text(),
		}));

		const expected = buildOriginNodeSpecs(TREE).map((spec) => ({ depth: spec.depth, label: spec.label }));

		expect(rendered).toEqual(expected);
	});

	it('never renders the root', () => {
		// The root is a container nobody selects. Rendering it would offer a single click that selects the
		// entire corpus — which is what "no filter" already means.
		expect(mountPicker().text()).not.toContain('All');
	});

	it('starts collapsed, showing only the top level', () => {
		expect(mountPicker().findAll('.fe-tree__label').map((el) => el.text())).toEqual(['Italy', 'France']);
	});

	it('reveals a branch on expand and hides it again on collapse', async () => {
		const wrapper = mountPicker();

		await wrapper.get('[aria-label="Expand Italy"]').trigger('click');
		expect(wrapper.text()).toContain('Piedmont');

		await wrapper.get('[aria-label="Collapse Italy"]').trigger('click');
		expect(wrapper.text()).not.toContain('Piedmont');
	});

	it('marks leaves so they reserve the disclosure column', () => {
		// Italy has children, France does not.
		expect(mountPicker().findAll('.fe-tree__row').map((row) => row.classes('fe-tree__row--leaf'))).toEqual([
			false,
			true,
		]);
	});
});

describe('selection', () => {
	it('hands back the whole next selection, not the clicked id', async () => {
		// One click can cascade a subtree or de-cascade an ancestor into its siblings, so "which id
		// changed" is not expressible — the compact model means the caller needs the whole array.
		const wrapper = mountPicker();

		await wrapper.get('[role="checkbox"]').trigger('click');

		expect(wrapper.emitted('change')).toEqual([[['IT']]]);
	});

	it('announces a partly-selected parent as mixed', async () => {
		const wrapper = mountPicker({ selected: ['IT-PIE']});

		await wrapper.get('[aria-label="Expand Italy"]').trigger('click');

		// `aria-checked="mixed"` is why these rows are buttons with `role="checkbox"` rather than toggle
		// buttons: `aria-pressed` has no mixed value, so a half-selected country would announce as fully
		// on or fully off.
		expect(wrapper.get('.fe-tree__control').attributes('aria-checked')).toBe('mixed');
	});

	it('marks a node checked through its ancestor', async () => {
		const wrapper = mountPicker({ selected: ['IT']});

		await wrapper.get('[aria-label="Expand Italy"]').trigger('click');

		const piedmont = wrapper
			.findAll('[role="checkbox"]')
			.find((button) => button.text().includes('Piedmont'));

		expect(piedmont?.attributes('aria-checked')).toBe('true');
	});
});

describe('predictive disable', () => {
	it('disables a node whose selection would empty the results', () => {
		const france = mountPicker({ disabled: new Set(['FR']) })
			.findAll('[role="checkbox"]')
			.find((button) => button.text().includes('France'));

		expect(france?.attributes('disabled')).toBeDefined();
	});

	it('leaves a checked node clickable even when it would be empty', () => {
		// The escape hatch. Without it a user who filtered themselves into a corner has no way out: the
		// only control that could widen the results is the one they cannot press.
		const france = mountPicker({ disabled: new Set(['FR']), selected: ['FR']})
			.findAll('[role="checkbox"]')
			.find((button) => button.text().includes('France'));

		expect(france?.attributes('disabled')).toBeUndefined();
	});

	it('renders no badge for a node the bundle has not answered for', () => {
		// Empty counts means the bundle has not settled. A placeholder number would be replaced moments
		// later by a different one, which reads as the UI correcting itself.
		expect(mountPicker().findAll('.fe-tree__count')).toHaveLength(0);
	});

	it('renders the projected count when the bundle has one', () => {
		const wrapper = mountPicker({ counts: new Map([['FR', 42]]) });

		expect(wrapper.findAll('.fe-tree__count').map((el) => el.text())).toEqual(['42']);
	});
});

describe('expansion state', () => {
	it('does not put expansion into the change stream', async () => {
		// Expansion is a view preference, not filter state — the distinction that keeps it out of the
		// shareable URL. A disclosure click that emitted `change` would round-trip into the engine.
		const wrapper = mountPicker();

		await wrapper.get('[aria-label="Expand Italy"]').trigger('click');

		expect(wrapper.emitted('change')).toBeUndefined();
	});
});
