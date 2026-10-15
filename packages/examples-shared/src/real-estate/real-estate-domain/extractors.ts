/**
 * Real-estate boundary field extractors + the location hierarchy tree.
 *
 * @remarks
 * The generated `realEstateFilterConfig` (mock-data) describes the intended filters, but three of its
 * field mappings don't line up with the actual `Listing` shape + the core rule contracts. Rather than
 * fork the well-tested `core` rules or reshape `mock-data`, we bridge at the rule-wiring layer with
 * a `FieldExtractor` function and two id spaces for the location tree:
 *
 *   1. **Geo** — `Listing.coordinates` is `{ lat, lon }`, but `GeoProximityRule` (and the R-tree
 *      `SpatialIndex`) read `{ lat, lng }`. `extractListingCoords` maps `lon → lng`, fixing both the
 *      predicate and the spatial-index build (both flow through the rule's extractor).
 *   2. **Location hierarchy** — the picker addresses nodes by PREFIXED id
 *      (`neighborhood:CO/Greater Denver/Capitol Hill`), because the prefixes keep a state, a metro and
 *      a neighborhood from colliding in one flat selection. The rule and the bundle match the listing's
 *      `locationId` FIELD, the bare `state/metro/neighborhood` path, because a field named by string is
 *      what survives a `?f=` link, JSON and Comlink. {@link toLocationFieldId} is the one translation
 *      between the two, and {@link buildLocationNodeSpecs} applies it to every node.
 *   3. **Features** — modeled in the feature section as a predicate over the `features: string[]`
 *      array (the config's per-feature `feature.pool` boolean paths don't exist on `Listing`), so no
 *      shared extractor is needed for them.
 *
 * The location tree is built by every vertical from the corpus its engine booted from, with
 * {@link buildListingLocationTree}. This module imports only the `Listing` TYPE, with `import type`, so
 * it never loads the dataset: the real-estate barrel generates the 10,000-listing default tier when it
 * is evaluated, and the pages load that tier on demand, never at startup. That also keeps it light
 * enough for `./locationLinks.ts`, which every app's URL layer loads on every route.
 *
 * @packageDocumentation
 */

import type { FieldExtractor, GeoCoords } from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import type { PickerTreeNode } from './pickerTree.js';

/** Node-id prefixes for the location tree — kept as constants so the builder and the translation agree. */
const STATE_PREFIX = 'state:';
const METRO_PREFIX = 'metro:';
const NEIGHBORHOOD_PREFIX = 'neighborhood:';

/** Every prefix {@link toLocationFieldId} strips, one per tree level. */
const LOCATION_NODE_PREFIXES: readonly string[] = [STATE_PREFIX, METRO_PREFIX, NEIGHBORHOOD_PREFIX];

/**
 * One location node in field space: the picker's node id plus every `locationId` value it stands for.
 *
 * @remarks
 * The same shape serves the bundle (an `inSetOfSets` candidate per node) and the committed rule (one
 * set per selected node, `./locationRule.ts`), so a node's projected count is exactly what clicking it
 * yields.
 */
export interface LocationNodeSpec {
	/**
	 * The node's own id and every id beneath it, in pre-order, in FIELD space (unprefixed), matched
	 * against the listing's `locationId`.
	 *
	 * @remarks
	 * Listings sit only at neighborhoods, so the state and metro ids in a set never match a listing;
	 * they are there so that no two nodes share a set. A state with a single metro covers exactly that
	 * metro's neighborhoods, and without its own id the two sets would be equal, so a committed set
	 * could not be read back as the node that was clicked.
	 */
	readonly leafIds: readonly string[];
	/** The picker's node id, echoed back by the bundle and used for `disabledNodes`. */
	readonly value: string;
}

/**
 * Translate a picker node id into the `locationId` field space by dropping its level prefix.
 *
 * @remarks
 * `neighborhood:CO/Greater Denver/Capitol Hill` becomes `CO/Greater Denver/Capitol Hill`, the
 * listing's own `locationId`; `metro:CO/Greater Denver` and `state:CO` become `CO/Greater Denver` and
 * `CO`. An id with no known prefix (the tree's root, `location`) is returned unchanged.
 *
 * @param nodeId - A node id from {@link buildListingLocationTree}.
 * @returns The same node in field space.
 */
export function toLocationFieldId(nodeId: string): string {
	const prefix = LOCATION_NODE_PREFIXES.find((candidate) => nodeId.startsWith(candidate));

	return prefix === undefined ? nodeId : nodeId.slice(prefix.length);
}

/**
 * Flatten the location tree into one {@link LocationNodeSpec} per node.
 *
 * @remarks
 * Two id spaces meet here, which is the whole subtlety. The PICKER addresses nodes by prefixed id
 * because prefixes keep a state, a metro and a neighborhood from ever colliding in one flat selection
 * set. The BUNDLE and the committed rule match `listing.locationId`, the bare `state/metro/neighborhood`
 * path; it has to be a real field, since a serialized query or a `?f=` link can only name fields by
 * string. So each spec carries both: `value` in picker space and `leafIds` in field space.
 *
 * Emitted in pre-order, a parent before its children, which is also the order each spec lists its
 * own ids in. Each node's subtree is walked once per ancestor; the tree is three levels deep, so that
 * is a handful of passes over a few dozen nodes.
 *
 * @param node - The subtree to flatten. Called with the root.
 * @returns One spec per node, including the node itself.
 */
export function buildLocationNodeSpecs(node: PickerTreeNode): readonly LocationNodeSpec[] {
	return [
		{ leafIds: locationSubtreeFieldIds(node), value: node.id },
		...(node.children ?? []).flatMap((child) => buildLocationNodeSpecs(child)),
	];
}

/**
 * A node's own field-space id followed by every id beneath it, in pre-order.
 *
 * @param node - The subtree's root.
 * @returns The subtree's ids in field space.
 */
function locationSubtreeFieldIds(node: PickerTreeNode): readonly string[] {
	return [toLocationFieldId(node.id), ...(node.children ?? []).flatMap((child) => locationSubtreeFieldIds(child))];
}

/**
 * Geo coordinate extractor — maps a `Listing`'s `{ lat, lon }` to the `{ lat, lng }` shape that
 * `GeoProximityRule` and the R-tree `SpatialIndex` expect. Returns `undefined` for a listing missing
 * numeric coordinates (the rule then treats it as non-matching, mirroring core's own guard).
 *
 * @param item - The candidate item (an unknown until narrowed to `Listing`).
 * @returns The `{ lat, lng }` coordinate, or `undefined` when unavailable.
 */
export const extractListingCoords: FieldExtractor = (item: unknown): GeoCoords | undefined => {
	const coordinates = (item as Listing | null | undefined)?.coordinates;

	if (
		coordinates === undefined ||
		typeof coordinates.lat !== 'number' ||
		typeof coordinates.lon !== 'number'
	) {
		return undefined;
	}

	return { lat: coordinates.lat, lng: coordinates.lon };
};

/**
 * Build the state → metro → neighborhood picker tree from a listing corpus. A leaf's id, with its
 * prefix dropped by {@link toLocationFieldId}, is the `locationId` of the listings that sit there, and
 * each level carries a human `label` for the `HierarchicalPicker`. Sorted at every level for stable,
 * scannable ordering.
 *
 * @param corpus - The listings to derive the hierarchy from.
 * @returns The root `location` node with nested state / metro / neighborhood children.
 */
export function buildListingLocationTree(corpus: readonly Listing[]): PickerTreeNode {
	// state → metro → set<neighborhood>. Built with `??` (never `!`) to satisfy the no-non-null rule.
	const byState = new Map<string, Map<string, Set<string>>>();

	for (const listing of corpus) {
		const byMetro = byState.get(listing.state) ?? new Map<string, Set<string>>();

		byState.set(listing.state, byMetro);
		const neighborhoods = byMetro.get(listing.metroArea) ?? new Set<string>();

		byMetro.set(listing.metroArea, neighborhoods);
		neighborhoods.add(listing.neighborhood);
	}

	return {
		children: [...byState.entries()]
			.sort(([stateA], [stateB]) => stateA.localeCompare(stateB))
			.map(([state, byMetro]) => ({
				children: [...byMetro.entries()]
					.sort(([metroA], [metroB]) => metroA.localeCompare(metroB))
					.map(([metro, neighborhoods]) => ({
						children: [...neighborhoods]
							.sort((a, b) => a.localeCompare(b))
							.map((neighborhood) => ({
								id: `${NEIGHBORHOOD_PREFIX}${state}/${metro}/${neighborhood}`,
								label: neighborhood,
							})),
						id: `${METRO_PREFIX}${state}/${metro}`,
						label: metro,
					})),
				id: `${STATE_PREFIX}${state}`,
				label: state,
			})),
		id: 'location',
		label: 'Location',
	};
}
