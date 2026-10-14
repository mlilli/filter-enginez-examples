/**
 * `<OriginFilterSection />` — country → province → region → subregion cascading tree picker, over an
 * `InSetofSetsRule`.
 *
 * @remarks
 * The headline UX moment of the wine panel: selecting "France" includes every French wine,
 * "France|Bordeaux" narrows further, and leaf checkboxes pick individual subregions.
 *
 * **The same rule as every other app.** A selection is written by the shared `writeOriginSelection`
 * (`wine-domain/originRule.ts`, which says why that rule is an `InSetofSetsRule`): one set per selected
 * node, holding the node's id and every id beneath it. So a `?f=` link carrying an origin selection
 * reads identically in all six apps, and the count beside each node — the engine's projection of the
 * same set — is exactly what clicking it yields. The picker's compact selection is recovered from the
 * committed sets by `deriveOriginSelection`, as the other apps do.
 *
 * **Tree source.** The tree and its flattened specs come from the panel, which builds them once from
 * the engine's loaded records for the bundle query, NOT from the origin rule's config. The engine does
 * not pre-load filter rules at construction (so the action log shows real `addRule`/`removeRule`
 * entries organically), and an `InSetofSetsRule` carries no tree anyway.
 *
 * @packageDocumentation
 */

import type { InSetofSetsRule } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { HierarchicalPicker, type PickerTreeNode } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { useSeedAndAdopt } from '../../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { deriveOriginSelection, type OriginNodeSpec } from '../wine-domain/bundle.js';
import { ORIGIN_RULE_ID } from '../wine-domain/originLinks.js';
import { writeOriginSelection } from '../wine-domain/originRule.js';
import { useBundleOriginCounts, useBundleOriginDisabledSet } from './filterBundle.js';
import { EMPTY_SELECTION, sameSelection } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';

/** Props for {@link OriginFilterSection}. */
export interface OriginFilterSectionProps {
	/** The origin tree, ordered by wine count, built from the engine's loaded records. */
	readonly tree: PickerTreeNode;
	/** The same tree flattened by `buildOriginNodeSpecs` — the sets a selection commits. */
	readonly specs: readonly OriginNodeSpec[];
}

/**
 * The origin hierarchy filter section.
 *
 * @param props - The tree and its specs; see {@link OriginFilterSectionProps}.
 * @returns The section.
 */
export const OriginFilterSection = ({ specs, tree }: OriginFilterSectionProps): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const rule = useRule(ORIGIN_RULE_ID) as InSetofSetsRule<string> | undefined;
	// Memoized so the adopted value keeps its identity until the rule or the tree changes —
	// `useSeedAndAdopt` treats a new array as a new commit.
	const engineSelected = useMemo<readonly string[]>(
		() => (rule === undefined ? EMPTY_SELECTION : deriveOriginSelection(rule.config.set, specs)),
		[rule, specs],
	);
	// Optimistic local state — the picker re-renders with the new checked state the instant the
	// user clicks a node, before the engine round-trip confirms.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameSelection);

	const handleChange = useCallback((nextSelected: readonly string[]): void => {
		// Paint the tree's new checked state first, then disable+loader, then the engine.
		commitFilterMutation({
			callEngine: () => writeOriginSelection(engine.core, nextSelected, specs),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(nextSelected),
		});
	}, [engine, setSelected, specs]);

	// Disabled-node set from the bundle's `origin` chip group — every tree node whose subtree would
	// yield 0 results given the engine's currently-active OTHER rules. Selected nodes always stay
	// clickable so the user can deselect to escape.
	const disabledNodes = useBundleOriginDisabledSet();
	// Same bundle, same reason: only the engine knows how many wines a node covers.
	const nodeCounts = useBundleOriginCounts();

	return (
		<section>
			<SectionHeader label="Origin" />
			<HierarchicalPicker
				tree={tree}
				selected={selected}
				onChange={handleChange}
				disabledNodes={disabledNodes}
				nodeCounts={nodeCounts}
			/>
		</section>
	);
};
