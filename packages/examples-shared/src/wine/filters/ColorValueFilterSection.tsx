/**
 * `<ColorValueFilterSection />` — a single-select `ValueRule` demo over a wine's `color`.
 *
 * @remarks
 * Where `<ChipFilterSection ruleId="color" />` commits a MULTI-select `InSetRule` (any of N colors),
 * this section commits a `ValueRule` — an EXACT single-value match on the same `color` field. It's
 * the demo's showcase for `ValueRule`, the simplest rule in the catalog: its `config` IS the
 * target value, and `undefined` means "no constraint". Selecting the placeholder "any" option
 * removes the rule outright (a cleaner devtools story than committing a no-op `value(field,
 * undefined)`).
 *
 * Both this and the color chips can be active at once — they simply AND together (exact-color ∩
 * one-of-colors), a compact way to watch two rule types cooperate on one field.
 *
 * @packageDocumentation
 */

import type { Wine, WineColor } from '@filter-enginez/mock-data/wine';

import { value, type ValueRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { SelectMenu, type SelectOption } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { COLOR_ORDER } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';
import { useLeaveExpressionMode } from './smartFilterSelection.js';

/** Rule id + registry key for the single-color ValueRule. */
const COLOR_VALUE_RULE_ID = 'color-value';

/** The color options, derived once from the hand-ordered vocabulary. */
const COLOR_OPTIONS: readonly SelectOption[] = COLOR_ORDER.map((color) => ({ label: color, value: color }));

/**
 * A single-select ValueRule section over a wine's exact `color`.
 */
export const ColorValueFilterSection = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	// A facet edit drops any active preset first: see `smartFilterSelection.ts`.
	const leaveExpressionMode = useLeaveExpressionMode();
	const rule = useRule(COLOR_VALUE_RULE_ID) as ValueRule<WineColor> | undefined;
	const selected: string = rule?.config ?? '';

	const handleChange = useCallback((next: string): void => {
		leaveExpressionMode();
		commitFilterMutation({
			callEngine: () => {
				if (next === '') {
					engine.core.removeRule(COLOR_VALUE_RULE_ID);
				} else {
					engine.core.addRule(COLOR_VALUE_RULE_ID, value<WineColor>('color', next as WineColor));
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, leaveExpressionMode]);

	return (
		<section>
			<SectionHeader label="Single color (exact)" />
			<SelectMenu options={COLOR_OPTIONS} value={selected} onChange={handleChange} ariaLabel="Filter by exact wine color" placeholder="— any color —" />
		</section>
	);
};
