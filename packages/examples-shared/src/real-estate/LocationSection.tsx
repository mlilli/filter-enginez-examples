/**
 * `<LocationSection />` — state → metro → neighborhood cascading tree picker (`HierarchicalRule`).
 *
 * @remarks
 * The location analogue of wine's origin picker: selecting a state implicitly includes every listing
 * in it via the rule's subtree walk; drilling to a metro or neighborhood narrows further. Two
 * real-estate specifics vs. wine: the rule's field is the `extractListingLocationId` FUNCTION
 * extractor (it synthesizes the prefixed leaf path the tree's leaves use), and the tree comes in as a
 * prop, built by the panel from the corpus the engine booted from.
 *
 * ### Predictive disable, and the two id spaces it straddles
 *
 * Nodes whose selection would empty the results render hard-disabled, via the bundle's
 * `inSetOfSets` candidates. Getting there required materializing a `locationId` FIELD on `Listing`:
 * the rule itself can use a function extractor, but a bundle query names its fields by string,
 * because it has to survive Comlink and JSON on the way to the worker and server tiers.
 *
 * So the picker addresses nodes by PREFIXED id (`neighborhood:CO/Greater Denver/Capitol Hill`)
 * while the bundle matches the BARE `locationId` path; `buildLocationNodeSpecs` does the one
 * translation between them. Those prefixes are not decoration — neighborhood names collide across
 * metros (`Capitol Hill` is in Seattle and Denver both), so a bare name is not a usable key.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { hierarchical, type HierarchicalRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { HierarchicalPicker } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import type { PickerTreeNode } from './real-estate-domain/pickerTree.js';

import { useChipExclusion } from '../filter-bundle/index.js';
import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { markUserAction } from './engineBusy.js';
import { extractListingLocationId } from './real-estate-domain/extractors.js';
import { SectionHeader } from './RealEstateFilterSections.js';

/** Stable empty selection so an unset location rule doesn't churn referential identity. */
const EMPTY_SELECTION: readonly string[] = [];

/** Props for `<LocationSection />`. */
export interface LocationSectionProps {
	/**
	 * The state → metro → neighborhood tree (`buildListingLocationTree` over the booted corpus). Both
	 * the picker and the committed `hierarchical(...)` rule read it, so they always agree.
	 */
	readonly locationTree: PickerTreeNode;
}

/**
 * The location hierarchy filter section.
 */
export const LocationSection = ({ locationTree }: LocationSectionProps): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const rule = useRule('location') as HierarchicalRule | undefined;
	const engineSelected: readonly string[] = rule?.config.selected ?? EMPTY_SELECTION;
	// Optimistic local state — the picker re-renders with the new checked state the instant the user
	// clicks a node, before the engine round-trip confirms.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameSelection);

	const handleChange = useCallback((nextSelected: readonly string[]): void => {
		commitFilterMutation({
			callEngine: () => engine.core.addRule(
				'location',
				hierarchical(extractListingLocationId, { selected: nextSelected, tree: locationTree }),
			),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(nextSelected),
		});
	}, [engine, locationTree, setSelected]);

	const exclusion = useChipExclusion('location');
	// A node is disabled only if selecting it would empty the results AND it isn't already selected —
	// the escape-hatch invariant. `HierarchicalPicker` re-checks the same thing for checked nodes, so
	// this is belt-and-braces, but it keeps the set itself honest for anything else reading it.
	const disabledNodes = useMemo(() => {
		const out = new Set<string>();

		for (const [nodeId, meta] of exclusion) {
			if (meta.wouldBeEmpty && !selected.includes(nodeId)) {
				out.add(nodeId);
			}
		}

		return out;
	}, [exclusion, selected]);

	return (
		<section>
			<SectionHeader label="Location" />
			<HierarchicalPicker
				tree={locationTree}
				selected={selected}
				onChange={handleChange}
				disabledNodes={disabledNodes}
			/>
		</section>
	);
};

/**
 * Order-insensitive membership equality for two node-id selections. Lets an external rule change
 * that produces a referentially-new-but-equal set be a no-op (no render churn).
 *
 * @internal
 */
function sameSelection(a: readonly string[], b: readonly string[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}

	return a.every((value) => b.includes(value));
}
