/**
 * `<HierarchicalPicker />` — recursive accordion-tree picker for `HierarchicalRule`-bound filters
 * (e.g. a country → province → region → subregion cascade) rendered as a collapsible,
 * exclusion-aware tree.
 *
 * @remarks
 * **Cascade-check (compact) selection model.** Selecting a node implicitly includes its entire
 * subtree — exactly what the engine's `HierarchicalRule` does via its subtree walk — so the
 * `selected` array stays compact (it stores the highest selected node, not every descendant).
 * For rendering, a node shows **checked** when its own id OR any ancestor is selected, so clicking
 * a parent visually checks the whole subtree.
 *
 * **Three render states:**
 *
 *   - **Checked** — own id is selected, or an ancestor is selected (subtree-included).
 *   - **Indeterminate** — not checked, but at least one descendant is individually selected.
 *   - **Unchecked** — neither this node, an ancestor, nor any descendant is selected.
 *
 * **Toggle semantics:**
 *
 *   - Click an unchecked / indeterminate node → select its id (subsuming any individually-selected
 *     descendants).
 *   - Click a node selected by its OWN id → deselect it.
 *   - Click a node checked via an ANCESTOR → "de-cascade": replace the selected ancestor with all
 *     of its descendants-on-the-path's siblings, so everything under the ancestor stays included
 *     EXCEPT this node's subtree (the ancestor then renders indeterminate).
 *
 * **Accessibility:** a dedicated disclosure `<button aria-expanded>` (the chevron) drives
 * expand/collapse, kept separate from the selection `<input type="checkbox">` so neither is an
 * interactive control nested inside another (no `<summary>`-wrapped checkbox). Each checkbox carries
 * an `aria-label`; collapsed children stay mounted but `hidden`, so exclusion state stays live.
 *
 * Pure presentational: styling is the `fe-tree*` classes in `@filter-enginez/ui-styles` (the
 * depth indent is inline, computed per node). No engine import.
 */

import { useMemo, useState } from 'react';

import type { PickerTreeNode } from './pickerTree.js';

import { ariaCheckedFor, type IndexedNode, indexTree, resolveNodeState, toggleNodeSelection } from './treeSelection.js';

export { type PickerTreeNode } from './pickerTree.js';

/**
 * Props for `<HierarchicalPicker />`.
 */
export interface HierarchicalPickerProps {
	/** The root tree (a virtual root whose children are the top-level rows). */
	readonly tree: PickerTreeNode;
	/** Currently-selected node ids (compact — a selected node subsumes its subtree). */
	readonly selected: readonly string[];
	/** Called when the user toggles a node. Receives the new selected array. */
	readonly onChange: (nextSelected: readonly string[]) => void;
	/**
	 * Node ids to render hard-disabled — selecting them (or any descendant) would yield zero
	 * results given the other active rules. A node rendered checked is never disabled. Defaults
	 * to none.
	 */
	readonly disabledNodes?: ReadonlySet<string>;
	/**
	 * Node id → projected result count, for the per-row badge.
	 *
	 * @remarks
	 * Optional: omit it and rows render no badge. The count must come from the engine's
	 * predictive-disable bundle rather than from the tree, since only the engine knows how many
	 * RECORDS a node covers — the tree knows only its own shape.
	 */
	readonly nodeCounts?: ReadonlyMap<string, number>;
}

/**
 * The recursive tree picker.
 */
export const HierarchicalPicker = (props: HierarchicalPickerProps): React.ReactElement => {
	const { disabledNodes, nodeCounts, onChange, selected, tree } = props;
	const selectedSet = useMemo(() => new Set(selected), [selected]);
	const effectiveDisabled = disabledNodes ?? EMPTY_DISABLED;

	// Skip the virtual root — its children are the top-level UI rows (no ancestors above them).
	const topLevel = tree.children ?? [];
	// One walk for the whole tree, memoized on tree identity. Each row's count badge is a lookup
	// rather than a per-row subtree walk, which would be quadratic on a deep corpus.
	const index = useMemo(() => indexTree(tree), [tree]);

	return (
		<div className="fe-tree">
			{topLevel.map((node) => (
				<NodeRow
					key={node.id}
					node={node}
					depth={0}
					ancestorPath={EMPTY_PATH}
					selectedSet={selectedSet}
					selected={selected}
					onChange={onChange}
					disabledNodes={effectiveDisabled}
					index={index}
					nodeCounts={nodeCounts}
					count={nodeCounts?.get(node.id)}
				/>
			))}
		</div>
	);
};

/**
 * Module-level frozen empties so default values keep stable identity across renders.
 *
 * @internal
 */
const EMPTY_DISABLED: ReadonlySet<string> = new Set();
const EMPTY_PATH: readonly PickerTreeNode[] = [];

/**
 * One row in the tree — checkbox + label inside a native `<details>`/`<summary>` when the node has
 * children (so the row IS the expand/collapse toggle); leaf nodes render as plain rows.
 *
 * @internal
 */
const NodeRow = ({
	ancestorPath,
	count,
	depth,
	disabledNodes,
	index,
	node,
	nodeCounts,
	onChange,
	selected,
	selectedSet,
}: {
	readonly depth: number;
	readonly node: PickerTreeNode;
	/** Ancestor nodes from the top-level row down to this node's parent. */
	readonly ancestorPath: readonly PickerTreeNode[];
	readonly disabledNodes: ReadonlySet<string>;
	/** The whole-tree index, threaded down so child rows can resolve ancestry. */
	readonly index: ReadonlyMap<string, IndexedNode>;
	/**
	 * Projected result count for this node, or `undefined` when unknown.
	 *
	 * @remarks
	 * How many RECORDS would match if this node were selected — the number the user sees after
	 * clicking. Supplied by the caller from the engine's predictive-disable bundle, because only the
	 * engine knows it; the tree alone cannot.
	 *
	 * Not a count of leaf descendants, which would be wrong in a way that looks right: a leaf can
	 * carry many records, so a country with one region beneath it would read `1` and produce two
	 * results. `undefined` renders no badge, which is correct before the first bundle settles —
	 * better than a number that is about to change.
	 */
	readonly count: number | undefined;
	/** Threaded down so child rows can resolve their own badges. */
	readonly nodeCounts: ReadonlyMap<string, number> | undefined;
	readonly onChange: (nextSelected: readonly string[]) => void;
	readonly selected: readonly string[];
	readonly selectedSet: ReadonlySet<string>;
}): React.ReactElement => {
	// Expand/collapse state for parent rows (leaf rows ignore it). Collapsed by default — the tree
	// can be deep, so the user opens the branches they care about.
	const [isExpanded, setIsExpanded] = useState(false);
	// State + toggle both come from the shared `treeSelection` module, so the Svelte picker and this
	// one cannot disagree about what "partly selected" means or what a click does.
	const state = resolveNodeState(node, ancestorPath, selectedSet);
	const isChecked = state === 'checked';
	const isIndeterminate = state === 'mixed';
	// Also narrows `node.children` for the parent branch below, so this is load-bearing beyond the
	// leaf/parent test it reads as.
	const hasChildren = node.children !== undefined && node.children.length > 0;
	// Hard-disable only when not rendered checked (a checked node stays clickable to deselect).
	const isDisabled = !isChecked && disabledNodes.has(node.id);

	const handleToggle = (): void => {
		/* v8 ignore start -- unreachable via the DOM: a disabled node renders `button.disabled`, so the
		   browser swallows the click before this handler runs. The guard stays as belt-and-braces for a
		   caller that renders the control enabled while passing the node in `disabledNodes`. */
		if (isDisabled) {
			return;
		}
		/* v8 ignore stop */
		onChange(toggleNodeSelection(node, ancestorPath, selected));
	};

	const labelClass = `fe-tree__label${
		isDisabled
			? ' fe-tree__label--disabled'
			: isChecked
				? ' fe-tree__label--checked'
				: isIndeterminate
					? ' fe-tree__label--indeterminate'
					: ''}`;

	// The WHOLE ROW is the control — one button spanning mark, label and count, so the hit target is
	// the line rather than a 13px checkbox. Matches the Svelte picker; a checkbox-only target would
	// make a wide row look interactive along its full width and respond on a sliver of it.
	//
	// `role="checkbox"` on a button rather than a native `<input>`: this control has three states and
	// `aria-pressed` has no mixed value, so a plain toggle button could not announce a partly-selected
	// parent. `aria-checked` carries all three. The native input was doing this correctly via the
	// `indeterminate` DOM property, which is why that had to be set through a ref — the button needs
	// no such escape hatch.
	//
	// The mark is rendered ONLY when checked or mixed. An always-present empty box reads as a control
	// that has been switched off; absence reads as "not chosen", which is what unchecked means here.
	const controls = (
		<button
			type="button"
			role="checkbox"
			aria-checked={ariaCheckedFor(state)}
			className={`fe-tree__control${isChecked ? ' fe-tree__control--checked' : ''}${
				isIndeterminate ? ' fe-tree__control--mixed' : ''
			}`}
			disabled={isDisabled}
			title={isDisabled ? `No matches for ${node.label} given your other filters` : undefined}
			onClick={handleToggle}
		>
			<span aria-hidden="true" className="fe-tree__mark">
				{isChecked ? '✓' : isIndeterminate ? '–' : ''}
			</span>
			<span className={labelClass}>{node.label}</span>
			{/* How much of the corpus this node covers, so the cost of selecting it is visible before
			    the click — the affordance the Svelte picker had and this one did not. */}
			{count === undefined ? null : <span className="fe-tree__count">{count}</span>}
		</button>
	);

	if (!hasChildren) {
		// Leaf row — no disclosure control, but it still reserves the disclosure COLUMN so its label
		// lines up with its siblings' rather than shifting left into it. That is the Svelte picker's
		// behavior, which this one is at spacing parity with. `--leaf` draws the column via a `::before`
		// in `ui-styles`, rather than an empty `<span class="fe-tree__chevron" aria-hidden>` that would
		// hold the same space but leave an element in the DOM named for a chevron it never contains.
		return (
			<div className={`fe-tree__row fe-tree__row--leaf${isDisabled ? ' fe-tree__row--disabled' : ''}`}>
				{controls}
			</div>
		);
	}

	const childAncestorPath = [...ancestorPath, node];

	// Disclosure pattern: a dedicated toggle button (`aria-expanded`) drives expand/collapse instead
	// of a native `<summary>`, so the selection checkbox is not an interactive control nested
	// inside another interactive one (a11y: nested-interactive). Children stay mounted but `hidden`
	// when collapsed, so their exclusion / indeterminate state stays live regardless of open state.
	// No per-depth inline indent. The rows are ALREADY nested in the DOM — a node's wrapper sits inside
	// its parent's `.fe-tree__children` — so a `depth * 14` margin at every level would compound on top
	// of every ancestor's: depth 2 would land at 56px instead of 28px, and the error would grow with
	// depth. The indent is one CONSTANT step on `.fe-tree__children` in `ui-styles` instead, which
	// nesting accumulates into exactly `depth * 14` — matching the Svelte picker, which renders a flat
	// list and reads `depth` off each spec.
	return (
		<div className="fe-tree__branch">
			<div className="fe-tree__row fe-tree__summary">
				<button
					type="button"
					className="fe-tree__chevron fe-tree__toggle"
					aria-expanded={isExpanded}
					aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
					onClick={() => setIsExpanded((prev) => !prev)}
				>
					{/* A plus that BECOMES a minus: the second bar rotates onto the first rather than
					    the glyph being swapped, so the icon reads as one thing changing state.
					    Decorative — `aria-expanded` and `aria-label` carry the meaning. */}
					<span className={`fe-tree__pm${isExpanded ? ' fe-tree__pm--open' : ''}`} aria-hidden="true">
						<span className="fe-tree__pm-bar" />
						<span className="fe-tree__pm-bar fe-tree__pm-bar--pivot" />
					</span>
				</button>
				{controls}
			</div>
			<div className="fe-tree__children" hidden={!isExpanded}>
				{node.children.map((child) => (
					<NodeRow
						key={child.id}
						node={child}
						depth={depth + 1}
						ancestorPath={childAncestorPath}
						selectedSet={selectedSet}
						selected={selected}
						onChange={onChange}
						disabledNodes={disabledNodes}
						index={index}
						nodeCounts={nodeCounts}
						count={nodeCounts?.get(child.id)}
					/>
				))}
			</div>
		</div>
	);
};
