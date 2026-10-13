/**
 * `pickerTree` — the hierarchical picker's data contract, in a React-free module.
 *
 * @remarks
 * Kept out of `HierarchicalPicker.tsx` so the shape can travel through the import-free
 * `@filter-enginez/react-ui/bounds` subpath. Every vertical builds this tree from its own corpus,
 * but only the two React apps render it with this component; the other four (Svelte, Vue, vanilla,
 * Angular) need the type without the component. Declaring it in the `.tsx` would mean importing it
 * drags the whole component barrel — or invites a hand-copied duplicate per vertical that drifts
 * the moment the shape changes.
 *
 * The component re-exports it, so it can be imported from either place.
 *
 * @packageDocumentation
 */

/**
 * Tree node shape consumed by the picker (id + label + optional children).
 */
export interface PickerTreeNode {
	readonly id: string;
	readonly children?: readonly PickerTreeNode[];
	readonly label: string;
}
