<script setup lang="ts">
/**
 * `<HierarchicalPicker>` — a tri-state tree picker rendered as a FLAT list of toggle rows.
 *
 * @remarks
 * The Vue counterpart to react-ui's and Svelte's `<HierarchicalPicker>`. Same semantics, same class
 * names, same tree — a different rendering strategy from React's. React recurses, nesting each node
 * inside its parent's `.fe-tree__children`; this walks the tree once into a flat, pre-ordered row list
 * and indents with `padding-left`. Both arrive at identical output because the indent step and the row
 * rhythm live in `ui-styles`, not here.
 *
 * ### Rows come from the TREE, not from a flat spec list
 *
 * Rendering from the predictive-disable bundle's pre-flattened `specs` would look free and is not:
 * wine's specs carry `{ depth, label, leafIds, value }`, but real estate's equivalent candidate carries
 * only `{ leafIds, value }`, because the bundle never needs a label or a depth. Rendering from it would
 * produce an unindented tree of blank rows.
 *
 * `indexTree` already returns exactly what a flat renderer needs — every node in pre-order, each with
 * its ancestor path — so depth is `ancestorPath.length - 1`, the label is the node's own, and the
 * bundle's candidate shape is irrelevant to rendering. The two concerns are not the same list, so
 * `HierarchicalPicker.test.ts` pins that their orderings agree.
 *
 * ### Why `role="checkbox"` and not a toggle button
 *
 * `aria-pressed` has no mixed value. A row styled as a button therefore cannot announce a partial
 * state, and a screen-reader user would hear a half-selected country as either fully on or fully off.
 * `role="checkbox"` carries `aria-checked="mixed"`, so the tri-state survives into the accessibility
 * tree. The element stays a `<button>` for focus and keyboard behavior — only the role changes.
 */
import {
	ariaCheckedFor,
	hasChildren,
	type IndexedNode,
	indexTree,
	isRowVisible,
	type PickerTreeNode,
	resolveNodeState,
	toggleNodeSelection,
} from '@filter-enginez/examples-shared/picker';
import { computed, reactive } from 'vue';

const props = withDefaults(
	defineProps<{
		/**
		 * Accessible name for the tree group, e.g. `'Origin'` or `'Location'`.
		 *
		 * @remarks
		 * `groupLabel`, not `ariaLabel` — see the note on `<ResultGrid>`'s `listLabel`. A template
		 * `aria-label` binding is matched against the global HTML aria typing before a prop of that name,
		 * so a REQUIRED `ariaLabel` reads as never supplied. `RangeSlider` (`sliderLabel`) and
		 * `SearchInput` (`inputLabel`) follow the same convention.
		 */
		groupLabel: string;
		/**
		 * Node id → projected result count, from the engine's predictive-disable bundle.
		 *
		 * @remarks
		 * How many RECORDS a node covers — the number the user gets after clicking. Not the count of
		 * leaf NODES beneath it, which is a different quantity and was visibly wrong when the Svelte
		 * picker rendered it: a country with one leaf region beneath it read `1` and produced two
		 * results. Only the engine knows the record count; the tree knows only its own shape.
		 *
		 * Empty before the first bundle settles, so rows render no badge rather than a number about to
		 * change.
		 */
		counts: ReadonlyMap<string, number>;
		/** Node ids whose selection would empty the result set. Empty means "no information". */
		disabled: ReadonlySet<string>;
		/** Scroll-viewport height, as a CSS length. A per-panel choice — see `.fe-tree` in ui-styles. */
		maxHeight?: string;
		/** The current selection, compact: the highest selected node on each branch, never the closure. */
		selected: readonly string[];
		/** The tree root. Its own row is never rendered; it is a container for the top level. */
		tree: PickerTreeNode;
	}>(),
	{
		maxHeight: '16rem',
	},
);

const emit = defineEmits<{
	/** Emitted with the WHOLE next selection — one click can cascade a subtree or de-cascade an ancestor. */
	change: [next: readonly string[]];
}>();

// Rebuilt only when the tree identity changes — the corpus is immutable post-boot, so in practice this
// runs once.
const index = computed(() => indexTree(props.tree));
const selectedSet = computed(() => new Set(props.selected));

/**
 * Every renderable row, in pre-order, root excluded.
 *
 * @remarks
 * `indexTree` inserts as it walks, so `Map` insertion order IS pre-order — a parent precedes its
 * descendants, which is the only order a flat rendering of a hierarchy can be read in. The root is
 * dropped because it is a container nobody selects; its children are the top level.
 */
const rows = computed(() => [...index.value.values()].filter((entry) => entry.node.id !== props.tree.id));

/**
 * Which parents are open. Starts EMPTY — everything collapsed but the top level.
 *
 * @remarks
 * A tree here can run to ~700 nodes. Rendering it fully expanded would make the opening rows all
 * sub-regions of the first few countries — a flat wall of unfamiliar names, with most countries far
 * enough down that nobody would scroll to them.
 *
 * Expansion is LOCAL state, deliberately not lifted: it is a view preference, not filter state.
 * Putting it in the engine would push it into the shareable URL, so a copied link would restore
 * someone else's scroll-and-open choices along with their filters.
 *
 * `reactive(new Set())` rather than a `ref` holding a plain `Set`: Vue's collection proxy tracks
 * per-entry, so opening one branch re-renders that branch. A plain `Set` inside a `ref` would need
 * replacing wholesale on every click to be seen at all — the same reason Svelte reaches for
 * `SvelteSet` here.
 */
const expanded = reactive(new Set<string>());

/**
 * Toggle one parent's disclosure.
 *
 * @param id - The node id.
 */
function toggleExpanded(id: string): void {
	if (!expanded.delete(id)) {
		expanded.add(id);
	}
}

/**
 * The rows that actually render.
 *
 * @remarks
 * No cap. A fully expanded tree of ~700 rows would be a real DOM cost, but collapsing solves that at
 * the source: the default view is a dozen top-level nodes, and the count only grows as the user
 * deliberately opens branches.
 *
 * A cap on top of collapsing is worse than either alone, because it truncates SILENTLY. Open three
 * large branches and rows would simply stop appearing, with nothing on screen to say why. This is a
 * scroll container, so if depth ever costs too much, windowing is the honest answer rather than a
 * hidden limit.
 */
const visible = computed(() => rows.value.filter((entry) => isRowVisible(entry.ancestorPath, expanded, props.tree.id)));

/** The node's tri-state, resolved through its ancestors. */
function stateFor(entry: IndexedNode): ReturnType<typeof resolveNodeState> {
	return resolveNodeState(entry.node, entry.ancestorPath, selectedSet.value);
}

/**
 * Whether the row is hard-disabled.
 *
 * @remarks
 * A checked row stays clickable so it can be deselected; only a row that is NOT already contributing
 * gets disabled. Without that escape hatch a user who filtered themselves into a corner would have no
 * way back out.
 */
function isDisabledRow(entry: IndexedNode): boolean {
	return stateFor(entry) !== 'checked' && props.disabled.has(entry.node.id);
}
</script>

<template>
	<!-- `--fe-tree-max-height` rather than a scoped height rule: the whole point of rendering `.fe-tree*`
	     is that this component contributes markup and nothing else. -->
	<div class="fe-tree" role="group" :aria-label="groupLabel" :style="{ '--fe-tree-max-height': maxHeight }">
		<!--
			The row is a DIV holding two sibling buttons, not one button. Nesting a disclosure button
			inside the selection button would be invalid HTML and would fire both handlers on one click.

			The indent is inline because this rendering is FLAT — there is no DOM nesting for a constant
			step to accumulate through, which is how React gets the same result from `.fe-tree__children`.
		-->
		<div
			v-for="entry in visible"
			:key="entry.node.id"
			class="fe-tree__row"
			:class="{
				'fe-tree__row--disabled': isDisabledRow(entry),
				'fe-tree__row--leaf': !hasChildren(entry.node),
			}"
			:style="{ paddingLeft: `${(entry.ancestorPath.length - 1) * 0.875}rem` }"
		>
			<button
				v-if="hasChildren(entry.node)"
				type="button"
				class="fe-tree__chevron fe-tree__toggle"
				:aria-expanded="expanded.has(entry.node.id)"
				:aria-label="expanded.has(entry.node.id) ? `Collapse ${entry.node.label}` : `Expand ${entry.node.label}`"
				@click="toggleExpanded(entry.node.id)"
			>
				<!--
					A plus that BECOMES a minus: two bars, and the vertical one rotates onto the horizontal.
					Swapping "+" and "−" glyphs would jump; rotating a bar is a continuous change, so the icon
					reads as one thing changing state rather than two icons trading places. Purely decorative —
					`aria-expanded` and `aria-label` carry the meaning.
				-->
				<span class="fe-tree__pm" :class="{ 'fe-tree__pm--open': expanded.has(entry.node.id) }" aria-hidden="true">
					<span class="fe-tree__pm-bar" />
					<span class="fe-tree__pm-bar fe-tree__pm-bar--pivot" />
				</span>
			</button>

			<button
				type="button"
				role="checkbox"
				:aria-checked="ariaCheckedFor(stateFor(entry))"
				class="fe-tree__control"
				:class="{
					'fe-tree__control--checked': stateFor(entry) === 'checked',
					'fe-tree__control--mixed': stateFor(entry) === 'mixed',
				}"
				:disabled="isDisabledRow(entry)"
				:title="isDisabledRow(entry) ? `No matches for ${entry.node.label} given your other filters` : undefined"
				@click="emit('change', toggleNodeSelection(entry.node, entry.ancestorPath, selected))"
			>
				<!-- Rendered only when checked or mixed. A permanently-visible empty box reads as a control
				     switched OFF; absence reads as "not chosen", which is what unchecked means. -->
				<span class="fe-tree__mark" aria-hidden="true">
					<template v-if="stateFor(entry) === 'checked'">✓</template>
					<template v-else-if="stateFor(entry) === 'mixed'">–</template>
				</span>
				<span
					class="fe-tree__label"
					:class="{
						'fe-tree__label--checked': !isDisabledRow(entry) && stateFor(entry) === 'checked',
						'fe-tree__label--disabled': isDisabledRow(entry),
						'fe-tree__label--indeterminate': !isDisabledRow(entry) && stateFor(entry) === 'mixed',
					}"
				>
					{{ entry.node.label }}
				</span>
				<span v-if="counts.has(entry.node.id)" class="fe-tree__count">{{ counts.get(entry.node.id) }}</span>
			</button>
		</div>
	</div>
</template>
