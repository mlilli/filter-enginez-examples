/**
 * `deriveWineFacets` — everything a wine panel needs that is not the engine, derived from the booted
 * corpus in one place.
 *
 * @remarks
 * ### Why this is shared rather than per-vertical
 *
 * Angular, Vue, SvelteKit and vanilla all need it, and per-vertical copies would be identical — **right
 * down to a private `derive()` helper with the same name and the same three arguments in each.** The
 * house duplication rule is explicit that two uses is a smell and three is a mandate.
 *
 * Nothing about it is framework-specific. It takes records and returns plain data — no engine,
 * no signals, no DI — which is also why it is testable without a worker. That matters more on this
 * dataset than any other, because the real corpus only exists behind Comlink.
 *
 * ### What each vertical still owns
 *
 * How the result is HELD: Angular puts it in an `InjectionToken`, Vue in a `shallowRef`, SvelteKit
 * in `$state.raw`, vanilla in a closure. That part is genuinely per-framework and stays there.
 *
 * @packageDocumentation
 */

import { buildOriginTree, type Wine } from '@filter-enginez/mock-data/wine';
import {
	deriveBaselineBounds,
	type NumericBounds,
	type PickerTreeNode,
} from '@filter-enginez/react-ui/bounds';

// The vocabulary helpers live at the neutral address a cross-dataset helper needs, alongside `./picker`.
import { orderTreeByFrequency, rankByFrequency, uniqueSorted } from '../../vocabulary/index.js';
import {
	buildOriginNodeSpecs,
	type OriginNodeSpec,
	type WineChipVocabularies,
} from './bundle.js';
import {
	FALLBACK_BOUNDS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
	type SliderFieldId,
} from './filterConfig.js';

/** Everything a wine panel needs that is not the engine. */
export interface WineFacets {
	/** Per-slider full-corpus extents. */
	readonly baselines: Record<SliderFieldId, NumericBounds>;
	/** The flattened origin tree — every node plus the leaf ids selecting it would activate. */
	readonly originSpecs: readonly OriginNodeSpec[];
	/**
	 * The origin tree itself, kept alongside the flattened specs.
	 *
	 * @remarks
	 * The picker renders FLAT (indent by `depth`) but its selection semantics are hierarchical —
	 * clicking a country selects its subtree, and a partly-selected country renders mixed. A flat list
	 * has no ancestry to consult, so the tree travels with it.
	 */
	readonly originTree: PickerTreeNode;
	/** The chip vocabularies the corpus actually contains. */
	readonly vocabularies: WineChipVocabularies;
}

/**
 * Derive one slider's baseline bounds from the corpus.
 *
 * @param field - The slider's field id.
 * @param corpus - The booted corpus.
 * @returns Tight bounds over the real data.
 */
function deriveBounds(field: SliderFieldId, corpus: readonly Wine[]): NumericBounds {
	return deriveBaselineBounds(
		corpus.map(SLIDER_FIELD_GETTERS[field]),
		FALLBACK_BOUNDS[field],
		SLIDER_STEPS[field],
	);
}

/**
 * The origin picker's tree, most-reviewed places first at every level.
 *
 * @remarks
 * `buildOriginTree` orders alphabetically, which opens the list on Argentina and Armenia and files the
 * US — four wines in ten — near the bottom. Every wine panel builds its tree through this one function,
 * so the six apps list origins in the same order.
 *
 * @param corpus - The records the engine actually holds.
 * @returns The tree, re-ordered by wine count at every level.
 */
export function buildWineOriginTree(corpus: readonly Wine[]): PickerTreeNode {
	// `buildOriginTree` returns a root without a `label` (nothing renders the root), so it is
	// structurally narrower than `PickerTreeNode`. Every vertical cast here for the same reason.
	const tree = buildOriginTree(corpus) as unknown as PickerTreeNode;

	return orderTreeByFrequency(tree, corpus.map((wine) => wine.originId));
}

/**
 * The varietal vocabulary, most-reviewed grapes first.
 *
 * @remarks
 * The data names hundreds of varieties; alphabetically the list opens on grapes a handful of bottles
 * carry. Ranked by count it opens on Pinot Noir, Chardonnay and Cabernet Sauvignon. Shared by every
 * wine panel, so all six apps list varietals in the same order.
 *
 * @param corpus - The records the engine actually holds.
 * @returns Each varietal once, by descending wine count.
 */
export function rankWineVarietals(corpus: readonly Wine[]): readonly string[] {
	return rankByFrequency(corpus.map((wine) => wine.varietal));
}

/**
 * Derive every facet the panel needs, in one pass per field over the booted corpus.
 *
 * @remarks
 * Pure, and takes records rather than an engine, so it is testable without a worker.
 *
 * **Pass the corpus the ENGINE holds**, not a fresh import. `buildOriginTree()` defaults to the
 * bundled 10k tier, so deriving from the import rather than from `core.getSourceData()` would build
 * an origin picker for a corpus the engine is not filtering — a tree missing every region that only
 * appears in the 150,000-wine set, with no error to say so.
 *
 * @param corpus - The records the engine actually holds.
 * @returns The derived facets.
 */
export function deriveWineFacets(corpus: readonly Wine[]): WineFacets {
	const originTree = buildWineOriginTree(corpus);

	return {
		baselines: {
			abv: deriveBounds('abv', corpus),
			points: deriveBounds('points', corpus),
			price: deriveBounds('price', corpus),
			vintage: deriveBounds('vintage', corpus),
		},
		originSpecs: buildOriginNodeSpecs(originTree),
		originTree,
		vocabularies: {
			body: uniqueSorted(corpus.map((wine) => wine.body)),
			color: uniqueSorted(corpus.map((wine) => wine.color)),
			sweetness: uniqueSorted(corpus.map((wine) => wine.sweetness)),
			varietal: rankWineVarietals(corpus),
		},
	};
}
