/**
 * `<CheckboxList />` — long-list InSet filter for high-cardinality facets (dozens to hundreds of
 * options). Vertical scroll, exclusion-aware disabling, optional projected-count badges.
 *
 * @remarks
 * Differs from `<ChipToggleGroup>` in layout + density: a vertical native-checkbox column reads
 * cleanly at 100+ options where a wrapping chip row does not. The scroll region is capped via the
 * `maxHeight` prop (default `16rem`) with overflow scroll so it doesn't take over the panel.
 *
 * Same exclusion-aware disabling as `ChipToggleGroup` — rows whose addition would yield zero
 * results are subdued (`--unavailable`) + non-interactive; selected rows stay clickable.
 *
 * Pure presentational: styling is the `fe-checkbox-list*` classes in `@filter-enginez/ui-styles`;
 * the `ExclusionMap` contract is local (no engine import).
 */

import type { ExclusionMap } from '../../shared/exclusion.js';

/**
 * Props for `<CheckboxList />`.
 */
export interface CheckboxListProps {
	/** All candidate values in display order. */
	readonly options: readonly string[];
	/** Currently-selected values. */
	readonly selected: readonly string[];
	/** Called when a row is toggled. Caller toggles the underlying rule. */
	readonly onToggle: (value: string) => void;
	/** Optional exclusion data for disable-when-empty semantics. */
	readonly exclusion?: ExclusionMap;
	/** If `true` and exclusion is provided, show projected-count badges on unselected rows. */
	readonly showCount?: boolean;
	/** Max height of the scroll region (any CSS length). Defaults to `16rem`. */
	readonly maxHeight?: string;
}

/**
 * Vertical, scrollable checkbox list for high-cardinality InSet filters.
 */
export const CheckboxList = (props: CheckboxListProps): React.ReactElement => {
	const { exclusion, maxHeight = '16rem', onToggle, options, selected, showCount: shouldShowCount = false } = props;

	return (
		<div className="fe-checkbox-list" style={{ maxHeight }}>
			{options.map((option) => {
				const isSelected = selected.includes(option);
				const exclusionData = exclusion?.get(option);
				const willBeEmpty = exclusionData?.wouldBeEmpty ?? false;
				const projectedCount = exclusionData?.projectedCount ?? 0;
				// Hard-disable mirroring ChipToggleGroup — selected rows stay clickable to escape.
				const isUnavailable = willBeEmpty && !isSelected;
				const rowClass = `fe-checkbox-list__row${
					isSelected ? ' fe-checkbox-list__row--selected' : ''
				}${isUnavailable ? ' fe-checkbox-list__row--unavailable' : ''}`;

				return (
					<label
						key={option}
						className={rowClass}
						title={isUnavailable ? `No matches for ${option} given your other filters` : undefined}
					>
						<span className="fe-checkbox-list__main">
							<input
								type="checkbox"
								className="fe-checkbox-list__box"
								checked={isSelected}
								disabled={isUnavailable}
								onChange={() => onToggle(option)}
							/>
							<span className="fe-checkbox-list__label">{option}</span>
						</span>
						{!!shouldShowCount && !!exclusionData && !isSelected && (
							<span
								className={`fe-checkbox-list__count${isUnavailable ? ' fe-checkbox-list__count--unavailable' : ''}`}
							>
								{projectedCount.toLocaleString()}
							</span>
						)}
					</label>
				);
			})}
		</div>
	);
};
