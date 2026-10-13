<script lang="ts">
	/**
	 * `<WineOriginSection>` — the country → province → region → subregion origin picker.
	 *
	 * @remarks
	 * The headline UX moment of the wine panel, and the only tree facet in the dataset: selecting
	 * "France" includes every French wine, "France|Bordeaux" narrows further, and leaf rows pick
	 * individual subregions.
	 *
	 * ### `inSetofSets`, not `hierarchical`
	 *
	 * React commits a `HierarchicalRule` here; this vertical commits an `InSetofSetsRule` over the
	 * FLATTENED specs, because the same flattening is what the bundle query needs to ask "what if the
	 * user clicked this node" (a country queried by its own id matches no wine — wines carry leaf ids).
	 * `deriveOriginSelection` in `wine-domain/bundle` is the inverse, and the reason it is not trivial:
	 * the projection is lossy, so a committed set is matched back against the specs by set identity.
	 *
	 * ### A writable `$derived`, through the lossy inverse
	 *
	 * Same contract as the other facets — see `<WineChipSection>` for why the derivation has to be
	 * writable on a worker-backed route. What is peculiar here is the conversion:
	 * `deriveOriginSelection` matches each committed leaf-id SET back to the node that produced it,
	 * order-independently, resolving the genuine ambiguity (a branch with one leaf has that leaf's id
	 * set) to the shallowest node, which is what the picker's compact model means by "the highest
	 * selected node per branch".
	 *
	 * `specs` is empty until the corpus lands, and `deriveOriginSelection` reads an empty spec list as
	 * an empty selection — which would blank a restored origin. It is safe here because the route
	 * assigns the engine only after filling the specs, so this never mounts before them.
	 *
	 * ### It reads the bundle context directly
	 *
	 * Both the disabled set and the per-node counts come from `getWineBundle()`. Only the engine's
	 * projection knows how many WINES a node covers; the tree knows only its own shape, and a country
	 * with one leaf region beneath it reads `1` while producing two results.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';
	import {
		chipDisabledSet,
		chipProjectedCounts,
		deriveOriginSelection,
		EMPTY_SELECTION,
		type OriginNodeSpec,
		type PickerTreeNode,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import HierarchicalPicker from '$lib/controls/HierarchicalPicker.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';

	import { getWineBundle } from '../wineBundle.js';
	import { commitSelection } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
		specs,
		tree,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
		/** The flattened tree — every node plus the leaf ids selecting it would activate. */
		specs: readonly OriginNodeSpec[];
		/** The tree itself, for the picker's cascade semantics. `null` until the corpus lands. */
		tree: PickerTreeNode | null;
	} = $props();

	/**
	 * This facet's own rule store, subscribed once at init.
	 *
	 * @remarks
	 * The engine is a prop that never changes for a mounted section, so capturing it once is intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('origin');

	/** The committed rule, or `undefined` when this facet carries none. */
	const committedRule = $derived($ruleStore as InSetofSetsRule<string> | undefined);

	/** The picker's node selection — a WRITABLE `$derived`; see the docblock. */
	let selected = $derived(
		committedRule === undefined ? EMPTY_SELECTION : deriveOriginSelection(committedRule.config.set, specs),
	);

	const bundleContext = getWineBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	/** Nodes whose whole subtree would yield zero results. Empty until the first bundle — all enabled. */
	const disabled = $derived(chipDisabledSet(bundle, 'origin'));

	/** Node id → projected wine count, for the row badges. See the docblock. */
	const counts = $derived(chipProjectedCounts(bundle, 'origin'));
</script>

<section>
	<SectionHeader label="Origin" />
	{#if tree}
		<HierarchicalPicker
			{counts}
			{disabled}
			{selected}
			{tree}
			ariaLabel="Origin"
			onChange={(next) => {
				// The picker hands back the WHOLE next selection rather than one toggled value: a single
				// click can select a subtree, or de-cascade an ancestor into its siblings, so "which id
				// changed" is not expressible. The compact model means `next` holds only the highest
				// selected node per branch.
				leaveExpressionMode();
				selected = next;
				commitSelection(engine, 'origin', selected, (values) => {
					const sets = specs.filter((spec) => values.includes(spec.value)).map((spec) => spec.leafIds);

					return inSetofSets<string>('originId', sets);
				});
			}}
		/>
	{/if}
</section>
