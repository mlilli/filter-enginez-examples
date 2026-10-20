/**
 * `<PointsCompareFilterSection />` — a `NumericComparisonRule` demo over a wine's `points` score.
 *
 * @remarks
 * Where `<RangeFilterSection ruleId="points" />` commits a two-sided `RangeRule` (min ≤ points ≤
 * max), this section commits a `NumericComparisonRule` — a ONE-sided operator comparison
 * (`points ≥ 90`, `points = 100`, …). It pairs the two new react-ui controls: a `<SelectMenu />` for
 * the operator and a `<NumberField />` for the threshold. The operator's placeholder "off" option
 * removes the rule; the threshold is mirrored in local state so it survives the off state (so the
 * number the user typed is still there when they later pick an operator).
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { numCompare, type NumericComparisonOp, type NumericComparisonRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { NumberField, SelectMenu, type SelectOption } from '@filter-enginez/react-ui';
import { useCallback, useState } from 'react';

import { commitFilterMutation } from '../../scheduling/index.js';
import { markUserAction } from '../engineBusy.js';
import { SectionHeader } from './SectionHeader.js';
import { useLeaveExpressionMode } from './smartFilterSelection.js';

/** Rule id + registry key for the points NumericComparisonRule. */
const POINTS_COMPARE_RULE_ID = 'points-compare';

/** Default threshold shown before the user picks one — the low end of a "great" wine score. */
const DEFAULT_POINTS_THRESHOLD = 90;

/** Operator options (math glyphs for readability); the empty placeholder is the "off" state. */
const OPERATOR_OPTIONS: readonly SelectOption[] = [
	{ label: '≥', value: '>=' },
	{ label: '>', value: '>' },
	{ label: '=', value: '==' },
	{ label: '≤', value: '<=' },
	{ label: '<', value: '<' },
	{ label: '≠', value: '!=' },
];

/**
 * A one-sided NumericComparisonRule section over a wine's `points`.
 */
export const PointsCompareFilterSection = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	// A facet edit drops any active preset first: see `smartFilterSelection.ts`.
	const leaveExpressionMode = useLeaveExpressionMode();
	const rule = useRule(POINTS_COMPARE_RULE_ID) as NumericComparisonRule | undefined;
	const activeOp: string = rule?.config.op ?? '';
	const ruleThreshold = rule?.config.value;
	const [threshold, setThreshold] = useState<number>(ruleThreshold ?? DEFAULT_POINTS_THRESHOLD);
	const [lastSeenRuleThreshold, setLastSeenRuleThreshold] = useState(ruleThreshold);

	// Adopt an externally-set threshold (devtools time-travel, a `?f` config load) without
	// clobbering the local number while the rule is off. Adjusted during render rather than in an
	// effect, so the field never paints the stale number first. `Object.is` is the comparison an
	// effect's dependency array would make.
	if (!Object.is(ruleThreshold, lastSeenRuleThreshold)) {
		setLastSeenRuleThreshold(ruleThreshold);

		if (ruleThreshold !== undefined) {
			setThreshold(ruleThreshold);
		}
	}

	const handleOperatorChange = useCallback((nextOp: string): void => {
		leaveExpressionMode();
		commitFilterMutation({
			callEngine: () => {
				if (nextOp === '') {
					engine.core.removeRule(POINTS_COMPARE_RULE_ID);
				} else {
					engine.core.addRule(POINTS_COMPARE_RULE_ID, numCompare('points', { op: nextOp as NumericComparisonOp, value: threshold }));
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, threshold, leaveExpressionMode]);

	const handleThresholdChange = useCallback((nextValue: number): void => {
		setThreshold(nextValue);

		if (activeOp === '') {
			return;
		}
		leaveExpressionMode();
		commitFilterMutation({
			callEngine: () => engine.core.addRule(POINTS_COMPARE_RULE_ID, numCompare('points', { op: activeOp as NumericComparisonOp, value: nextValue })),
			markBusy: markUserAction,
		});
	}, [activeOp, engine, leaveExpressionMode]);

	return (
		<section>
			<SectionHeader label="Score comparison" />
			<div className="fe-operator-row">
				<div className="fe-operator-row__op">
					<SelectMenu options={OPERATOR_OPTIONS} value={activeOp} onChange={handleOperatorChange} ariaLabel="Points comparison operator" placeholder="— off —" />
				</div>
				<div className="fe-operator-row__value">
					<NumberField value={threshold} onChange={handleThresholdChange} ariaLabel="Points comparison threshold" min={80} max={100} step={1} />
				</div>
			</div>
		</section>
	);
};
