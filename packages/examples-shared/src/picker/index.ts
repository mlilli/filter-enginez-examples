/**
 * `@filter-enginez/examples-shared/picker` — the hierarchical picker's data contract and selection
 * semantics, belonging to no dataset.
 *
 * @remarks
 * These nine symbols answer "how does a tri-state tree behave" — how a node's state resolves from its
 * ancestors, what a click does to a compact selection, which rows a collapse hides, and what
 * `aria-checked` a mixed node announces. None of it is about wine, or real estate, or React.
 *
 * They live in `@filter-enginez/react-ui/bounds` (an import-free subpath, despite the package name)
 * and were reachable from a non-React vertical only through `./wine-domain`, which re-exports them.
 * That was fine while wine owned the only tree. It stopped being fine the moment real estate's
 * location hierarchy needed the same picker: a generic `<HierarchicalPicker>` in a control library
 * would have had to import its semantics from the WINE slice, and the next reader would reasonably
 * conclude the control was wine's.
 *
 * So this subpath is the honest address. `./wine-domain` keeps its re-exports — every existing import
 * still resolves — and new consumers reach for the neutral one.
 *
 * **Why re-export rather than move.** The definitions are `react-ui`'s and the React picker is their
 * first consumer; relocating them would make a React component import its own semantics from an
 * examples package, inverting the dependency. Re-exporting costs one hop at build time and nothing at
 * runtime, and it means a change to the tri-state contract is still made in exactly one place.
 *
 * @packageDocumentation
 */

export {
	ariaCheckedFor,
	hasChildren,
	type IndexedNode,
	indexTree,
	isRowVisible,
	type NodeSelectionState,
	type PickerTreeNode,
	resolveNodeState,
	toggleNodeSelection,
} from '@filter-enginez/react-ui/bounds';
