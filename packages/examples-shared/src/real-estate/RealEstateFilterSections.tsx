/**
 * `RealEstateFilterSections` — the reusable, engine-wired filter sections for the real-estate panel
 * that follow the books/wine "read via `useRule` → render a `react-ui` control → commit through
 * `commitFilterMutation`" contract.
 *
 * @remarks
 * Covers the InSet-family + numeric + text + feature sections. The two richer sections that don't
 * fit the one-control mold live in their own files: `LocationSection` (the `HierarchicalPicker`
 * location tree) and `ListedDateSection` (the `DateRangeRule` presets); the geo-radius section is
 * `GeoRadiusSection`. Every section here is framework-surface-agnostic in spirit — it touches only
 * the signals hooks + core factories, and commits rules through the same contract as every other
 * vertical's panel.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { type FilterEngine, inSet, type InSetRule, range, type RangeRule, text, type TextSearchRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { CheckboxList, ChipToggleGroup, type NumericBounds, RangeSlider, SearchInput } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { useChipExclusion, useFieldBounds, useFieldHistogram } from '../filter-bundle/index.js';
import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { useTypeaheadSearch } from '../search/useTypeaheadSearch.js';
import { toggleSetValue } from '../selection/index.js';
import { markUserAction } from './engineBusy.js';
import { ContainsAllRule } from './real-estate-domain/ContainsAllRule.js';
import { REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT } from './real-estate-domain/panelCopy.js';

/** Stable empty selection so an unset InSet/feature rule doesn't churn referential identity. */
const EMPTY_SELECTION: readonly string[] = [];

/**
 * Write an `InSetRule` selection, or remove the rule when the selection is empty.
 *
 * @remarks
 * Deselecting the last chip or checkbox REMOVES the rule rather than writing an empty `inSet`, as in
 * every other app: an empty set matches everything, so the results are the same, but the rule would
 * still ride in the `?f=` link and log a change where every other clear logs a removal.
 *
 * @param core - The engine.
 * @param ruleId - The rule id.
 * @param field - The `Listing` field the rule constrains.
 * @param values - The new selection.
 */
function commitInSetSelection(
	core: Pick<FilterEngine<Listing>, 'addRule' | 'removeRule'>,
	ruleId: string,
	field: string,
	values: readonly string[],
): void {
	if (values.length === 0) {
		core.removeRule(ruleId);

		return;
	}
	core.addRule(ruleId, inSet<string>(field, values));
}

/**
 * Section label — small uppercase mono caption above each control. Mirrors the books/wine
 * `<SectionHeader />` styling so every panel reads identically.
 */
export const SectionHeader = (props: { readonly label: string }): React.ReactElement => {
	return (
		<h3 className="fe-filter-section-label">{props.label}</h3>
	);
};

/**
 * Props for `<ChipSection />` — an `InSetRule` chip-toggle group (property type / status).
 */
export interface ChipSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Listing` field the InSet constrains (e.g. `propertyType`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** The full vocabulary of selectable values (already sorted). */
	readonly options: readonly string[];
	/** Optional per-chip label formatter. */
	readonly formatLabel?: (value: string) => string;
}

/**
 * An InSet chip-toggle section with predictive disable — a chip whose selection would empty the
 * result set, given every other active filter, renders disabled. Selection commits an `inSet` rule
 * over the current set; deselecting the last chip removes the rule.
 */
export const ChipSection = (props: ChipSectionProps): React.ReactElement => {
	const { field, formatLabel, label, options, ruleId } = props;
	const engine = useFilterEngine<Listing>();
	const rule = useRule(ruleId) as InSetRule<string> | undefined;
	const engineSelected: readonly string[] = rule?.config.set ?? EMPTY_SELECTION;
	// Re-adopts the engine's selection on an external change (clear-all etc.); an equal set is a no-op.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameMembers);

	const handleToggle = useCallback((value: string): void => {
		const next = toggleSetValue(selected, value);

		commitFilterMutation({
			callEngine: () => commitInSetSelection(engine.core, ruleId, field, next),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, field, ruleId, selected, setSelected]);
	const exclusion = useChipExclusion(ruleId);

	return (
		<section>
			<SectionHeader label={label} />
			<ChipToggleGroup<string>
				options={options}
				selected={selected}
				onToggle={handleToggle}
				exclusion={exclusion}
				{...(formatLabel !== undefined ? { formatLabel } : {})}
			/>
		</section>
	);
};

/**
 * Props for `<CheckboxSection />` — a high-cardinality `InSetRule` rendered as a scrollable checkbox
 * list (school district).
 */
export interface CheckboxSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Listing` field the InSet constrains (e.g. `schoolDistrict`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** The full vocabulary of selectable values (already sorted). */
	readonly options: readonly string[];
}

/**
 * A high-cardinality InSet section — same commit contract and predictive disable as
 * `<ChipSection />`, but rendered with the scrollable `<CheckboxList />` so a long vocabulary
 * (dozens of school districts) stays usable.
 *
 * @remarks
 * This is where predictive disable earns its keep most visibly. With a geo radius active, the vast
 * majority of districts are unreachable — a 15-mile Denver radius leaves 3 of 24 — and without the
 * exclusion map every one of the other 21 would be a click that silently produces zero results. The
 * `showCount` badge shows the projected count, which `CheckboxList` paints whenever it has exclusion
 * data.
 */
export const CheckboxSection = (props: CheckboxSectionProps): React.ReactElement => {
	const { field, label, options, ruleId } = props;
	const engine = useFilterEngine<Listing>();
	const rule = useRule(ruleId) as InSetRule<string> | undefined;
	const engineSelected: readonly string[] = rule?.config.set ?? EMPTY_SELECTION;
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameMembers);

	const handleToggle = useCallback((value: string): void => {
		const next = toggleSetValue(selected, value);

		commitFilterMutation({
			callEngine: () => commitInSetSelection(engine.core, ruleId, field, next),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, field, ruleId, selected, setSelected]);
	const exclusion = useChipExclusion(ruleId);

	return (
		<section>
			<SectionHeader label={label} />
			<CheckboxList
				options={options}
				selected={selected}
				onToggle={handleToggle}
				exclusion={exclusion}
				showCount
				maxHeight={REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT}
			/>
		</section>
	);
};

/**
 * Props for `<RangeSection />` — a continuous `RangeRule` slider (price / sqft / beds / baths /
 * year / lot size).
 */
export interface RangeSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Listing` field the range constrains (e.g. `priceUsd`). */
	readonly field: string;
	/** Slider label. */
	readonly label: string;
	/** Accessible name for the slider group. */
	readonly ariaLabel: string;
	/** The full-corpus bounds the track spans. */
	readonly baseline: NumericBounds;
	/** Step granularity. */
	readonly step: number;
	/** Value → display string. */
	readonly format: (n: number) => string;
	/** Raw input string → number. */
	readonly parse: (raw: string) => number;
}

/**
 * A continuous range-rule slider section. The track spans the derived corpus baseline; dragging
 * commits a `range` rule.
 *
 * @remarks
 * The `available` zone is the slider's equivalent of a disabled chip: the filtered-except-self
 * bounds, so the stretches of track no current result occupies render dimmed. It falls back to the
 * baseline before the first bundle resolves, and whenever the subset is empty — in both cases the
 * whole track reads as available, which is the honest "we don't know yet" rendering.
 *
 * The `histogram` is the same information one step finer: not where the data stops, but where inside
 * that range it actually sits. Price, square feet and lot size are heavily skewed, so the bars carry
 * real information here — a dimmed zone says "nothing beyond this point", the bars say "and almost
 * nothing in the top third of what's left either".
 */
export const RangeSection = (props: RangeSectionProps): React.ReactElement => {
	const { ariaLabel, baseline, field, format, label, parse, ruleId, step } = props;
	const engine = useFilterEngine<Listing>();
	const rule = useRule(ruleId) as RangeRule | undefined;
	const available = useFieldBounds(ruleId) ?? baseline;

	const min = rule?.config.min ?? baseline.min;
	const max = rule?.config.max ?? baseline.max;
	const histogram = useFieldHistogram(ruleId, min, max);

	const handleChange = useCallback((next: { readonly max: number; readonly min: number }): void => {
		// The slider already painted its committed thumb position, so no optimistic paint here.
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, range(field, { max: next.max, min: next.min })),
			markBusy: markUserAction,
		});
	}, [engine, field, ruleId]);

	return (
		<RangeSlider
			label={label}
			baseline={baseline}
			available={available}
			histogram={histogram}
			step={step}
			valueMin={min}
			valueMax={max}
			onChange={handleChange}
			format={format}
			parse={parse}
			ariaLabel={ariaLabel}
		/>
	);
};

/**
 * Props for `<FeatureSection />` — a "must have all of" multi-select over the `Listing.features`
 * string array, committed as a single serializable `ContainsAllRule`.
 */
export interface FeatureSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** Section label. */
	readonly label: string;
	/** The full feature vocabulary present in the corpus (already sorted). */
	readonly options: readonly string[];
	/** Optional per-chip label formatter. */
	readonly formatLabel?: (value: string) => string;
}

/**
 * A must-have-features section. `Listing.features` is a `string[]`, so a `BooleanRule` / `InSetRule`
 * over a scalar field doesn't fit; a single `ContainsAllRule` expressing "features ⊇ selected" (AND
 * semantics — a listing must have every selected feature) is the right primitive. It's a
 * registry-registered custom subclass (see `ContainsAllRule.ts`) — serializable, so unlike a
 * closure `PredicateRule`, its state round-trips through the URL. Selecting nothing
 * removes the rule (empty = no constraint).
 */
export const FeatureSection = (props: FeatureSectionProps): React.ReactElement => {
	const { formatLabel, label, options, ruleId } = props;
	const engine = useFilterEngine<Listing>();
	const rule = useRule(ruleId) as ContainsAllRule | undefined;
	const engineSelected: readonly string[] = rule?.config.required ?? EMPTY_SELECTION;
	// Sync from the engine on external change (clear-all, or a shared URL loading the rule). The
	// selection lives IN the rule's config (`required`) — unlike a closure predicate — so it
	// round-trips; mirrors the ChipSection pattern.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameMembers);

	const handleToggle = useCallback((value: string): void => {
		const next = toggleSetValue(selected, value);

		commitFilterMutation({
			callEngine: () => {
				if (next.length === 0) {
					engine.core.removeRule(ruleId);

					return;
				}
				engine.core.addRule(ruleId, new ContainsAllRule('features', { required: next }));
			},
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, ruleId, selected, setSelected]);
	// Predictive disable via the bundle's CONJUNCTIVE candidate kind. The distinction matters here
	// and nowhere else in this panel: every other facet widens when you click it, so its own rule is
	// dropped during projection. This one narrows, so its rule stays active and each candidate is
	// projected on top of what's already checked — otherwise "solar" would look available while
	// "garage" is checked, even though no listing has both.
	const exclusion = useChipExclusion(ruleId);

	return (
		<section>
			<SectionHeader label={label} />
			<ChipToggleGroup<string>
				options={options}
				selected={selected}
				onToggle={handleToggle}
				exclusion={exclusion}
				{...(formatLabel !== undefined ? { formatLabel } : {})}
			/>
		</section>
	);
};

/**
 * Props for `<TextSection />` — a substring `TextSearchRule` input (address + description search).
 */
export interface TextSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Listing` field the text search scans (e.g. `description`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** Input placeholder. */
	readonly placeholder: string;
	/** Accessible name for the input. */
	readonly ariaLabel: string;
}

/**
 * A debounced typeahead substring text-search section. Clearing the field removes the rule.
 */
export const TextSection = (props: TextSectionProps): React.ReactElement => {
	const { ariaLabel, field, label, placeholder, ruleId } = props;
	const engine = useFilterEngine<Listing>();
	const rule = useRule(ruleId) as TextSearchRule | undefined;
	const ruleQuery = rule?.config.query ?? '';

	// Called by the typeahead only for a real change, so every call is a write and marks busy. An empty
	// query removes the rule, as in every other app's real-estate search.
	const commit = useCallback((trimmed: string): void => {
		commitFilterMutation({
			callEngine: () => {
				if (trimmed === '') {
					engine.core.removeRule(ruleId);
				} else {
					engine.core.addRule(ruleId, text(field, { caseSensitive: false, mode: 'substring', query: trimmed }));
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, field, ruleId]);
	const search = useTypeaheadSearch({ commit, ruleQuery });

	return (
		<section>
			<SectionHeader label={label} />
			<SearchInput value={search.value} onChange={search.onChange} onCommit={search.onCommit} placeholder={placeholder} ariaLabel={ariaLabel} />
		</section>
	);
};

/**
 * Order-insensitive membership equality for two string selections. Lets an external rule change that
 * produces a referentially-new-but-equal set be a no-op (no render churn).
 *
 * @internal
 */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
	if (a === b) {
		return true;
	}
	if (a.length !== b.length) {
		return false;
	}

	return a.every((value) => b.includes(value));
}
