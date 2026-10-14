/**
 * `<VarietalFilterSection />` — high-cardinality varietal filter rendered as a scrollable,
 * exclusion-aware `CheckboxList` (`InSetRule<string>`).
 *
 * @remarks
 * Distinct from the generic `<ChipFilterSection />` on two counts: the vocabulary is data-derived
 * (every varietal in the corpus, most-reviewed first — `rankWineVarietals`) rather than a hand-ordered
 * constant, and the control is a
 * `CheckboxList` (dozens-to-hundreds of options) rather than a chip group. The optimistic-state +
 * `sameSelection` re-sync pattern is the same as the chip sections.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { inSet, type InSetRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { CheckboxList } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { useSeedAndAdopt } from '../../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { rankWineVarietals } from '../wine-domain/facets.js';
import { useBundleChipExclusion } from './filterBundle.js';
import { EMPTY_SELECTION, sameSelection } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';

/**
 * The varietal checkbox-list section.
 */
export const VarietalFilterSection = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const rule = useRule('varietal') as InSetRule<string> | undefined;
	const engineSelected: readonly string[] = rule?.config.set ?? EMPTY_SELECTION;
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameSelection);

	// Varietal vocabulary derived from the full sourceData so the list shows every varietal in the
	// corpus, most-reviewed first, with bundle data telling us which are currently reachable.
	const sourceData = engine.core.getSourceData();
	const allVarietals = useMemo(() => rankWineVarietals(sourceData), [sourceData]);

	const exclusion = useBundleChipExclusion('varietal');

	const handleToggle = useCallback((varietal: string): void => {
		const isSelected = selected.includes(varietal);
		const next = isSelected ? selected.filter((v) => v !== varietal) : [...selected, varietal];

		// Paint the checkbox row first, then disable+loader, then the engine — each its own frame.
		commitFilterMutation({
			callEngine: () => engine.core.addRule('varietal', inSet<string>('varietal', next)),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, selected, setSelected]);

	return (
		<section>
			<SectionHeader label={`Varietal (${allVarietals.length})`} />
			<CheckboxList
				options={allVarietals}
				selected={selected}
				onToggle={handleToggle}
				exclusion={exclusion}
				showCount
			/>
		</section>
	);
};
