/**
 * `treeSelection` — the hierarchical picker's SELECTION SEMANTICS, in a React-free module.
 *
 * @remarks
 * Extracted from `HierarchicalPicker.tsx` so the rules that govern a tri-state tree can be shared by
 * every vertical rather than reimplemented per framework. The React picker rendered checkboxes with a
 * correct cascade; the Svelte picker rendered nicer toggle rows carrying result counts but treated
 * every node as an independent flat toggle — clicking a parent selected only the parent, and a
 * partly-selected parent was indistinguishable from an unselected one. Both halves were worth
 * keeping, and neither is about rendering, so the logic lives here and the components own the markup.
 *
 * ### The compact selection model
 *
 * `selected` stores the HIGHEST selected node on each branch, never the full descendant closure. So
 * selecting "France" yields `['france']`, not `['france', 'bordeaux', 'burgundy', …]`. That keeps
 * shareable URLs short and survives a corpus that grows new leaves under an already-selected parent.
 * The cost is that "is this node selected?" is a question about the node's ANCESTORS, not a set
 * lookup — which is what {@link resolveNodeState} exists to answer.
 *
 * ### Three states, and why the third is not optional
 *
 * A node is `checked` (itself or an ancestor is selected), `mixed` (not checked, but something below
 * it is), or `unchecked`. Without `mixed`, a parent with three of its five children selected renders
 * identically to one with none — the tree actively lies about what is filtering. That is the state
 * React expressed via the native checkbox `indeterminate` flag.
 *
 * ### Accessibility note for non-checkbox renderings
 *
 * A row styled as a toggle BUTTON cannot carry this contract: `aria-pressed` has no mixed value. Such
 * a row must use `role="checkbox"` with `aria-checked="true" | "false" | "mixed"`, which is exactly
 * what {@link ariaCheckedFor} returns. Getting this wrong silently degrades the tree to two states
 * for screen-reader users while looking correct on screen.
 *
 * @packageDocumentation
 */

import type { PickerTreeNode } from './pickerTree.js';

/** How a node should render, given the current selection. */
export type NodeSelectionState = 'checked' | 'mixed' | 'unchecked';

/**
 * Every descendant id of `node`, excluding `node` itself.
 *
 * @param node - The subtree root.
 * @returns The descendant ids.
 */
export function collectDescendantIds(node: PickerTreeNode): ReadonlySet<string> {
	const out = new Set<string>();
	const walk = (current: PickerTreeNode): void => {
		for (const child of current.children ?? []) {
			out.add(child.id);
			walk(child);
		}
	};

	walk(node);

	return out;
}

/**
 * Whether any descendant of `node` is individually selected.
 *
 * @param node - The subtree root.
 * @param selectedSet - The current selection, as a set.
 * @returns `true` when at least one descendant id is selected.
 */
export function hasSelectedDescendant(node: PickerTreeNode, selectedSet: ReadonlySet<string>): boolean {
	for (const child of node.children ?? []) {
		if (selectedSet.has(child.id) || hasSelectedDescendant(child, selectedSet)) {
			return true;
		}
	}

	return false;
}

/** A node plus the ancestors needed to resolve its state. */
export interface IndexedNode {
	/** Ancestors, root-first, excluding the node itself. */
	readonly ancestorPath: readonly PickerTreeNode[];
	/** The node. */
	readonly node: PickerTreeNode;
}

/**
 * Index a tree by node id, capturing each node's ancestor path.
 *
 * @remarks
 * For renderers that draw the tree FLAT. React recurses, so it accumulates the ancestor path
 * naturally as it descends; the wine origin picker renders a pre-order-flattened list with a `depth`
 * for indentation, and a flat list has no ancestry to accumulate. Without this it could only treat
 * each row as an independent toggle — which is exactly what it did, and why clicking a country there
 * selected the country alone while its regions stayed visibly unselected.
 *
 * @param root - The tree root. The root itself is indexed with an empty ancestor path.
 * @returns Map from node id to the node and its ancestors.
 */
export function indexTree(root: PickerTreeNode): ReadonlyMap<string, IndexedNode> {
	const out = new Map<string, IndexedNode>();
	const walk = (node: PickerTreeNode, ancestorPath: readonly PickerTreeNode[]): void => {
		out.set(node.id, { ancestorPath, node });

		const childPath = [...ancestorPath, node];

		for (const child of node.children ?? []) {
			walk(child, childPath);
		}
	};

	walk(root, []);

	return out;
}

/**
 * Whether a row should be visible, given which parents are expanded.
 *
 * @remarks
 * For FLAT renderings, which have no natural place to hide a subtree — a recursive renderer simply
 * does not render collapsed children, but a pre-order list has to filter.
 *
 * Expansion is deliberately independent of selection. Clicking a row's disclosure must not change
 * what is filtered, and clicking its label must not change what is shown; conflating them means a
 * user cannot look inside a region without selecting it, or cannot select a country without its
 * twenty regions unfolding underneath.
 *
 * @param ancestorPath - The node's ancestors, root-first.
 * @param expandedIds - Ids whose children are currently shown.
 * @param rootId - The tree root's id. The root is a container that nothing renders, so it never has
 *   to be expanded for its children to show.
 * @returns `true` when every ancestor between the root and this node is expanded.
 */
export function isRowVisible(
	ancestorPath: readonly PickerTreeNode[],
	expandedIds: ReadonlySet<string>,
	rootId: string,
): boolean {
	return ancestorPath.every((ancestor) => ancestor.id === rootId || expandedIds.has(ancestor.id));
}

/**
 * Whether a node has children to disclose.
 *
 * @param node - The node.
 * @returns `true` when it has at least one child.
 */
export function hasChildren(node: PickerTreeNode): boolean {
	return (node.children?.length ?? 0) > 0;
}

/**
 * Resolve how one node should render.
 *
 * @param node - The node being rendered.
 * @param ancestorPath - Its ancestors, root-first, excluding the node itself.
 * @param selectedSet - The current selection, as a set.
 * @returns The node's tri-state.
 */
export function resolveNodeState(
	node: PickerTreeNode,
	ancestorPath: readonly PickerTreeNode[],
	selectedSet: ReadonlySet<string>,
): NodeSelectionState {
	if (selectedSet.has(node.id) || ancestorPath.some((ancestor) => selectedSet.has(ancestor.id))) {
		return 'checked';
	}

	// `mixed` requires children. A LEAF with no selected ancestor is simply unchecked — there is
	// nothing below it to be partially selected, and reporting `mixed` there would render a
	// half-state for a node that has no halves.
	return hasSelectedDescendant(node, selectedSet) ? 'mixed' : 'unchecked';
}

/**
 * The `aria-checked` value for a tri-state row.
 *
 * @remarks
 * Use with `role="checkbox"`. Do NOT substitute `aria-pressed`: it accepts only `true` / `false`, so
 * a mixed node would have to announce as one of the two definite states, and the partial selection
 * becomes invisible to assistive tech while remaining visible on screen.
 *
 * @param state - The node's tri-state.
 * @returns The literal ARIA value.
 */
export function ariaCheckedFor(state: NodeSelectionState): 'false' | 'mixed' | 'true' {
	if (state === 'checked') {
		return 'true';
	}

	return state === 'mixed' ? 'mixed' : 'false';
}

/**
 * Apply a click to the selection, returning the next selection.
 *
 * @remarks
 * Four cases, and the third is the one people forget:
 *
 *   1. The node's OWN id is selected → drop it.
 *   2. The node is checked via an ANCESTOR → "de-cascade". Remove the ancestor and re-add every
 *      off-path sibling along the way down, so the ancestor's subtree stays selected except this
 *      node's. The ancestor then correctly renders `mixed`. Without this, unchecking one region
 *      inside a selected country either does nothing or silently discards the whole country.
 *   3. The node is `mixed` → select the node itself, SUBSUMING the individually-selected
 *      descendants (they are dropped, since the parent now covers them). This is what keeps the
 *      compact model compact.
 *   4. Unchecked → select it.
 *
 * @param node - The node clicked.
 * @param ancestorPath - Its ancestors, root-first, excluding the node itself.
 * @param selected - The current selection.
 * @returns The next selection. A NEW array; the input is never mutated.
 */
export function toggleNodeSelection(
	node: PickerTreeNode,
	ancestorPath: readonly PickerTreeNode[],
	selected: readonly string[],
): readonly string[] {
	const selectedSet = new Set(selected);

	if (selectedSet.has(node.id)) {
		return selected.filter((id) => id !== node.id);
	}

	const ancestorIdx = ancestorPath.findIndex((ancestor) => selectedSet.has(ancestor.id));

	if (ancestorIdx !== -1) {
		return excludeFromAncestor(selected, ancestorPath, ancestorIdx, node);
	}

	const descendantIds = collectDescendantIds(node);

	return [...selected.filter((id) => !descendantIds.has(id)), node.id];
}

/**
 * De-cascade: the user unchecked `node`, which was included only because an ancestor was selected.
 *
 * @param selected - The current selection.
 * @param ancestorPath - The node's ancestors, root-first.
 * @param ancestorIdx - Index of the selected ancestor within `ancestorPath`.
 * @param node - The unchecked node.
 * @returns The next selection.
 *
 * @internal
 */
function excludeFromAncestor(
	selected: readonly string[],
	ancestorPath: readonly PickerTreeNode[],
	ancestorIdx: number,
	node: PickerTreeNode,
): readonly string[] {
	const ancestor = ancestorPath[ancestorIdx];

	/* v8 ignore next 3 -- defensive: ancestorIdx is a successful findIndex result, so this is never undefined */
	if (ancestor === undefined) {
		return selected;
	}

	const pathFromAncestor: readonly PickerTreeNode[] = [...ancestorPath.slice(ancestorIdx), node];
	const next = selected.filter((id) => id !== ancestor.id);

	for (let i = 0; i < pathFromAncestor.length - 1; i += 1) {
		const parent = pathFromAncestor[i];
		const onward = pathFromAncestor[i + 1];

		/* v8 ignore next 3 -- defensive: path indices are in-bounds, so both are always defined */
		if (parent === undefined || onward === undefined) {
			continue;
		}
		/* v8 ignore next -- defensive: a path-internal parent always has the next node as a child */
		for (const child of parent.children ?? []) {
			if (child.id !== onward.id) {
				next.push(child.id);
			}
		}
	}

	return next;
}
