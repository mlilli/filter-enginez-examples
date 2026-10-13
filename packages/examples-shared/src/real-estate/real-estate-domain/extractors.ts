/**
 * Real-estate boundary field extractors + the location hierarchy tree.
 *
 * @remarks
 * The generated `realEstateFilterConfig` (mock-data) describes the intended filters, but three of its
 * field mappings don't line up with the actual `Listing` shape + the core rule contracts. Rather than
 * fork the well-tested `core` rules or reshape `mock-data`, we bridge at the rule-wiring layer with
 * `FieldExtractor` functions:
 *
 *   1. **Geo** — `Listing.coordinates` is `{ lat, lon }`, but `GeoProximityRule` (and the R-tree
 *      `SpatialIndex`) read `{ lat, lng }`. `extractListingCoords` maps `lon → lng`, fixing both the
 *      predicate and the spatial-index build (both flow through the rule's extractor).
 *   2. **Location hierarchy** — a `HierarchicalRule` matches by exact string equality between the
 *      extracted field value and a tree node id. `Listing` carries separate `state` / `metroArea` /
 *      `neighborhood` strings and no composite id, so `extractListingLocationId` synthesizes the leaf
 *      id (`neighborhood:{state}/{metro}/{neighborhood}`) that {@link buildListingLocationTree}'s
 *      leaves use — the two are kept in lockstep here in one file.
 *   3. **Features** — modeled in the feature section as a predicate over the `features: string[]`
 *      array (the config's per-feature `feature.pool` boolean paths don't exist on `Listing`), so no
 *      shared extractor is needed for them.
 *
 * @packageDocumentation
 */

import type { FieldExtractor, GeoCoords } from '@filter-enginez/core';

import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';

import type { PickerTreeNode } from './pickerTree.js';

/** Node-id prefixes for the location tree — kept as constants so extractor + builder agree. */
const STATE_PREFIX = 'state:';
const METRO_PREFIX = 'metro:';
const NEIGHBORHOOD_PREFIX = 'neighborhood:';

/**
 * One `inSetOfSets` bundle candidate: a tree node plus every `locationId` selecting it would match.
 */
export interface LocationNodeSpec {
	/** Descendant leaf values, matched against the listing's `locationId` FIELD (so, unprefixed). */
	readonly leafIds: readonly string[];
	/** The picker's node id, echoed back by the bundle and used for `disabledNodes`. */
	readonly value: string;
}

/**
 * Flatten the location tree into predictive-disable candidates.
 *
 * @remarks
 * Two id spaces meet here, which is the whole subtlety. The PICKER addresses nodes by prefixed id
 * (`neighborhood:CO/Greater Denver/Capitol Hill`) because prefixes keep a state, a metro and a
 * neighborhood from ever colliding in one flat selection set. The BUNDLE matches
 * `listing.locationId`, which is the bare `state/metro/neighborhood` path — it has to be a real
 * field, since a serialized query can only name fields by string.
 *
 * So each candidate carries both: `value` in picker space (echoed back, fed to `disabledNodes`) and
 * `leafIds` in field space. Stripping the prefix is the only translation needed.
 *
 * @param node - The subtree to flatten. Called with the root.
 * @returns One candidate per node, including the node itself.
 */
export function buildLocationNodeSpecs(node: PickerTreeNode): readonly LocationNodeSpec[] {
	const specs: LocationNodeSpec[] = [];

	/** Collect a node's descendant leaf ids in FIELD space, recording a candidate on the way out. */
	function walk(current: PickerTreeNode): readonly string[] {
		const children = current.children ?? [];

		if (children.length === 0) {
			const leaf = current.id.startsWith(NEIGHBORHOOD_PREFIX)
				? current.id.slice(NEIGHBORHOOD_PREFIX.length)
				: current.id;

			specs.push({ leafIds: [leaf], value: current.id });

			return [leaf];
		}

		const descendants = children.flatMap((child) => walk(child));

		specs.push({ leafIds: descendants, value: current.id });

		return descendants;
	}

	walk(node);

	return specs;
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
 * Location-id extractor — synthesizes the composite leaf id
 * (`neighborhood:{state}/{metro}/{neighborhood}`) a listing sits at, so a `HierarchicalRule` can
 * match it against a selected ancestor node in {@link listingLocationTree}. Returns `undefined` when
 * any path segment is missing (the rule treats non-strings as non-matching).
 *
 * @param item - The candidate item (an unknown until narrowed to `Listing`).
 * @returns The composite leaf-node id, or `undefined` when a path segment is missing.
 */
export const extractListingLocationId: FieldExtractor = (item: unknown): string | undefined => {
	const listing = item as Listing | null | undefined;

	if (
		listing === undefined ||
		listing === null ||
		typeof listing.state !== 'string' ||
		typeof listing.metroArea !== 'string' ||
		typeof listing.neighborhood !== 'string'
	) {
		return undefined;
	}

	return `${NEIGHBORHOOD_PREFIX}${listing.state}/${listing.metroArea}/${listing.neighborhood}`;
};

/**
 * Build the state → metro → neighborhood picker tree from a listing corpus. Node ids match what
 * {@link extractListingLocationId} produces at the leaf, and each level carries a human `label` for
 * the `HierarchicalPicker` (core's `TreeNode` ignores the extra field). Sorted at every level for
 * stable, scannable ordering.
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

/**
 * The location tree derived once from the default-tier corpus — the ready-to-render input for the
 * `HierarchicalPicker` and the `hierarchical(...)` rule's `tree` config.
 */
export const listingLocationTree: PickerTreeNode = buildListingLocationTree(listings);
