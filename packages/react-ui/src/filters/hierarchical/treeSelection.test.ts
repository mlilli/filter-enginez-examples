/**
 * Tests for the hierarchical picker's selection semantics.
 *
 * @remarks
 * This module is the ONLY implementation of tri-state tree selection in the repo — the React
 * picker and the Svelte wine origin picker both route through it. So a defect here is a defect in
 * two verticals at once, and neither vertical's own tests would localize it.
 *
 * The cases that carry the weight are the ones about ANCESTRY, because the selection model is
 * compact: `selected` stores the highest selected node per branch, never the descendant closure. A
 * naive implementation passes every "is this id in the array" test and still gets every one of these
 * wrong.
 */

import { describe, expect, it } from 'vitest';

import type { PickerTreeNode } from './pickerTree.js';

import {
	ariaCheckedFor,
	collectDescendantIds,
	hasChildren,
	hasSelectedDescendant,
	indexTree,
	isRowVisible,
	resolveNodeState,
	toggleNodeSelection,
} from './treeSelection.js';

/**
 * A two-level origin tree: world → two countries → two regions each.
 */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'bordeaux', label: 'Bordeaux' },
				{ id: 'burgundy', label: 'Burgundy' },
			],
			id: 'france',
			label: 'France',
		},
		{
			children: [
				{ id: 'piedmont', label: 'Piedmont' },
				{ id: 'tuscany', label: 'Tuscany' },
			],
			id: 'italy',
			label: 'Italy',
		},
		// Three levels deep, and ONLY here. The two-level branches above cannot distinguish "check
		// every ancestor" from "check the immediate parent" — for them the intermediate ancestor IS the
		// parent. A mutation that looked only at the parent survived the whole suite until this
		// existed.
		{
			children: [
				{
					children: [{ id: 'alavesa', label: 'Alavesa' }],
					id: 'rioja',
					label: 'Rioja',
				},
			],
			id: 'spain',
			label: 'Spain',
		},
	],
	id: 'world',
	label: 'World',
};

const INDEX = indexTree(TREE);

/**
 * Resolve a node's state by id, using the indexed ancestry.
 *
 * @param id - The node id.
 * @param selected - The current selection.
 * @returns The tri-state.
 */
function stateOf(id: string, selected: readonly string[]): string {
	const entry = INDEX.get(id);

	if (entry === undefined) {
		throw new Error(`no such node: ${id}`);
	}

	return resolveNodeState(entry.node, entry.ancestorPath, new Set(selected));
}

/**
 * Apply a click to a node by id.
 *
 * @param id - The node clicked.
 * @param selected - The current selection.
 * @returns The next selection, sorted for stable comparison.
 */
function clickOn(id: string, selected: readonly string[]): readonly string[] {
	const entry = INDEX.get(id);

	if (entry === undefined) {
		throw new Error(`no such node: ${id}`);
	}

	return [...toggleNodeSelection(entry.node, entry.ancestorPath, selected)].sort();
}

describe('indexTree', () => {
	it('indexes every node, root included, with root-first ancestry', () => {
		expect([...INDEX.keys()].sort()).toEqual(
			['alavesa', 'bordeaux', 'burgundy', 'france', 'italy', 'piedmont', 'rioja', 'spain', 'tuscany', 'world'],
		);
		expect(INDEX.get('world')?.ancestorPath).toEqual([]);
		expect(INDEX.get('bordeaux')?.ancestorPath.map((node) => node.id)).toEqual(['world', 'france']);
	});
});

describe('resolveNodeState', () => {
	it('reports a node checked via its own id', () => {
		expect(stateOf('france', ['france'])).toBe('checked');
	});

	it('reports a DESCENDANT checked when an ancestor is selected', () => {
		// The compact model's defining behavior. `bordeaux` is not in the array, and must still render
		// checked — this is the case a flat "selected.includes(id)" toggle gets wrong: it would show
		// every French region as unselected after clicking France.
		expect(stateOf('bordeaux', ['france'])).toBe('checked');
	});

	it('reports a parent MIXED when only some children are selected', () => {
		expect(stateOf('france', ['bordeaux'])).toBe('mixed');
	});

	it('does not leak mixed ACROSS branches', () => {
		// Selecting inside France must not make Italy look partially selected.
		expect(stateOf('italy', ['bordeaux'])).toBe('unchecked');
	});

	it('propagates mixed up more than one level', () => {
		expect(stateOf('world', ['bordeaux'])).toBe('mixed');
	});

	it('never reports a leaf as mixed', () => {
		// A leaf has nothing below it to be partly selected. Reporting `mixed` here would render a
		// half-state for a node with no halves.
		expect(stateOf('bordeaux', [])).toBe('unchecked');
		expect(stateOf('bordeaux', ['burgundy'])).toBe('unchecked');
	});
});

describe('toggleNodeSelection', () => {
	it('selects an unchecked node', () => {
		expect(clickOn('france', [])).toEqual(['france']);
	});

	it('deselects a node selected by its own id', () => {
		expect(clickOn('france', ['france'])).toEqual([]);
	});

	it('SUBSUMES individually-selected descendants when the parent is clicked', () => {
		// Keeps the compact model compact. Without this the array grows to
		// ['bordeaux', 'burgundy', 'france'] and the URL carries redundant state forever.
		expect(clickOn('france', ['bordeaux', 'burgundy'])).toEqual(['france']);
	});

	it('DE-CASCADES when unchecking a node included only via an ancestor', () => {
		// The case people forget. Clicking Bordeaux while France is selected must keep the rest of
		// France selected — dropping France entirely would silently discard Burgundy too, and doing
		// nothing would leave a checked row that refuses to uncheck.
		expect(clickOn('bordeaux', ['france'])).toEqual(['burgundy']);
	});

	it('leaves the de-cascaded ancestor rendering mixed', () => {
		const next = clickOn('bordeaux', ['france']);

		expect(stateOf('france', next)).toBe('mixed');
		expect(stateOf('bordeaux', next)).toBe('unchecked');
		expect(stateOf('burgundy', next)).toBe('checked');
	});

	it('de-cascades across TWO levels, preserving EVERY untouched branch', () => {
		// Selecting the root then unchecking one region must keep Burgundy selected and leave the other
		// countries whole — including Spain, which the click never went near. Listing all of them is the
		// point: a de-cascade that dropped a sibling would still satisfy an assertion naming only one.
		expect(clickOn('bordeaux', ['world'])).toEqual(['burgundy', 'italy', 'spain']);
	});

	it('never mutates the input array', () => {
		const selected = ['france'];
		const entry = INDEX.get('bordeaux');

		expect(entry).toBeDefined();
		toggleNodeSelection(entry?.node ?? TREE, entry?.ancestorPath ?? [], selected);

		expect(selected).toEqual(['france']);
	});
});

describe('collectDescendantIds / hasSelectedDescendant', () => {
	it('collects descendants without the node itself', () => {
		const france = TREE.children?.[0] ?? TREE;

		expect([...collectDescendantIds(france)].sort()).toEqual(['bordeaux', 'burgundy']);
	});

	it('returns an empty set for a leaf', () => {
		expect(collectDescendantIds({ id: 'leaf', label: 'Leaf' }).size).toBe(0);
	});

	it('finds a selected descendant at any depth', () => {
		expect(hasSelectedDescendant(TREE, new Set(['tuscany']))).toBe(true);
		expect(hasSelectedDescendant(TREE, new Set(['nowhere']))).toBe(false);
	});
});

describe('ariaCheckedFor', () => {
	it.each([
		['checked', 'true'],
		['mixed', 'mixed'],
		['unchecked', 'false'],
	] as const)('maps %s to %s', (state, expected) => {
		expect(ariaCheckedFor(state)).toBe(expected);
	});

	it('emits the literal "mixed", which aria-pressed cannot express', () => {
		// The reason the picker rows use role="checkbox" rather than a toggle button: `aria-pressed`
		// accepts only true/false, so a partly-selected node would have to announce as fully on or
		// fully off. This assertion is the contract that keeps someone from "simplifying" it back.
		expect(ariaCheckedFor('mixed')).toBe('mixed');
	});
});

describe('isRowVisible', () => {
	/**
	 * Visibility of a node by id, given the open set.
	 *
	 * @param id - The node id.
	 * @param expanded - Ids whose children are shown.
	 * @returns Whether the row renders.
	 */
	function visible(id: string, expanded: readonly string[]): boolean {
		const entry = INDEX.get(id);

		if (entry === undefined) {
			throw new Error(`no such node: ${id}`);
		}

		return isRowVisible(entry.ancestorPath, new Set(expanded), TREE.id);
	}

	it('shows top-level nodes with nothing expanded', () => {
		// The collapsed default. Countries are visible; their regions are not.
		expect(visible('france', [])).toBe(true);
		expect(visible('bordeaux', [])).toBe(false);
	});

	it('shows children once the parent is expanded', () => {
		expect(visible('bordeaux', ['france'])).toBe(true);
	});

	it('keeps a node hidden when an INTERMEDIATE ancestor is collapsed', () => {
		// Expanding the immediate parent is NOT enough if a grandparent is still closed — otherwise a
		// sub-region renders floating under a country the user never opened.
		//
		// This needs the three-level branch. Checking only `expanded.has(parent.id)` gets every
		// two-level case right, so a mutation doing exactly that survived until this assertion existed.
		expect(visible('alavesa', ['rioja'])).toBe(false);
		expect(visible('alavesa', ['spain', 'rioja'])).toBe(true);
	});

	it('never requires the ROOT to be expanded', () => {
		// The root is a container nothing renders. Requiring it would leave the whole tree blank until
		// the user expanded something they cannot see.
		expect(visible('france', [])).toBe(true);
	});

	it('does not reveal a sibling branch', () => {
		expect(visible('tuscany', ['france'])).toBe(false);
	});

	it('is independent of SELECTION', () => {
		// The defining property: expanding must not select, and selecting must not
		// expand. `isRowVisible` takes no selection argument at all, which is how that is enforced
		// rather than merely intended.
		expect(visible('bordeaux', [])).toBe(false);
		expect(visible('bordeaux', ['france'])).toBe(true);
	});
});

describe('hasChildren', () => {
	it('distinguishes parents from leaves', () => {
		// Drives whether a row gets a disclosure control or an alignment spacer.
		expect(hasChildren(TREE)).toBe(true);
		expect(hasChildren({ id: 'leaf', label: 'Leaf' })).toBe(false);
		expect(hasChildren({ children: [], id: 'empty', label: 'Empty' })).toBe(false);
	});
});
