/**
 * `controls/hierarchicalPicker` — a tri-state tree picker rendered as a FLAT list of toggle rows.
 *
 * @remarks
 * The framework-less counterpart to react-ui's, Vue's, Svelte's and Angular's `<HierarchicalPicker>`.
 * Same semantics, same class names, same tree — a different rendering strategy from React's. React
 * recurses, nesting each node inside its parent's `.fe-tree__children`; this walks the tree once into
 * a flat, pre-ordered row list and indents with `padding-left`, as the other three flat renderers do.
 * All five arrive at identical output because the indent step and the row rhythm live in `ui-styles`,
 * not here.
 *
 * ### None of the tree logic is implemented here
 *
 * Every semantic decision — how a node's state resolves through its ancestors, what one click does to
 * a compact selection, which rows a collapse hides, what `aria-checked` a mixed node announces — comes
 * from `@filter-enginez/examples-shared/picker`. Five verticals render this control, and the
 * moment one of them reimplements `toggleNodeSelection` "just for the vanilla case" they stop agreeing
 * on what a click means. This module is a driver: it holds expansion state, calls those helpers, and
 * reports back.
 *
 * That matters more here than anywhere else, because this is the vertical with no framework to blame.
 * A hand-built DOM renderer is exactly where "it's only a few lines, inline it" is most tempting and
 * least recoverable.
 *
 * ### Rows come from the TREE, not from a flat spec list
 *
 * The Svelte original once took a pre-flattened `{ depth, label, leafIds, value }[]` built for the
 * predictive-disable bundle and reused for rendering. That coupling looked free and was not: real
 * estate's equivalent candidate carries only `{ leafIds, value }`, because the bundle never needed a
 * label or a depth. Retargeting the control at it would have produced an unindented tree of blank
 * rows.
 *
 * `indexTree` already returns exactly what a flat renderer needs — every node in pre-order, each with
 * its ancestor path — so depth is `ancestorPath.length - 1`, the label is the node's own, and the
 * bundle's candidate shape becomes irrelevant to rendering. The two concerns were never the same
 * list; they only happened to agree for wine.
 *
 * ### Why `role="checkbox"` and not a toggle button
 *
 * `aria-pressed` has no mixed value. A row styled as a button therefore cannot announce a partial
 * state, and a screen-reader user would hear a half-selected country as either fully on or fully off.
 * `role="checkbox"` carries `aria-checked="mixed"`, so the tri-state survives into the accessibility
 * tree. The element stays a `<button>` for focus and keyboard behavior — only the role changes.
 *
 * @packageDocumentation
 */

import {
	ariaCheckedFor,
	hasChildren,
	type IndexedNode,
	indexTree,
	isRowVisible,
	type NodeSelectionState,
	type PickerTreeNode,
	resolveNodeState,
	toggleNodeSelection,
} from '@filter-enginez/examples-shared/picker';

import type { Control } from './controls.js';

import { el } from '../dom.js';

/** Indent applied per level of depth, in `rem`. Matches the other four verticals exactly. */
const INDENT_REM_PER_LEVEL = 0.875;

/** Scroll-viewport height when the caller expresses no preference. */
const DEFAULT_MAX_HEIGHT = '16rem';

/** Construction-time options for a hierarchical picker. */
export interface HierarchicalPickerOptions {
	/**
	 * Accessible name for the tree group, e.g. `'Origin'` or `'Location'`.
	 *
	 * @remarks
	 * `groupLabel`, not `ariaLabel` — a control's label prop is named after what it labels, never after
	 * the HTML attribute it happens to end up in. Vue has a hard reason (a template `aria-label`
	 * binding is matched against the global HTML aria typing before a prop of that name, so a required
	 * `ariaLabel` reads as never supplied); here it is the naming convention alone, and the five
	 * verticals agreeing on the name is worth more than the saving.
	 */
	readonly groupLabel: string;
	/**
	 * Called with the WHOLE next selection — one click can cascade a subtree or de-cascade an ancestor,
	 * so there is no single toggled id to report.
	 */
	readonly onChange: (next: readonly string[]) => void;
	/** Scroll-viewport height, as a CSS length. A per-panel choice — see `.fe-tree` in ui-styles. */
	readonly maxHeight?: string;
}

/** State a hierarchical picker renders from. */
export interface HierarchicalPickerState {
	/**
	 * Node id → projected result count, from the engine's predictive-disable bundle.
	 *
	 * @remarks
	 * How many RECORDS a node covers — the number the user gets after clicking. Not the count of leaf
	 * NODES beneath it, which is a different quantity and was visibly wrong when the Svelte picker
	 * rendered it: a country with one leaf region beneath it read `1` and produced two results. Only
	 * the engine knows the record count; the tree knows only its own shape.
	 *
	 * Empty before the first bundle settles, so rows render no badge rather than a number about to
	 * change.
	 */
	readonly counts: ReadonlyMap<string, number>;
	/** Node ids whose selection would empty the result set. Empty means "no information". */
	readonly disabled: ReadonlySet<string>;
	/** The current selection, compact: the highest selected node on each branch, never the closure. */
	readonly selected: readonly string[];
	/** The tree root. Its own row is never rendered; it is a container for the top level. */
	readonly tree: PickerTreeNode;
}

/**
 * Build a tri-state hierarchical picker.
 *
 * @param options - The group's accessible name, the change callback, and the viewport height.
 * @returns The mounted picker; `update(state)` re-applies the tree, selection, counts and disables.
 */
export function createHierarchicalPicker(
	options: HierarchicalPickerOptions,
): Control<HierarchicalPickerState> {
	const { groupLabel, maxHeight = DEFAULT_MAX_HEIGHT, onChange } = options;

	// `--fe-tree-max-height` rather than a height declaration: the whole point of rendering `.fe-tree*`
	// is that this module contributes markup and nothing else, and the custom property is the seam
	// ui-styles exposes for exactly this.
	const element = el('div', {
		attrs: { 'aria-label': groupLabel, role: 'group' },
		className: 'fe-tree',
		style: { '--fe-tree-max-height': maxHeight },
	});

	/**
	 * Which parents are open. Starts EMPTY — everything collapsed but the top level.
	 *
	 * @remarks
	 * A tree here can run to ~700 nodes. Rendering it fully expanded meant the opening rows were all
	 * sub-regions of the first few countries — a flat wall of unfamiliar names, with most countries far
	 * enough down that nobody would scroll to them.
	 *
	 * Expansion is LOCAL state, deliberately not lifted: it is a view preference, not filter state.
	 * Putting it in the engine would push it into the shareable URL, so a copied link would restore
	 * someone else's scroll-and-open choices along with their filters.
	 *
	 * A plain mutable `Set` is enough here — nothing observes it, because a toggle repaints directly.
	 * The reactive ports need `reactive(new Set())` / `SvelteSet` / a wholesale-replaced signal only to
	 * make their frameworks notice the mutation at all.
	 */
	const expanded = new Set<string>();

	/** The tree the row list was built from, so the index is rebuilt only on a genuine change. */
	let indexedTree: PickerTreeNode | null = null;

	/**
	 * Every renderable row, in pre-order, root excluded.
	 *
	 * @remarks
	 * `indexTree` inserts as it walks, so `Map` insertion order IS pre-order — a parent precedes its
	 * descendants, which is the only order a flat rendering of a hierarchy can be read in. The root is
	 * dropped because it is a container nobody selects; its children are the top level.
	 */
	let rows: readonly IndexedNode[] = [];

	/** The last committed state, so a purely local expansion toggle can repaint without one. */
	let latest: HierarchicalPickerState | null = null;

	/** Rebuild the row list when — and only when — the tree identity changes. */
	function reindex(tree: PickerTreeNode): void {
		if (tree === indexedTree) {
			return;
		}
		indexedTree = tree;
		rows = [...indexTree(tree).values()].filter((entry) => entry.node.id !== tree.id);
	}

	/**
	 * Repaint every visible row.
	 *
	 * @remarks
	 * No cap. A fully expanded ~700-row tree would be a real DOM cost, but collapsing solves that at
	 * the source: the default view is a dozen top-level nodes, and the count only grows as the user
	 * deliberately opens branches.
	 *
	 * A cap on top of collapsing is worse than either alone, because it truncates SILENTLY. Open three
	 * large branches and rows would simply stop appearing, with nothing on screen to say why. If depth
	 * ever becomes a problem this is a scroll container, so windowing is the honest fix rather
	 * than a hidden limit.
	 */
	function paint(): void {
		/* v8 ignore next 3 -- defensive: unreachable in both directions. `update` assigns `latest`
		   before it calls this, and the only other caller is `toggleExpanded`, which fires from a row
		   that this function is what renders — so with no state there is no row to click. */
		if (latest === null) {
			return;
		}
		const state = latest;
		const selectedSet = new Set(state.selected);

		element.replaceChildren(
			...rows
				.filter((entry) => isRowVisible(entry.ancestorPath, expanded, state.tree.id))
				.map((entry) => renderRow(entry, state, selectedSet)),
		);
	}

	/** Toggle one parent's disclosure, then repaint — this control owns its own expansion. */
	function toggleExpanded(id: string): void {
		if (!expanded.delete(id)) {
			expanded.add(id);
		}
		paint();
	}

	/**
	 * The disclosure control for a parent row.
	 *
	 * @remarks
	 * A sibling of the selection button, never a child of it: nesting a button inside a button is
	 * invalid HTML and would fire both handlers on one click. The row `<div>` is what holds the two
	 * together.
	 */
	function disclosureButton(entry: IndexedNode, isOpen: boolean): HTMLElement {
		return el('button', {
			attrs: {
				'aria-expanded': isOpen,
				'aria-label': `${isOpen ? 'Collapse' : 'Expand'} ${entry.node.label}`,
				type: 'button',
			},
			children: [plusMinusIcon(isOpen)],
			className: 'fe-tree__chevron fe-tree__toggle',
			on: {
				click: () => {
					toggleExpanded(entry.node.id);
				},
			},
		});
	}

	/** One row: the optional disclosure plus the tri-state selection control. */
	function renderRow(
		entry: IndexedNode,
		state: HierarchicalPickerState,
		selectedSet: ReadonlySet<string>,
	): HTMLElement {
		const nodeState = resolveNodeState(entry.node, entry.ancestorPath, selectedSet);
		// A checked row stays clickable so it can be deselected; only a row that is NOT already
		// contributing gets disabled. Without that escape hatch a user who filtered themselves into a
		// corner would have no way back out.
		const isDisabled = nodeState !== 'checked' && state.disabled.has(entry.node.id);
		const hasChildNodes = hasChildren(entry.node);
		const count = state.counts.get(entry.node.id);

		return el('div', {
			children: [
				hasChildNodes && disclosureButton(entry, expanded.has(entry.node.id)),
				el('button', {
					attrs: {
						'aria-checked': ariaCheckedFor(nodeState),
						disabled: isDisabled ? 'true' : null,
						role: 'checkbox',
						title: isDisabled
							? `No matches for ${entry.node.label} given your other filters`
							: null,
						type: 'button',
					},
					children: [
						// Present but empty when unchecked. A permanently-visible empty BOX would read as a
						// control switched off; an empty mark slot just holds the label's alignment.
						el('span', {
							attrs: { 'aria-hidden': 'true' },
							className: 'fe-tree__mark',
							text: markGlyph(nodeState),
						}),
						el('span', { className: labelClass(nodeState, isDisabled), text: entry.node.label }),
						count !== undefined && el('span', { className: 'fe-tree__count', text: String(count) }),
					],
					className: controlClass(nodeState),
					on: {
						click: () => {
							onChange(toggleNodeSelection(entry.node, entry.ancestorPath, state.selected));
						},
					},
				}),
			],
			className: rowClass(hasChildNodes, isDisabled),
			// Inline because this rendering is FLAT — there is no DOM nesting for a constant step to
			// accumulate through, which is how React gets the same result from `.fe-tree__children`.
			style: { paddingLeft: `${(entry.ancestorPath.length - 1) * INDENT_REM_PER_LEVEL}rem` },
		});
	}

	return {
		element,
		update: (state) => {
			latest = state;
			reindex(state.tree);
			paint();
		},
	};
}

/**
 * A plus that BECOMES a minus: two bars, and the vertical one rotates onto the horizontal.
 *
 * @remarks
 * Swapping "+" and "−" glyphs would jump; rotating a bar is a continuous change, so the icon reads as
 * one thing changing state rather than two icons trading places. Purely decorative — `aria-expanded`
 * and the button's `aria-label` carry the meaning.
 *
 * @internal
 */
function plusMinusIcon(isOpen: boolean): HTMLElement {
	return el('span', {
		attrs: { 'aria-hidden': 'true' },
		children: [
			el('span', { className: 'fe-tree__pm-bar' }),
			el('span', { className: 'fe-tree__pm-bar fe-tree__pm-bar--pivot' }),
		],
		className: isOpen ? 'fe-tree__pm fe-tree__pm--open' : 'fe-tree__pm',
	});
}

/**
 * The glyph inside the mark slot: a check when fully selected, an en dash when partially.
 *
 * @internal
 */
function markGlyph(state: NodeSelectionState): string {
	if (state === 'checked') {
		return '✓';
	}

	return state === 'mixed' ? '–' : '';
}

/**
 * Class list for the selection button.
 *
 * @internal
 */
function controlClass(state: NodeSelectionState): string {
	if (state === 'checked') {
		return 'fe-tree__control fe-tree__control--checked';
	}

	return state === 'mixed' ? 'fe-tree__control fe-tree__control--mixed' : 'fe-tree__control';
}

/**
 * Class list for the row label. Disabled wins over the tri-state, so a dimmed row reads as one thing.
 *
 * @internal
 */
function labelClass(state: NodeSelectionState, isDisabled: boolean): string {
	if (isDisabled) {
		return 'fe-tree__label fe-tree__label--disabled';
	}
	if (state === 'checked') {
		return 'fe-tree__label fe-tree__label--checked';
	}

	return state === 'mixed' ? 'fe-tree__label fe-tree__label--indeterminate' : 'fe-tree__label';
}

/**
 * Class list for the row container.
 *
 * @internal
 */
function rowClass(hasChildNodes: boolean, isDisabled: boolean): string {
	const classNames = ['fe-tree__row'];

	if (!hasChildNodes) {
		classNames.push('fe-tree__row--leaf');
	}
	if (isDisabled) {
		classNames.push('fe-tree__row--disabled');
	}

	return classNames.join(' ');
}
