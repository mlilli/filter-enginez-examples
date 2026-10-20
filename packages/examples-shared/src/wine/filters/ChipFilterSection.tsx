/**
 * `<ChipFilterSection />` — parameterized container for an exclusion-aware `InSetRule` chip group.
 *
 * @remarks
 * One generic container for the Color / Body / Sweetness sections, which are identical save for rule
 * id, vocabulary, and label formatting. Varietal is NOT covered here — it's
 * a high-cardinality `CheckboxList` with a data-derived vocabulary, so it keeps its own
 * `<VarietalFilterSection />`.
 *
 * **Seed and adopt.** The selection is SEEDED from the committed rule (so a `?f` restore or a JSON
 * config arrives with the right chips lit) and RE-ADOPTED whenever that rule changes from outside, so
 * a clear-all or a removed header chip reaches the control. In between, a click paints the chip
 * immediately rather than waiting for the worker round-trip to confirm. That is the pattern name —
 * `<WineChipSection>` in the SvelteKit vertical is the same shape, and its docblock carries the
 * argument for why a pure derivation is wrong on a worker-backed route.
 *
 * The `sameSelection` guard makes a referentially-new-but-equal engine value a no-op, so an engine
 * echo of the chip the user just painted never replaces it. **It is safe here and is NOT portable to
 * Svelte:** `useSeedAndAdopt` compares only the ENGINE value against the one it last adopted, so
 * adoption fires on engine-side changes alone, where an `$effect` that read `selected` would re-run
 * on a local click, see the still-stale engine value, and snap the chip straight back.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { inSet, type InSetRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { ChipToggleGroup } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { useSeedAndAdopt } from '../../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../../scheduling/index.js';
import { toggleSetValue } from '../../selection/index.js';
import { markUserAction } from '../engineBusy.js';
import { useBundleChipExclusion } from './filterBundle.js';
import { EMPTY_SELECTION, sameSelection } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';
import { useLeaveExpressionMode } from './smartFilterSelection.js';

/**
 * Props for `<ChipFilterSection />`.
 */
export interface ChipFilterSectionProps<T extends string> {
	/** Rule id + bundle chip-group key (`color` / `body` / `sweetness`). */
	readonly ruleId: 'body' | 'color' | 'sweetness';
	/** Section label. */
	readonly label: string;
	/** The full, hand-ordered vocabulary of selectable values. */
	readonly options: readonly T[];
	/** Optional per-chip label formatter (e.g. `medium-full` → `medium full`). */
	readonly formatLabel?: (value: T) => string;
	/** Show projected-count badges on unselected chips. */
	readonly showCount?: boolean;
}

/**
 * An exclusion-aware InSet chip-toggle section.
 */
export const ChipFilterSection = <T extends string>(props: ChipFilterSectionProps<T>): React.ReactElement => {
	const { formatLabel, label, options, ruleId, showCount: shouldShowCount = false } = props;
	const engine = useFilterEngine<Wine>();
	// A facet edit drops any active preset first: see `smartFilterSelection.ts`.
	const leaveExpressionMode = useLeaveExpressionMode();
	const rule = useRule(ruleId) as InSetRule<T> | undefined;
	const engineSelected: readonly T[] = rule?.config.set ?? EMPTY_SELECTION;
	const [selected, setSelected] = useSeedAndAdopt<readonly T[]>(engineSelected, sameSelection);
	const exclusion = useBundleChipExclusion(ruleId);

	const handleToggle = useCallback((value: T): void => {
		const next = toggleSetValue(selected, value);

		leaveExpressionMode();
		// Paint the chip's new state first, then disable+loader, then the engine — each its own frame.
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, inSet<T>(ruleId, next)),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, ruleId, selected, setSelected, leaveExpressionMode]);

	return (
		<section>
			<SectionHeader label={label} />
			<ChipToggleGroup<T>
				options={options}
				selected={selected}
				onToggle={handleToggle}
				exclusion={exclusion}
				showCount={shouldShowCount}
				{...(formatLabel !== undefined ? { formatLabel } : {})}
			/>
		</section>
	);
};
