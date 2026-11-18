/**
 * `wine-domain/bundle` — the wine panel's predictive-disable query + its wine-specific readers.
 *
 * @remarks
 * The generic readers (`chipExclusionMap`, `fieldBounds`, `bundleHistogramToBuckets`,
 * `toggleWouldBeEmpty`) and the fetch loop (`createBundleFetcher`) are shared and live in
 * `filter-bundle/`. What is genuinely wine's own is here, and it is wine's own for one reason:
 * **the origin picker is a TREE**, so it is queried as `inSetOfSets` rather than `inSet` — every node
 * carries the full set of leaf ids selecting it would activate, and the engine simulates against that
 * set. A country node with three regions has to be disabled when all three would empty the results,
 * which a flat per-value query cannot express.
 *
 * `wineFieldMeta` reads the WHOLE `FilterBundleFieldMeta` rather than just its bounds, because wine's
 * sliders want the bounds and the histogram from the same field and would otherwise walk
 * `bundle.fields` twice. That is an efficiency, not a distinction: books and real estate draw the same
 * histogram overlay in all six verticals.
 *
 * Framework-neutral: no React, no reactive surface. Every wine panel builds the same query from the
 * same helpers, which is what keeps their disable states identical over one corpus — the claim the
 * six-vertical demo exists to make.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleFieldMeta } from '@filter-enginez/core';

import {
	fineHistogramQuery,
	type HistogramBucket,
	type HistogramQuery,
	type NumericBounds,
	type PickerTreeNode,
	rebinHistogram,
	scaledBucketCount,
	sliderBucketCount,
} from '@filter-enginez/react-ui/bounds';

import { fieldHistogram } from '../../filter-bundle/bundleReaders.js';
import { FIELD_VALUE_STEPS, SLIDER_SCALE_SPECS, type SliderFieldId, wineSliderScale } from './filterConfig.js';

/** One tree node's bundle candidate: the node's own id, plus every origin id selecting it would match. */
export interface OriginNodeSpec {
	/** Nesting depth, 0 for a top-level country. Carried so a flat renderer can indent without a walk. */
	readonly depth: number;
	/** Human label for this node alone — the last path segment, not the whole path. */
	readonly label: string;
	/**
	 * Every origin id this node matches: its own id and every id beneath it.
	 *
	 * @remarks
	 * Named for the leaves it was first built from, and it still holds them, but not only them. A wine's
	 * `originId` stops at the deepest level the wine names, and in the real wine data a region can hold
	 * wines with a subregion and wines without one (`US|Oregon|Willamette Valley` and
	 * `US|Oregon|Willamette Valley|Dundee Hills`). Leaves alone would leave those wines unmatched by
	 * their region, their state and their country — and uncounted on every one of those rows. Matching
	 * a node's own id too is what the engine's `HierarchicalRule` does ("the node itself + all
	 * descendants"), so the set-based panels and the rule-based React panel select the same wines.
	 */
	readonly leafIds: readonly string[];
	/** The node id, echoed back so the picker can match its own tree. */
	readonly value: string;
}

/** The chip vocabularies the flat wine facets are queried over. */
export type WineChipVocabularies = Record<'body' | 'color' | 'sweetness' | 'varietal', readonly string[]>;

/**
 * The histogram part of one slider field's bundle query.
 *
 * @remarks
 * A linear field asks for its display buckets directly, aligned to the baseline. A log-scaled field
 * asks for one bucket per value-grid position instead, which {@link wineSliderHistogram} sums into the
 * track's equal slices — the engine draws only equal-width histograms, and a log track's slices are
 * not equal in value.
 *
 * @param field - The slider's field id.
 * @param baseline - The slider's baseline bounds.
 * @returns The histogram fields of the query.
 */
export function wineHistogramQuery(field: SliderFieldId, baseline: NumericBounds): HistogramQuery {
	if (SLIDER_SCALE_SPECS[field].kind === 'linear') {
		return {
			baselineMax: baseline.max,
			baselineMin: baseline.min,
			bucketCount: sliderBucketCount(baseline, FIELD_VALUE_STEPS[field]),
		};
	}

	return fineHistogramQuery(baseline, FIELD_VALUE_STEPS[field]);
}

/**
 * Read one wine slider's histogram from the bundle, as the bars its track draws.
 *
 * @remarks
 * The one call every wine panel makes for its slider bars, so the six apps cannot slice a log track
 * differently. A linear field is `fieldHistogram` unchanged; a log-scaled one is the fine histogram
 * from {@link wineHistogramQuery}, summed into `scaledBucketCount` equal slices of the track.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param field - The slider's field id.
 * @param baseline - The slider's baseline bounds.
 * @param selectedMin - The slider's lower handle.
 * @param selectedMax - The slider's upper handle.
 * @returns The bars; `[]` before the first bundle (the overlay's row is held for them, see
 *   `fieldHistogram`); `undefined` when the field carried no buckets.
 */
export function wineSliderHistogram(
	bundle: FilterBundle | null,
	field: SliderFieldId,
	baseline: NumericBounds,
	selectedMin: number,
	selectedMax: number,
): undefined | readonly HistogramBucket[] {
	const buckets = fieldHistogram(bundle, field, selectedMin, selectedMax);

	if (buckets === undefined || buckets.length === 0 || SLIDER_SCALE_SPECS[field].kind === 'linear') {
		return buckets;
	}
	const scale = wineSliderScale(field, baseline);

	return rebinHistogram(buckets, scale, scaledBucketCount(scale, baseline, FIELD_VALUE_STEPS[field]), selectedMin, selectedMax);
}

/**
 * Build the wine bundle query: four slider fields, four flat chip groups, and the origin tree.
 *
 * @param baselines - Per-slider baseline bounds, so the engine knows each field's full extent.
 * @param chipVocabularies - The candidate values for each flat chip group.
 * @param originNodeSpecs - The origin tree flattened by {@link buildOriginNodeSpecs}.
 * @returns The query to hand to `applyFiltersAndQuery`.
 */
export function buildWineBundleQuery(
	baselines: Record<SliderFieldId, NumericBounds>,
	chipVocabularies: WineChipVocabularies,
	originNodeSpecs: readonly OriginNodeSpec[],
) {
	return {
		chipGroups: [
			{ candidates: chipVocabularies.color, field: 'color', kind: 'inSet' as const, ruleId: 'color' },
			{ candidates: chipVocabularies.body, field: 'body', kind: 'inSet' as const, ruleId: 'body' },
			{ candidates: chipVocabularies.sweetness, field: 'sweetness', kind: 'inSet' as const, ruleId: 'sweetness' },
			{ candidates: chipVocabularies.varietal, field: 'varietal', kind: 'inSet' as const, ruleId: 'varietal' },
			// Origin uses inSetOfSets — each tree node (country/region/leaf) is simulated against its
			// full leaf-id set so the picker can disable any node whose whole subtree would yield zero.
			{ candidates: originNodeSpecs, field: 'originId', kind: 'inSetOfSets' as const, ruleId: 'origin' },
		],
		fields: [
			{ ...wineHistogramQuery('price', baselines.price), fieldKey: 'priceUsd', ruleId: 'price' },
			{ ...wineHistogramQuery('points', baselines.points), fieldKey: 'points', ruleId: 'points' },
			{ ...wineHistogramQuery('abv', baselines.abv), fieldKey: 'abv', ruleId: 'abv' },
			{ ...wineHistogramQuery('vintage', baselines.vintage), fieldKey: 'vintage', ruleId: 'vintage' },
		],
	};
}

/** The query shape {@link buildWineBundleQuery} produces. */
export type WineBundleQuery = ReturnType<typeof buildWineBundleQuery>;

/**
 * Flatten a picker tree into the `inSetOfSets` candidate specs.
 *
 * @remarks
 * Each node's spec carries every leaf id beneath it — exactly what the engine needs to answer "what
 * if the user clicked this node." A branch whose spec held only its OWN id would match no wine (wines
 * carry leaf ids) and would therefore read as permanently unavailable, disabling entire countries.
 *
 * @param tree - The picker's root. Its own id is not emitted; only its descendants.
 * @returns One spec per node, leaves and branches alike.
 */
export function buildOriginNodeSpecs(tree: PickerTreeNode): readonly OriginNodeSpec[] {
	const specs: OriginNodeSpec[] = [];

	/**
	 * Emit this node's spec, then its children's, and return every id at or beneath it.
	 *
	 * @remarks
	 * PRE-order: a parent is emitted before its descendants. The order is user-visible — a flat
	 * renderer draws the array top to bottom, and post-order would put every leaf above its own
	 * country, which is not a hierarchy anyone can read. React renders a real tree component and does
	 * not care; the non-React verticals flatten, and they do.
	 *
	 * @param node - The node to walk.
	 * @param depth - Nesting depth of `node`.
	 * @returns `node`'s own id and every id beneath it.
	 */
	function walk(node: PickerTreeNode, depth: number): readonly string[] {
		if (node.children === undefined || node.children.length === 0) {
			specs.push({ depth, label: node.label, leafIds: [node.id], value: node.id });

			return [node.id];
		}

		// Reserve this node's slot BEFORE descending, so the parent precedes its children even though
		// its own ids are only known afterwards. The node's own id comes first: wines whose origin stops
		// at this level carry it (see `OriginNodeSpec.leafIds`).
		const index = specs.length;
		const leafIds: string[] = [node.id];

		for (const child of node.children) {
			for (const leaf of walk(child, depth + 1)) {
				leafIds.push(leaf);
			}
		}
		specs.splice(index, 0, { depth, label: node.label, leafIds, value: node.id });

		return leafIds;
	}

	if (tree.children) {
		for (const child of tree.children) {
			walk(child, 0);
		}
	}

	return specs;
}

/**
 * A leaf-id set's order-independent identity.
 *
 * @param leafIds - The ids in any order.
 * @returns A key equal for equal sets.
 * @internal
 */
function leafSetKey(leafIds: readonly string[]): string {
	return [...leafIds].sort().join(' ');
}

/**
 * Recover the picker's node selection from a committed `inSetOfSets` rule.
 *
 * @remarks
 * **The inverse of the origin commit, and the reason it is not trivial.** The picker's selection is a
 * list of NODE values; the rule stores an array of LEAF-ID sets, because a branch has to be simulated
 * against every leaf beneath it (a country queried by its own id matches no wine — wines carry leaf
 * ids). That projection is lossy in the direction the panel needs to read: nothing in the committed
 * rule says which node produced a given set.
 *
 * So each committed set is matched back against the specs by set identity, order-independently — a
 * set that has been through JSON and the rule registry carries no ordering guarantee.
 *
 * **Ambiguity is resolved by depth.** Built specs never share a set — a branch's set carries its own
 * id, so even a branch with a single child differs from that child — but a hand-written spec list can.
 * `buildOriginNodeSpecs` emits in PRE-order, so scanning in order and taking the first match yields
 * the SHALLOWEST node, which is what the picker's compact model means by "the highest selected node
 * per branch".
 *
 * A set matching no spec is skipped rather than throwing: the rule can come from a hand-written JSON
 * config naming ids this corpus does not contain, and the honest rendering is the nodes that DO exist.
 *
 * @param committedSets - The rule's `config.set` — one leaf-id array per selected node.
 * @param specs - The flattened tree from {@link buildOriginNodeSpecs}. **Empty before boot**, which
 *   yields an empty selection; a caller seeding a control must not run this until the specs exist, or
 *   it will read a real selection as "nothing selected".
 * @returns The node values to mark selected, in the committed sets' own order.
 */
export function deriveOriginSelection(
	committedSets: readonly (readonly string[])[],
	specs: readonly OriginNodeSpec[],
): readonly string[] {
	if (specs.length === 0) {
		return [];
	}
	// First spec wins per key, so the pre-order walk's shallowest node is the one retained.
	const valueByLeafSet = new Map<string, string>();

	for (const spec of specs) {
		const key = leafSetKey(spec.leafIds);

		if (!valueByLeafSet.has(key)) {
			valueByLeafSet.set(key, spec.value);
		}
	}
	const selected: string[] = [];

	for (const committed of committedSets) {
		const value = valueByLeafSet.get(leafSetKey(committed));

		if (value !== undefined) {
			selected.push(value);
		}
	}

	return selected;
}

/**
 * Read one slider field's FULL metadata — bounds plus histogram.
 *
 * @remarks
 * Distinct from the shared `fieldBounds` reader, which returns bounds only. Wine's sliders draw the
 * distribution inside the track, so they need the histogram too.
 *
 * @param bundle - The current bundle, or `null` before the first resolve.
 * @param ruleId - The slider field's rule id.
 * @returns The field metadata, or `null` when the bundle is absent or did not carry this field.
 */
export function wineFieldMeta(bundle: FilterBundle | null, ruleId: SliderFieldId): FilterBundleFieldMeta | null {
	if (bundle === null) {
		return null;
	}

	return bundle.fields.find((field) => field.ruleId === ruleId) ?? null;
}

/* The origin tree's projected counts and disabled set are `chipProjectedCounts(bundle, 'origin')` /
 * `chipDisabledSet(bundle, 'origin')` from `filter-bundle/bundleReaders`, which `./index.ts`
 * re-exports. Nothing about them is wine-specific beyond the field id; real estate's location tree
 * uses the same two readers over `'location'`. */

/* `bundleHistogramToBuckets` is shared with books and real estate, which draw the same histogram
 * overlay across all six verticals, so it lives in `filter-bundle/bundleReaders` and is re-exported
 * below for wine's own imports. Its neighbor `fieldHistogram` composes it with the field lookup that
 * `wineFieldMeta` does by hand here; wine keeps `wineFieldMeta` because its sliders need the bounds
 * from the SAME field and would otherwise walk `bundle.fields` twice. */
export { bundleHistogramToBuckets } from '../../filter-bundle/bundleReaders.js';
