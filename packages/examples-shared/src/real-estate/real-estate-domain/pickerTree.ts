/**
 * `real-estate-domain/pickerTree` — the framework-neutral shape of a hierarchical picker node.
 *
 * @remarks
 * **Why this type is declared here rather than imported.** The location hierarchy
 * (`buildListingLocationTree`) is pure data: a tree of `{ id, label, children }` derived from the
 * corpus, consumed by the `HierarchicalRule` and by whatever control a given vertical uses to render
 * it. Importing `PickerTreeNode` from `@filter-enginez/react-ui` instead would make a neutral module
 * nominally depend on a React package. A type-only import erases at runtime, but it would still deny
 * this slice an honest React-free subpath, since a Svelte or Angular consumer would be reaching into a
 * React component library for a data shape.
 *
 * TypeScript is structurally typed, so declaring the same shape here costs nothing at the boundary:
 * a tree built by `buildListingLocationTree` still satisfies react-ui's `PickerTreeNode` and can be
 * handed straight to `<HierarchicalPicker>`. The two declarations are checked against each other by
 * `pickerTree.test.ts`, so a change to react-ui's shape fails loudly here rather than
 * silently diverging.
 *
 * @packageDocumentation
 */

/**
 * One node in a hierarchical picker tree — a state, a metro area, or a neighborhood leaf.
 *
 * @remarks
 * Structurally identical to `@filter-enginez/react-ui`'s `PickerTreeNode`, deliberately. Leaves omit
 * `children` (or carry an empty array); `buildLocationNodeSpecs` treats both as a leaf.
 */
export interface PickerTreeNode {
	/** Child nodes; absent or empty for a leaf. */
	readonly children?: readonly PickerTreeNode[];
	/** Stable identifier — the value committed to the `HierarchicalRule`'s selected set. */
	readonly id: string;
	/** Human-readable label rendered by the picker control. */
	readonly label: string;
}
