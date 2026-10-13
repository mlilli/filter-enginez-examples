/**
 * `<ListedDateSection />` — "how recently was it listed" preset picker (`DateRangeRule`).
 *
 * @remarks
 * Exercises the `DateRangeRule` presets (resolved relative to `Date.now()` at evaluation time, so
 * "last 7 days" stays current). A row of pill buttons commits `dateRange('listedDate', { preset })`;
 * "Any time" removes the rule (empty = no constraint). The active preset is cyan (data identity),
 * and the button's `aria-pressed` — not color alone — carries the selected state.
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
import { SectionHeader } from './RealEstateFilterSections.js';

/**
 * The selectable "listed within" presets. `as const` pins each `value` to its literal type so it
 * type-checks against the `DateRangeRule` preset union at the `dateRange(...)` call.
 */
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
			<SectionHeader label="Listed within" />
			<div className="fe-chip-toggle">
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
 * One preset pill button. `aria-pressed` carries the selected state for assistive tech (color is not
 * the sole signal); the active pill is cyan.
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
			className="text-xs"
			style={{
				background: isActive ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
				border: `1px solid ${isActive ? 'var(--accent)' : 'var(--gray-4)'}`,
				borderRadius: '9999px',
				color: isActive ? 'var(--accent)' : 'var(--gray-9)',
				cursor: 'pointer',
				fontFamily: 'var(--font-mono)',
				minHeight: '44px',
				padding: '0 14px',
			}}
		>
			{label}
		</button>
	);
};
