/**
 * `<ChipToggleGroup />` — reusable chip-toggle set for InSet-style filters with optional
 * exclusion-aware disabling.
 *
 * @remarks
 * One shared component for the color / body / sweetness filter sections. Each chip represents a
 * candidate value; clicking toggles it via the parent's `onToggle`.
 *
 * **Exclusion-aware disabling** is the headline UX moment: when an `exclusion` map is supplied,
 * chips whose addition would empty the result set are visually subdued (`fe-chip--unavailable`)
 * and `disabled`. This is the engine's "predictive disable" affordance — it tells the user "this
 * would give zero matches" before they click. Selected chips always stay clickable so the user can
 * deselect to escape.
 *
 * **Count badges** — with `showCount`, each unselected chip shows the projected result count if
 * that value were added.
 *
 * Pure presentational: styling is the `fe-chip*` classes in `@filter-enginez/ui-styles`; the
 * `ExclusionMap` contract is local (no engine import).
 */

import type { ExclusionMap } from '../../shared/exclusion.js';

/**
 * Props for `<ChipToggleGroup />`.
 *
 * @typeParam V - The value type (typically a string or a typed string-union enum).
 */
export interface ChipToggleGroupProps<V extends string> {
	/** All candidate values to render as chips, in display order. */
	readonly options: readonly V[];
	/** Currently-selected values. */
	readonly selected: readonly V[];
	/** Called when a chip is clicked. Caller toggles the underlying rule. */
	readonly onToggle: (value: V) => void;
	/**
	 * Optional exclusion data. When provided, chips whose addition would yield zero results are
	 * disabled + visually subdued.
	 */
	readonly exclusion?: ExclusionMap;
	/** If `true` and exclusion is provided, show projected-count badges on unselected chips. */
	readonly showCount?: boolean;
	/** Optional label formatter (e.g. to shorten or relabel). Defaults to identity. */
	readonly formatLabel?: (value: V) => string;
}

/**
 * Default chip label: the value itself. Module-level so the default keeps one identity across renders
 * — an inline arrow in the destructuring default would be a new function on every render.
 *
 * @internal
 */
const formatValueAsLabel = <V extends string>(value: V): string => value;

/**
 * Reusable chip-toggle set for InSet-style filters.
 */
export const ChipToggleGroup = <V extends string>(props: ChipToggleGroupProps<V>): React.ReactElement => {
	const {
		exclusion,
		formatLabel = formatValueAsLabel,
		onToggle,
		options,
		selected,
		showCount: shouldShowCount = false,
	} = props;

	return (
		<div className="fe-chip-toggle">
			{options.map((option) => {
				const isSelected = selected.includes(option);
				const exclusionData = exclusion?.get(option);
				const willBeEmpty = exclusionData?.wouldBeEmpty ?? false;
				const projectedCount = exclusionData?.projectedCount ?? 0;
				// Hard-disable when selecting would yield zero results (unless already selected,
				// so the user can always deselect to escape a dead end).
				const isUnavailable = willBeEmpty && !isSelected;
				const chipClass = `fe-chip${
					isSelected ? ' fe-chip--selected' : ''
				}${isUnavailable ? ' fe-chip--unavailable' : ''}`;

				return (
					<button
						key={option}
						type="button"
						// **`aria-pressed` is the only thing that tells a screen reader this chip is on.**
						// `fe-chip--selected` is a CSS class, which assistive technology cannot see; carrying
						// the state in the class alone would be a WCAG 4.1.2 failure and a violation of the
						// house accessibility rule ("color is never the sole carrier of meaning") and its
						// companion ("use aria-* to communicate component state") — across every facet chip in
						// both React apps: books, wine and real estate alike.
						//
						// The other verticals carry the same attribute — Vue's `:aria-pressed="isSelected(option)"`
						// is the exact analogue, and vanilla's and SvelteKit's own unit tests assert it.
						//
						// **axe cannot catch its absence**: nothing in the rule set knows that a styled
						// `<button>` is meant to be a toggle rather than an action.
						aria-pressed={isSelected}
						className={chipClass}
						disabled={isUnavailable}
						onClick={() => onToggle(option)}
						title={
							isUnavailable
								? `No matches for ${formatLabel(option)} given your other filters`
								: shouldShowCount && exclusionData
									? `${projectedCount.toLocaleString()} would match`
									: undefined
						}
					>
						{formatLabel(option)}
						{!!shouldShowCount && !!exclusionData && !isSelected && (
							<span
								className={`fe-chip__count${isUnavailable ? ' fe-chip__count--unavailable' : ''}`}
							>
								({projectedCount.toLocaleString()})
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
};
