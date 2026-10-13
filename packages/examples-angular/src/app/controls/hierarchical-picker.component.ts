/**
 * `<fe-hierarchical-picker>` — a tri-state tree picker rendered as a FLAT list of toggle rows.
 *
 * @remarks
 * The Angular counterpart to react-ui's, Vue's and Svelte's `<HierarchicalPicker>`. Same semantics,
 * same class names, same tree — a different rendering strategy from React's. React recurses, nesting
 * each node inside its parent's `.fe-tree__children`; this walks the tree once into a flat,
 * pre-ordered row list and indents with `padding-left`. Both arrive at identical output because the
 * indent step and the row rhythm live in `ui-styles`, not here.
 *
 * ### None of the tree logic is implemented here
 *
 * Every semantic decision — how a node's state resolves through its ancestors, what one click does to
 * a compact selection, which rows a collapse hides, what `aria-checked` a mixed node announces —
 * comes from `@filter-enginez/examples-shared/picker`. The Angular, Vue, SvelteKit and vanilla pickers
 * all drive it, and the moment one of them reimplements `toggleNodeSelection` "just for the Angular
 * case" the four stop agreeing on what a click means. This component is a driver: it holds expansion
 * state, calls those helpers, and emits.
 *
 * ### Rows come from the TREE, not from a flat spec list
 *
 * Rendering from the predictive-disable bundle's pre-flattened candidate list would look free and is
 * not: wine's `{ depth, label, leafIds, value }[]` happens to carry everything a row needs, but real
 * estate's equivalent carries only `{ leafIds, value }`, because the bundle never needs a label or a
 * depth. Rendered from that, the picker would be an unindented tree of blank rows.
 *
 * `indexTree` already returns exactly what a flat renderer needs — every node in pre-order, each with
 * its ancestor path — so depth is `ancestorPath.length - 1`, the label is the node's own, and the
 * bundle's candidate shape is irrelevant to rendering. The two are separate lists that must share one
 * order; the spec beside this file pins that they do.
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

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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

/** Indent applied per level of depth, in `rem`. Matches the other three verticals exactly. */
const INDENT_REM_PER_LEVEL = 0.875;

/**
 * Accessible name for a disclosure control, which has no visible text of its own.
 *
 * @param entry - The row the control belongs to.
 * @param isOpen - Whether the branch is currently expanded.
 * @returns The name to announce.
 */
function disclosureLabel(entry: IndexedNode, isOpen: boolean): string {
	return (isOpen ? 'Collapse ' : 'Expand ') + entry.node.label;
}

/**
 * Depth-proportional indent for one row, in `rem`.
 *
 * @param entry - The row. The root occupies one ancestor slot, hence the `- 1`.
 * @returns The inline `padding-left` magnitude.
 */
function indentRem(entry: IndexedNode): number {
	return (entry.ancestorPath.length - 1) * INDENT_REM_PER_LEVEL;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-hierarchical-picker',
	template: `
		<!--
			The custom property rather than a scoped height rule: the whole point of rendering fe-tree
			classes is that this component contributes markup and nothing else.
		-->
		<div
			class="fe-tree"
			role="group"
			[attr.aria-label]="groupLabel()"
			[style.--fe-tree-max-height]="maxHeight()"
		>
			@for (entry of visible(); track entry.node.id) {
				@let state = stateFor(entry);
				@let isDisabled = isDisabledRow(entry);
				@let isOpen = isExpanded(entry.node.id);

				<!--
					The row is a DIV holding two sibling buttons, not one button. Nesting a disclosure button
					inside the selection button would be invalid HTML and would fire both handlers on one
					click.

					The indent is inline because this rendering is FLAT — there is no DOM nesting for a
					constant step to accumulate through, which is how React gets the same result from
					fe-tree__children.
				-->
				<div
					class="fe-tree__row"
					[class.fe-tree__row--disabled]="isDisabled"
					[class.fe-tree__row--leaf]="!nodeHasChildren(entry.node)"
					[style.padding-left.rem]="indentFor(entry)"
				>
					@if (nodeHasChildren(entry.node)) {
						<button
							type="button"
							class="fe-tree__chevron fe-tree__toggle"
							[attr.aria-expanded]="isOpen"
							[attr.aria-label]="disclosureLabelFor(entry, isOpen)"
							(click)="toggleExpanded(entry.node.id)"
						>
							<!--
								A plus that BECOMES a minus: two bars, and the vertical one rotates onto the
								horizontal. Swapping the two glyphs would jump; rotating a bar is a continuous
								change, so the icon reads as one thing changing state rather than two icons trading
								places. Purely decorative — aria-expanded and aria-label carry the meaning.
							-->
							<span class="fe-tree__pm" [class.fe-tree__pm--open]="isOpen" aria-hidden="true">
								<span class="fe-tree__pm-bar"></span>
								<span class="fe-tree__pm-bar fe-tree__pm-bar--pivot"></span>
							</span>
						</button>
					}

					<button
						type="button"
						role="checkbox"
						class="fe-tree__control"
						[class.fe-tree__control--checked]="state === 'checked'"
						[class.fe-tree__control--mixed]="state === 'mixed'"
						[attr.aria-checked]="ariaCheckedValue(state)"
						[attr.title]="titleFor(entry)"
						[disabled]="isDisabled"
						(click)="selectionChange.emit(nextSelectionFor(entry))"
					>
						<!--
							Rendered only when checked or mixed. A permanently-visible empty box reads as a
							control switched OFF; absence reads as 'not chosen', which is what unchecked means.
						-->
						<span class="fe-tree__mark" aria-hidden="true">
							@if (state === 'checked') {
								✓
							} @else if (state === 'mixed') {
								–
							}
						</span>
						<span
							class="fe-tree__label"
							[class.fe-tree__label--checked]="!isDisabled && state === 'checked'"
							[class.fe-tree__label--disabled]="isDisabled"
							[class.fe-tree__label--indeterminate]="!isDisabled && state === 'mixed'"
						>
							{{ entry.node.label }}
						</span>
						@if (counts().has(entry.node.id)) {
							<span class="fe-tree__count">{{ counts().get(entry.node.id) }}</span>
						}
					</button>
				</div>
			}
		</div>
	`,
})
export class HierarchicalPickerComponent {
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
	public readonly counts = input.required<ReadonlyMap<string, number>>();

	/** Node ids whose selection would empty the result set. Empty means "no information". */
	public readonly disabled = input.required<ReadonlySet<string>>();

	/**
	 * Accessible name for the tree group, e.g. `'Origin'` or `'Location'`.
	 *
	 * @remarks
	 * `groupLabel`, not `ariaLabel` — a control's label prop is named after the thing it labels. Vue
	 * has a hard reason (a template `aria-label` binding is matched against the global HTML aria
	 * typing before a prop of that name, so a required `ariaLabel` reads as never supplied); Angular
	 * has only the naming one, and the four verticals agreeing on the name is worth more than the
	 * saving.
	 */
	public readonly groupLabel = input.required<string>();

	/** Scroll-viewport height, as a CSS length. A per-panel choice — see `.fe-tree` in ui-styles. */
	public readonly maxHeight = input<string>('16rem');

	/** The current selection, compact: the highest selected node on each branch, never the closure. */
	public readonly selected = input.required<readonly string[]>();

	/** The tree root. Its own row is never rendered; it is a container for the top level. */
	public readonly tree = input.required<PickerTreeNode>();

	/** Emitted with the WHOLE next selection — one click can cascade a subtree or de-cascade an ancestor. */
	public readonly selectionChange = output<readonly string[]>();

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
	 * Held as an immutable `Set` swapped wholesale on every toggle, which is what a signal needs to
	 * notice a change at all — the equality check is by reference. (Vue reaches for `reactive(new Set())`
	 * and Svelte for `SvelteSet` to get per-entry tracking; a tree this size does not need it, and a
	 * replaced set keeps the read path a plain `ReadonlySet`.)
	 */
	private readonly _expanded = signal<ReadonlySet<string>>(new Set<string>());

	/** Rebuilt only when the tree identity changes — the corpus is immutable post-boot, so once. */
	private readonly _index = computed<ReadonlyMap<string, IndexedNode>>(() => indexTree(this.tree()));

	/**
	 * Every renderable row, in pre-order, root excluded.
	 *
	 * @remarks
	 * `indexTree` inserts as it walks, so `Map` insertion order IS pre-order — a parent precedes its
	 * descendants, which is the only order a flat rendering of a hierarchy can be read in. The root is
	 * dropped because it is a container nobody selects; its children are the top level.
	 */
	private readonly _rows = computed<readonly IndexedNode[]>(() =>
		[...this._index().values()].filter((entry) => entry.node.id !== this.tree().id),
	);

	/** The selection as a set, so ancestor lookups are not linear scans per row. */
	private readonly _selectedSet = computed<ReadonlySet<string>>(() => new Set(this.selected()));

	/**
	 * The rows that actually render.
	 *
	 * @remarks
	 * No cap. A fully expanded tree of ~700 rows would be a real DOM cost, but collapsing solves that
	 * at the source: the default view is a dozen top-level nodes, and the count only grows as the user
	 * deliberately opens branches.
	 *
	 * A cap on top of collapsing is worse than either alone, because it truncates SILENTLY. Open three
	 * large branches and rows would simply stop appearing, with nothing on screen to say why. This is
	 * a scroll container, so windowing, not a hidden limit, is the tool if depth ever costs too much.
	 */
	protected readonly visible = computed<readonly IndexedNode[]>(() =>
		this._rows().filter((entry) => isRowVisible(entry.ancestorPath, this._expanded(), this.tree().id)),
	);

	/**
	 * The four template helpers that depend on nothing but their arguments, exposed by reference.
	 *
	 * @remarks
	 * Bound rather than wrapped in methods, because a wrapper would be a place for this component to
	 * start disagreeing with the other three verticals about what a tri-state or a leaf IS. Two of them
	 * are the shared picker helpers untouched; the other two are the module-level functions above.
	 */
	protected readonly ariaCheckedValue: (state: NodeSelectionState) => string = ariaCheckedFor;

	/** @see ariaCheckedValue */
	protected readonly disclosureLabelFor = disclosureLabel;

	/** @see ariaCheckedValue */
	protected readonly indentFor = indentRem;

	/** @see ariaCheckedValue */
	protected readonly nodeHasChildren = hasChildren;

	/**
	 * Whether the row is hard-disabled.
	 *
	 * @remarks
	 * A checked row stays clickable so it can be deselected; only a row that is NOT already
	 * contributing gets disabled. Without that escape hatch a user who filtered themselves into a
	 * corner would have no way back out.
	 */
	protected isDisabledRow(entry: IndexedNode): boolean {
		return this.stateFor(entry) !== 'checked' && this.disabled().has(entry.node.id);
	}

	/** Whether one parent's disclosure is open. */
	protected isExpanded(id: string): boolean {
		return this._expanded().has(id);
	}

	/** Next selection after clicking this row. The helper owns the cascade rules. */
	protected nextSelectionFor(entry: IndexedNode): readonly string[] {
		return toggleNodeSelection(entry.node, entry.ancestorPath, this.selected());
	}

	/** The node's tri-state, resolved through its ancestors. */
	protected stateFor(entry: IndexedNode): NodeSelectionState {
		return resolveNodeState(entry.node, entry.ancestorPath, this._selectedSet());
	}

	/** Hover explanation for a dimmed row; `null` leaves the attribute off entirely. */
	protected titleFor(entry: IndexedNode): string | null {
		return this.isDisabledRow(entry)
			? `No matches for ${entry.node.label} given your other filters`
			: null;
	}

	/**
	 * Toggle one parent's disclosure.
	 *
	 * @param id - The node id.
	 */
	protected toggleExpanded(id: string): void {
		this._expanded.update((current) => {
			const next = new Set(current);

			if (!next.delete(id)) {
				next.add(id);
			}

			return next;
		});
	}
}
