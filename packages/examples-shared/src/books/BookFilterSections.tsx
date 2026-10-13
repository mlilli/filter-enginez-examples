/**
 * `BookFilterSections` — the reusable, engine-wired filter sections for the books panel.
 *
 * @remarks
 * The books panel is deliberately simpler than wine's: one synchronous bundle on the main thread
 * (no worker round-trip) and no origin tree. Each section reads its rule via `useRule`, renders the
 * matching `react-ui` presentational control, and commits a fresh rule instance through the shared
 * `commitFilterMutation` frame-scheduler (optimistic paint → loader flip → engine call), exactly as
 * the wine sections do. Keeping the section set here (rather than one-file-per-section like wine)
 * matches the smaller books surface while staying comfortably under the file-size cap.
 *
 * These sections are intentionally framework-surface-agnostic in spirit — they touch only the
 * signals hooks + core factories, so the SvelteKit, Vue, Angular and vanilla books panels mirror the
 * same rule-commit contract without dragging RTK along.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { bool, type BooleanRule, exists, type ExistsRule, fuzzy, type FuzzySearchRule, inSet, type InSetRule, range, type RangeRule, regex, type RegexRule, text, type TextSearchRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { ChipToggleGroup, type NumericBounds, RangeSlider, SearchInput } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useState } from 'react';

import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { useTypeaheadSearch } from '../search/useTypeaheadSearch.js';
import { toggleSetValue } from '../selection/index.js';
import { CheckboxControl } from './CheckboxControl.js';
import { markUserAction } from './engineBusy.js';
import {
	useBooksChipExclusion,
	useBooksFieldBounds,
	useBooksFieldHistogram,
	useToggleWouldBeEmpty,
} from './filterBundle.js';

/** Stable empty selection so an unset InSet rule doesn't churn referential identity. */
const EMPTY_SELECTION: readonly string[] = [];

/**
 * Section label — small uppercase mono caption above each control. Mirrors the wine
 * `<SectionHeader />` styling so the two panels read identically.
 */
export const SectionHeader = (props: { readonly label: string }): React.ReactElement => {
	return (
		<h3 className="fe-filter-section-label">{props.label}</h3>
	);
};

/**
 * Props for `<ChipSection />` — an `InSetRule` chip-toggle group (genre / format / language).
 */
export interface ChipSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field the InSet constrains (e.g. `genre`). */
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
 * over the current set.
 *
 * @remarks
 * The disabled set comes from the panel's shared bundle (`useBooksChipExclusion`), so every chip
 * section reads one exclusion map computed once per engine change rather than simulating per chip.
 */
export const ChipSection = (props: ChipSectionProps): React.ReactElement => {
	const { field, formatLabel, label, options, ruleId } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as InSetRule<string> | undefined;
	const engineSelected: readonly string[] = rule?.config.set ?? EMPTY_SELECTION;
	// Re-adopts the engine's selection on an external change (clear-all etc.); an equal set is a no-op.
	const [selected, setSelected] = useSeedAndAdopt(engineSelected, sameMembers);

	const handleToggle = useCallback((value: string): void => {
		const next = toggleSetValue(selected, value);

		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, inSet<string>(field, next)),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelected(next),
		});
	}, [engine, field, ruleId, selected, setSelected]);
	// Predictive-disable — a chip whose selection would empty the result set (given the other active
	// filters) is disabled, so books can never reach zero results via the chip facets.
	const exclusion = useBooksChipExclusion(ruleId);

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
 * Props for `<RangeSection />` — a continuous `RangeRule` slider (year / rating / page count).
 */
export interface RangeSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field the range constrains (e.g. `publicationYear`). */
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
 * A continuous range-rule slider section. The track spans the derived corpus baseline, dragging
 * commits a `range` rule, and the bundle supplies both the dimmed available zone and the distribution
 * overlay drawn above the track.
 */
export const RangeSection = (props: RangeSectionProps): React.ReactElement => {
	const { ariaLabel, baseline, field, format, label, parse, ruleId, step } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as RangeRule | undefined;

	const min = rule?.config.min ?? baseline.min;
	const max = rule?.config.max ?? baseline.max;
	// Filtered-except-self bounds — the RangeSlider dims (and constrains handle drag to) this zone so
	// a drag can't land the range where no books exist. Falls back to the full baseline pre-bundle.
	const available = useBooksFieldBounds(ruleId) ?? baseline;
	// The distribution the engine already computed for this field. `undefined` pre-bundle, which the
	// slider renders as no overlay rather than as an empty one.
	const histogram = useBooksFieldHistogram(ruleId, min, max);

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
 * Props for `<TextSection />` — a substring `TextSearchRule` input (description search).
 */
export interface TextSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field the text search scans (e.g. `description`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** Input placeholder. */
	readonly placeholder: string;
	/** Accessible name for the input. */
	readonly ariaLabel: string;
}

/**
 * A debounced typeahead substring text-search section.
 */
export const TextSection = (props: TextSectionProps): React.ReactElement => {
	const { ariaLabel, field, label, placeholder, ruleId } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as TextSearchRule | undefined;
	const ruleQuery = rule?.config.query ?? '';

	const commit = useCallback((trimmed: string): void => {
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, text(field, { caseSensitive: false, mode: 'substring', query: trimmed })),
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
 * Props for `<FuzzySection />` — a typo-tolerant `FuzzySearchRule` input (author search).
 */
export interface FuzzySectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field the fuzzy search scans (e.g. `authors`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** Input placeholder. */
	readonly placeholder: string;
	/** Accessible name for the input. */
	readonly ariaLabel: string;
	/** Fuse.js match threshold — lower is stricter. */
	readonly threshold: number;
	/**
	 * Optional Fuse.js key set. **Required for array-valued fields** (e.g. `authors: string[]`): the
	 * single-field path coerces the extracted value and bails on non-strings, so an array never
	 * matches — passing `keys: ['authors']` routes through Fuse's multi-key mode, which indexes each
	 * element. Omit for plain string fields.
	 */
	readonly keys?: readonly string[];
}

/**
 * A debounced typeahead fuzzy text-search section.
 */
export const FuzzySection = (props: FuzzySectionProps): React.ReactElement => {
	const { ariaLabel, field, keys, label, placeholder, ruleId, threshold } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as FuzzySearchRule | undefined;
	const ruleQuery = rule?.config.query ?? '';

	const commit = useCallback((trimmed: string): void => {
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, fuzzy(field, {
				query: trimmed,
				threshold,
				...(keys !== undefined ? { keys } : {}),
			})),
			markBusy: markUserAction,
		});
	}, [engine, field, keys, ruleId, threshold]);
	const search = useTypeaheadSearch({ commit, ruleQuery });

	return (
		<section>
			<SectionHeader label={label} />
			<SearchInput value={search.value} onChange={search.onChange} onCommit={search.onCommit} placeholder={placeholder} ariaLabel={ariaLabel} />
		</section>
	);
};

/**
 * Props for `<BooleanSection />` — a single `BooleanRule` "must be true" checkbox
 * (in-print / has-audiobook).
 */
export interface BooleanSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` boolean field the rule matches (e.g. `isInPrint`). */
	readonly field: string;
	/** Checkbox label. */
	readonly label: string;
}

/**
 * A single-checkbox boolean section. Checked commits `bool(field, true)` ("must be true"); clearing
 * commits `bool(field, undefined)` — the no-op sentinel that removes the constraint.
 */
export const BooleanSection = (props: BooleanSectionProps): React.ReactElement => {
	const { field, label, ruleId } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as BooleanRule | undefined;
	const isChecked = rule?.config === true;
	// Predictive-disable: turning this on filters the current results to `field === true`; disable
	// when none of them qualify (so it can't zero the set).
	const candidateRule = useMemo(() => bool(field, true), [field]);
	const isDisabled = useToggleWouldBeEmpty(candidateRule);

	const handleToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
		// Capture the checked state now — `commitFilterMutation` defers `callEngine` to a later frame,
		// by which point reading `event.target` again would be unsafe.
		const isRequiredTrue = event.target.checked;

		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, bool(field, isRequiredTrue ? true : undefined)),
			markBusy: markUserAction,
		});
	}, [engine, field, ruleId]);

	return <CheckboxControl isChecked={isChecked} isDisabled={isDisabled} label={label} onToggle={handleToggle} />;
};

/**
 * Props for `<ExistsSection />` — a single `ExistsRule` "field is present" checkbox (e.g. "Rated
 * only", where `averageRating` is nullable so its presence is meaningful).
 */
export interface ExistsSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field whose presence is required (e.g. `averageRating`). */
	readonly field: string;
	/** Checkbox label. */
	readonly label: string;
}

/**
 * A single-checkbox existence section. Checked commits `exists(field)` (the field must be non-null /
 * non-undefined); clearing removes the rule outright — unlike `<BooleanSection />`, `ExistsRule` has
 * no no-op sentinel config, so "off" means "no constraint," i.e. `removeRule`.
 */
export const ExistsSection = (props: ExistsSectionProps): React.ReactElement => {
	const { field, label, ruleId } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as ExistsRule | undefined;
	const isChecked = rule !== undefined;
	// Predictive-disable: turning this on requires the field be present; disable when no current
	// result has it (so it can't zero the set).
	const candidateRule = useMemo(() => exists(field), [field]);
	const isDisabled = useToggleWouldBeEmpty(candidateRule);

	const handleToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
		// Capture the checked state now — `commitFilterMutation` defers `callEngine` to a later frame,
		// by which point reading `event.target` again would be unsafe.
		const shouldRequirePresence = event.target.checked;

		commitFilterMutation({
			callEngine: () => {
				if (shouldRequirePresence) {
					engine.core.addRule(ruleId, exists(field));
				} else {
					engine.core.removeRule(ruleId);
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, field, ruleId]);

	return <CheckboxControl isChecked={isChecked} isDisabled={isDisabled} label={label} onToggle={handleToggle} />;
};

/**
 * Props for `<RegexSection />` — a `RegexRule` pattern input (e.g. filter ISBN-13s by a regular
 * expression over `isbn13`).
 */
export interface RegexSectionProps {
	/** Rule id + registry key. */
	readonly ruleId: string;
	/** The `Book` field the pattern tests (e.g. `isbn13`). */
	readonly field: string;
	/** Section label. */
	readonly label: string;
	/** Input placeholder. */
	readonly placeholder: string;
	/** Accessible name for the input. */
	readonly ariaLabel: string;
}

/**
 * A debounced regular-expression section. Each committed pattern is compiled defensively: a valid
 * pattern commits `regex(field, { pattern })`; an empty box removes the rule; an *invalid* pattern
 * leaves the last good rule in place and surfaces an inline, screen-reader-announced hint (so a
 * half-typed `[` never throws or wipes the current filter).
 */
export const RegexSection = (props: RegexSectionProps): React.ReactElement => {
	const { ariaLabel, field, label, placeholder, ruleId } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(ruleId) as RegexRule | undefined;
	// An empty-pattern rule (e.g. a config default of `source: ''`) deserializes to `/(?:)/`, whose
	// `.source` is the sentinel string `'(?:)'` — present that as an empty input, not the sentinel.
	const patternSource = rule?.config.pattern.source ?? '';
	const ruleQuery = patternSource === '(?:)' ? '' : patternSource;
	const [isPatternInvalid, setIsPatternInvalid] = useState(false);

	const commit = useCallback((trimmed: string): void => {
		if (trimmed === '') {
			setIsPatternInvalid(false);
			commitFilterMutation({
				callEngine: () => engine.core.removeRule(ruleId),
				markBusy: markUserAction,
			});

			return;
		}

		const compiled = compilePattern(trimmed);

		if (compiled === null) {
			// Malformed pattern — keep the last valid rule in place, just flag the box.
			setIsPatternInvalid(true);

			return;
		}
		setIsPatternInvalid(false);
		commitFilterMutation({
			callEngine: () => engine.core.addRule(ruleId, regex(field, { pattern: compiled })),
			markBusy: markUserAction,
		});
	}, [engine, field, ruleId]);
	const search = useTypeaheadSearch({ commit, ruleQuery });

	return (
		<section>
			<SectionHeader label={label} />
			<SearchInput value={search.value} onChange={search.onChange} onCommit={search.onCommit} placeholder={placeholder} ariaLabel={ariaLabel} />
			{isPatternInvalid ? (
				<p role="alert" className="fe-books-regex-error">
					Invalid regular expression
				</p>
			) : null}
		</section>
	);
};

/**
 * Compile a user-entered pattern, returning `null` (rather than throwing) on a malformed source so a
 * half-typed regex never crashes the panel.
 *
 * @internal
 */
function compilePattern(source: string): RegExp | null {
	try {
		return new RegExp(source);
	} catch {
		return null;
	}
}

/**
 * Order-insensitive membership equality for two string selections. Lets an external rule change
 * that produces a referentially-new-but-equal set be a no-op (no render churn).
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
