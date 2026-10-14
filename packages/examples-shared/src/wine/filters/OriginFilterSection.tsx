/**
 * `<OriginFilterSection />` — country → province → region → subregion cascading tree picker
 * (`HierarchicalRule`).
 *
 * @remarks
 * The headline UX moment of the wine panel: selecting "France" implicitly includes every French
 * wine via the rule's subtree-walk; "France|Bordeaux" narrows further; leaf checkboxes pick
 * individual subregions.
 *
 * **Tree source.** The tree comes from the mock-data package's canonical `buildOriginTree()`, NOT
 * from the origin rule's config. The engine deliberately does not pre-load filter rules at
 * construction (so the action log shows real `addRule`/`removeRule` entries organically), meaning
 * the origin rule may not exist yet — reading `rule?.config.tree` would be undefined until the first
 * selection. Sourcing from the schema side keeps the picker renderable from first paint and keeps
 * the tree reference stable (`useMemo` keyed on the loaded corpus).
 *
 * @packageDocumentation
 */

import { hierarchical, type HierarchicalRule } from '@filter-enginez/core';
import { type Wine } from '@filter-enginez/mock-data/wine';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { HierarchicalPicker } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { useSeedAndAdopt } from '../../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { buildWineOriginTree } from '../wine-domain/facets.js';
import { useBundleOriginCounts, useBundleOriginDisabledSet } from './filterBundle.js';
import { EMPTY_SELECTION, sameSelection } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';

/**
 * The origin hierarchy filter section.
 */
export const OriginFilterSection = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const rule = useRule('origin') as HierarchicalRule | undefined;
	const engineSelected: readonly string[] = rule?.config.selected ?? EMPTY_SELECTION;
	// Optimistic local state — the picker re-renders with the new checked state the instant the
	// user clicks a node, before the engine round-trip confirms.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameSelection);

	// Built from the engine's loaded records so it reflects the actual tier, and ordered by wine count
	// at every level through the same helper every app's panel uses.
	const sourceData = engine.core.getSourceData();
	const tree = useMemo(() => buildWineOriginTree(sourceData), [sourceData]);

	const handleChange = useCallback((nextSelected: readonly string[]): void => {
		// Paint the tree's new checked state first, then disable+loader, then the engine. Cast
		// through unknown — the tree carries extra `label` fields per node that core's `TreeNode`
		// doesn't declare; HierarchicalRule ignores them at runtime.
		commitFilterMutation({

			callEngine: () => engine.core.addRule('origin', hierarchical('originId', { selected: nextSelected, tree: tree })),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(nextSelected),
		});
	}, [engine, setSelected, tree]);

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
