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
 * ### Types only from `@filter-enginez/mock-data/wine`
 *
 * This module runs on every wine page's main thread, and that barrel is the wine DATASET: importing a
 * value from it — or even `import { type Wine }`, which `verbatimModuleSyntax` keeps as a bare
 * side-effect import — bundles the ~215 kB generator and evaluates the module that generates the
 * 10,000-wine default tier at load. So the import below is `import type`, which is erased, and the
 * origin tree is built here from the records' own `originId`s ({@link buildOriginTreeFromOriginIds})
 * rather than by the dataset's `buildOriginTree`. `tests/tooling/mainThreadDatasetImports.test.ts`
 * holds every main-thread module to the same rule.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

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

/** The character joining an origin path's levels in a wine's `originId` (`France|Bordeaux|Pauillac`). */
export const ORIGIN_ID_SEPARATOR = '|';

/** The id of the origin tree's root, which no wine carries and no picker renders. */
export const ORIGIN_TREE_ROOT_ID = 'origin';

/** One node of the tree {@link buildOriginTreeFromOriginIds} assembles, before it is frozen. */
interface OriginTreeDraftNode {
	/** The node's children, by their own path segment, in first-seen order. */
	readonly children: Map<string, OriginTreeDraftNode>;
	/** The path from the root to this node, joined by {@link ORIGIN_ID_SEPARATOR}. */
	readonly id: string;
	/** The node's own path segment. */
	readonly label: string;
}

/**
 * Freeze a draft node into a picker node: a leaf carries no `children` at all.
 *
 * @param draft - The draft node.
 * @returns The picker node and its subtree.
 */
function freezeOriginTreeNode(draft: OriginTreeDraftNode): PickerTreeNode {
	return draft.children.size === 0
		? { id: draft.id, label: draft.label }
		: { children: Array.from(draft.children.values(), freezeOriginTreeNode), id: draft.id, label: draft.label };
}

/**
 * The origin hierarchy the records' own `originId`s describe, as a picker tree.
 *
 * @remarks
 * A wine's `originId` is the path from its country down to the deepest level it names, the levels
 * joined by {@link ORIGIN_ID_SEPARATOR} and empty levels skipped (`Spain|Galicia|Rías Baixas`). Every
 * prefix of that path is a node of the tree, its id the prefix and its label the prefix's last level,
 * so the tree holds exactly the ids the origin rule matches against, at every depth — the same nodes
 * the dataset's own `buildOriginTree` assembles from each wine's `origin` object (`facets.test.ts`
 * compares the two over the 150,000-wine tier).
 *
 * Built here, from the ids, because this runs on the main thread and the dataset's builder is only
 * exported from the barrel that generates the dataset (see the module docblock). Children keep their
 * first-seen order; {@link buildWineOriginTree} orders every level by wine count anyway. An empty
 * `originId`, which names no place, adds no node.
 *
 * @param originIds - One id per record — every wine's `originId`.
 * @returns The tree, rooted at {@link ORIGIN_TREE_ROOT_ID}.
 */
export function buildOriginTreeFromOriginIds(originIds: Iterable<string>): PickerTreeNode {
	const root: OriginTreeDraftNode = { children: new Map(), id: ORIGIN_TREE_ROOT_ID, label: 'Origin' };

	for (const originId of originIds) {
		const levels = originId.split(ORIGIN_ID_SEPARATOR).filter((level) => level.length > 0);
		let parent = root;

		for (const [depth, level] of levels.entries()) {
			const existing = parent.children.get(level);
			const node = existing ?? {
				children: new Map(),
				id: levels.slice(0, depth + 1).join(ORIGIN_ID_SEPARATOR),
				label: level,
			};

			parent.children.set(level, node);
			parent = node;
		}
	}

	// The root always carries a `children` array, empty for an empty corpus, as every picker expects.
	return { children: Array.from(root.children.values(), freezeOriginTreeNode), id: root.id, label: root.label };
}

/**
 * The origin picker's tree, most-reviewed places first at every level.
 *
 * @remarks
 * Ordered alphabetically, the list would open on Argentina and Armenia and file the US — four wines in
 * ten — near the bottom. Every wine panel builds its tree through this one function, so the six apps
 * list origins in the same order.
 *
 * @param corpus - The records the engine actually holds.
 * @returns The tree, re-ordered by wine count at every level.
 */
export function buildWineOriginTree(corpus: readonly Wine[]): PickerTreeNode {
	const originIds = corpus.map((wine) => wine.originId);

	return orderTreeByFrequency(buildOriginTreeFromOriginIds(originIds), originIds);
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
 * **Pass the corpus the ENGINE holds** (`core.getSourceData()`), not the dataset package's bundled
 * 10,000-wine tier. Deriving from that tier would build an origin picker for a corpus the engine is
 * not filtering — a tree missing every region that only appears in the 150,000-wine set, with no
 * error to say so.
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
