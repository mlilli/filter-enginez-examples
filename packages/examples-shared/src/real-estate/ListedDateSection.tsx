/**
 * `<ListedDateSection />` — "how recently was it listed" preset picker (`DateRangeRule`).
 *
 * @remarks
 * Exercises the `DateRangeRule` presets (resolved relative to `Date.now()` at evaluation time, so
 * "last 7 days" stays current). A row of `fe-chip` buttons commits `dateRange('listedDate', { preset })`;
 * "Any time" removes the rule (empty = no constraint). The markup is every app's: the chips sit in a
 * `role="group"` named by `REAL_ESTATE_LISTED_DATE_LABEL`, the active one carries `fe-chip--selected`,
 * and its `aria-pressed` — not color alone — carries the selected state.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { dateRange, type DateRangeRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { useCallback, useState } from 'react';

import { commitFilterMutation } from '../scheduling/index.js';
import { markUserAction } from './engineBusy.js';
import {
	coerceDatePreset,
	DATE_PRESET_OPTIONS,
	type DatePresetValue,
} from './real-estate-domain/filterConfig.js';
import { REAL_ESTATE_LISTED_DATE_LABEL } from './real-estate-domain/panelCopy.js';
import { SectionHeader } from './RealEstateFilterSections.js';

/** Rule id + registry key for the listed-date rule. */
const LISTED_DATE_RULE_ID = 'listed-date';

/**
 * The listed-date preset filter section.
 */
export const ListedDateSection = (): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const rule = useRule(LISTED_DATE_RULE_ID) as DateRangeRule | undefined;
	const enginePreset = rule?.config.preset ?? null;
	const [activePreset, setActivePreset] = useState<DatePresetValue | null>(() => coerceDatePreset(enginePreset));
	const [lastSeenEnginePreset, setLastSeenEnginePreset] = useState(enginePreset);

	// Re-sync from the engine on external change (clear-all etc.). Adjusted during render rather than
	// in an effect, so the pills never paint the stale preset first.
	if (enginePreset !== lastSeenEnginePreset) {
		setLastSeenEnginePreset(enginePreset);
		setActivePreset(coerceDatePreset(enginePreset));
	}

	const handlePreset = useCallback((value: DatePresetValue | null): void => {
		commitFilterMutation({
			callEngine: () => {
				if (value === null) {
					engine.core.removeRule(LISTED_DATE_RULE_ID);

					return;
				}
				engine.core.addRule(LISTED_DATE_RULE_ID, dateRange('listedDate', { preset: value }));
			},
			markBusy: markUserAction,
			paintOptimisticUi: () => setActivePreset(value),
		});
	}, [engine]);

	return (
		<section>
			<SectionHeader label={REAL_ESTATE_LISTED_DATE_LABEL} />
			<div className="fe-chip-toggle" role="group" aria-label={REAL_ESTATE_LISTED_DATE_LABEL}>
				<PresetButton
					label="Any time"
					isActive={activePreset === null}
					onSelect={() => handlePreset(null)}
				/>
				{DATE_PRESET_OPTIONS.map((preset) => (
					<PresetButton
						key={preset.value}
						label={preset.label}
						isActive={activePreset === preset.value}
						onSelect={() => handlePreset(preset.value)}
					/>
				))}
			</div>
		</section>
	);
};

/**
 * One preset chip. `aria-pressed` carries the selected state for assistive tech (color is not the
 * sole signal); `fe-chip--selected` paints it.
 *
 * @internal
 */
const PresetButton = (props: {
	readonly isActive: boolean;
	readonly label: string;
	readonly onSelect: () => void;
}): React.ReactElement => {
	const { isActive, label, onSelect } = props;

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={isActive}
			className={`fe-chip${isActive ? ' fe-chip--selected' : ''}`}
		>
			{label}
		</button>
	);
};
