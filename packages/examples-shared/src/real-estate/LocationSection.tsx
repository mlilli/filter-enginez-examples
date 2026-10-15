/**
 * `<LocationSection />` — state → metro → neighborhood cascading tree picker.
 *
 * @remarks
 * The location analogue of wine's origin picker: selecting a state includes every listing in it;
 * drilling to a metro or neighborhood narrows further.
 *
 * **The same rule as every other app.** A selection is written by the shared `writeLocationSelection`
 * (`real-estate-domain/locationRule.ts`, which says why that rule is an `InSetofSetsRule` over the
 * listing's `locationId`): one set per selected node, holding the node's id and every id beneath it.
 * So a `?f=` link carrying a location selection reads identically in all six apps and survives a page
 * reload, and the picker's selection is read back out of the committed sets by
 * `deriveLocationSelection`, as the other apps do.
 *
 * ### Predictive disable, and the two id spaces it straddles
 *
 * Nodes whose selection would empty the results render hard-disabled, via the bundle's
 * `inSetOfSets` candidates, which are the same specs the rule is built from.
 *
 * The picker addresses nodes by PREFIXED id (`neighborhood:CO/Greater Denver/Capitol Hill`) while the
 * rule and the bundle match the BARE `locationId` path; `buildLocationNodeSpecs` does the one
 * translation between them. Those prefixes are not decoration — neighborhood names collide across
 * metros (`Capitol Hill` is in Seattle and Denver both), so a bare name is not a usable key.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { HierarchicalPicker } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import type { LocationNodeSpec } from './real-estate-domain/extractors.js';
import type { PickerTreeNode } from './real-estate-domain/pickerTree.js';

import { useChipExclusion } from '../filter-bundle/index.js';
import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { markUserAction } from './engineBusy.js';
import { LOCATION_RULE_ID } from './real-estate-domain/locationLinks.js';
import { deriveLocationSelection, writeLocationSelection } from './real-estate-domain/locationRule.js';
import { SectionHeader } from './RealEstateFilterSections.js';

/** Stable empty selection so an unset location rule doesn't churn referential identity. */
const EMPTY_SELECTION: readonly string[] = [];

/** Props for `<LocationSection />`. */
export interface LocationSectionProps {
	/**
	 * The state → metro → neighborhood tree (`buildListingLocationTree` over the booted corpus), which
	 * the picker renders.
	 */
	readonly locationTree: PickerTreeNode;
	/**
	 * The same tree flattened by `buildLocationNodeSpecs`: what the committed rule is built from and
	 * read back through, and what the panel's bundle query projects.
	 */
	readonly locationNodeSpecs: readonly LocationNodeSpec[];
}

/**
 * The location hierarchy filter section.
 */
export const LocationSection = ({ locationNodeSpecs, locationTree }: LocationSectionProps): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const rule = useRule(LOCATION_RULE_ID);
	// Memoized so the adopted value keeps its identity until the rule or the tree changes —
	// `useSeedAndAdopt` treats a new array as a new commit.
	const engineSelected = useMemo<readonly string[]>(
		() => (rule === undefined ? EMPTY_SELECTION : deriveLocationSelection(rule, locationNodeSpecs)),
		[rule, locationNodeSpecs],
	);
	// Optimistic local state — the picker re-renders with the new checked state the instant the user
	// clicks a node, before the engine round-trip confirms.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameSelection);

	const handleChange = useCallback((nextSelected: readonly string[]): void => {
		commitFilterMutation({
			callEngine: () => writeLocationSelection(engine.core, nextSelected, locationNodeSpecs),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(nextSelected),
		});
	}, [engine, locationNodeSpecs, setSelected]);

	const exclusion = useChipExclusion(LOCATION_RULE_ID);
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
