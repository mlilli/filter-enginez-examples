/**
 * `controlRegistry.tsx` — the rule-type → filter-control mapping the config-driven panel renders.
 *
 * @remarks
 * The heart of the "the filter UI is a function of the data" showcase: given a `SerializedRule`
 * entry from a `FilterEngineConfig`, look up its `type` and render the matching presentational
 * control. Crucially, this **reuses the exact same engine-wired sections** the hand-authored
 * `BooksFilterPanel` uses (`ChipSection`, `RangeSection`, …) — so a config-generated control commits
 * rules through the identical `commitFilterMutation` contract, inherits the same predictive-disable
 * hooks, and needs zero new coverage-gated `react-ui` components. The registry is pure composition
 * over battle-tested parts; it invents nothing.
 *
 * A renderer derives its props from three sources: the config `entry` (declared type/field/config),
 * the humanized rule id (label), and the {@link CorpusVocabulary} (data-derived chip options,
 * slider extents, array-field detection).
 *
 * @packageDocumentation
 */

import type { SerializedRule } from '@filter-enginez/core';

import { BooleanSection, ChipSection, ExistsSection, FuzzySection, RangeSection, RegexSection, TextSection } from '../BookFilterSections.js';
import { type CorpusVocabulary } from './vocabularies.js';

/**
 * Everything a {@link ControlRenderer} needs to realize one config rule as an interactive control.
 */
export interface ControlContext {
	/** The serialized rule entry from the config (`{ type, field, config }`). */
	readonly entry: SerializedRule;
	/** The rule's field, pre-narrowed to a string (function/array-path fields are skipped upstream). */
	readonly field: string;
	/** Display label — the humanized rule id (e.g. `page-count` → "Page count"). */
	readonly label: string;
	/** The rule id (registry key + engine rule id). */
	readonly ruleId: string;
	/** Corpus-derived control inputs (chip vocabulary, slider bounds, array-field detection). */
	readonly vocab: CorpusVocabulary;
}

/** Renders one config rule as a control, or `null` when the type maps to no control. */
export type ControlRenderer = (context: ControlContext) => React.ReactElement | null;

/** Immutable `SerializedRule.type` → {@link ControlRenderer} map. */
export type ControlRegistry = ReadonlyMap<string, ControlRenderer>;

/** Rule-id words that should render fully upper-cased rather than sentence-cased. */
const ACRONYMS = new Set(['api', 'isbn', 'sql', 'url']);

/**
 * Humanize a kebab-case rule id into a sentence-case control label — the first word capitalized, the
 * rest lower-case, known acronyms upper-cased (`isbn-format` → "ISBN format", `page-count` → "Page
 * count"). Labels are thus a function of the config's own ids; no hand-authored label table needed.
 */
export function humanizeRuleId(ruleId: string): string {
	return ruleId
		.split('-')
		.map((word, index) => {
			if (ACRONYMS.has(word)) {
				return word.toUpperCase();
			}
			if (index === 0) {
				return word.charAt(0).toUpperCase() + word.slice(1);
			}

			return word;
		})
		.join(' ');
}

/**
 * Choose a slider step from the declared span so the granularity reads naturally: sub-decade spans
 * (ratings) step by 0.1, everyday spans (years, counts) by 1, and large spans (page counts) by 10.
 * Reproduces the hand-tuned books panel steps purely from the config's declared bounds. Exported so
 * the config-derived predictive-disable bundle pads its baseline bounds identically to the slider.
 */
export function deriveStep(min: number, max: number): number {
	const span = max - min;

	if (span <= 10) {
		return 0.1;
	}
	if (span <= 1000) {
		return 1;
	}

	return 10;
}

/** Format a slider value: one decimal for fractional steps, whole numbers otherwise. @internal */
function makeNumberFormatter(step: number): (value: number) => string {
	return (value: number) => (step < 1 ? value.toFixed(1) : value.toFixed(0));
}

/** Parse a slider's editable text back to a number, tolerating stray non-numeric characters. @internal */
function parseNumber(raw: string): number {
	return parseFloat(raw.replace(/[^0-9.-]/g, ''));
}

/** Render a kebab-cased vocabulary value as spaced words (`graphic-novel` → `graphic novel`). @internal */
function formatChipLabel(value: string): string {
	return value.replace(/-/g, ' ');
}

/**
 * The default registry — one renderer per rule type the books config declares. Consumers can spread
 * this into a new `Map` and override/extend entries (e.g. a `HierarchicalRule` control on another route).
 */
export const defaultControlRegistry: ControlRegistry = new Map<string, ControlRenderer>([
	[
		'InSetRule',
		(context) => (
			<ChipSection
				ruleId={context.ruleId}
				field={context.field}
				label={context.label}
				options={context.vocab.distinctStrings(context.field)}
				formatLabel={formatChipLabel}
			/>
		),
	],
	[
		'RangeRule',
		(context) => {
			const config = context.entry.config as { readonly max: number; readonly min: number };
			const step = deriveStep(config.min, config.max);
			const baseline = context.vocab.numericBounds(context.field, { max: config.max, min: config.min }, step);

			return (
				<RangeSection
					ruleId={context.ruleId}
					field={context.field}
					label={context.label}
					ariaLabel={`${context.label} range`}
					baseline={baseline}
					step={step}
					format={makeNumberFormatter(step)}
					parse={parseNumber}
				/>
			);
		},
	],
	[
		'BooleanRule',
		(context) => <BooleanSection ruleId={context.ruleId} field={context.field} label={context.label} />,
	],
	[
		'ExistsRule',
		(context) => <ExistsSection ruleId={context.ruleId} field={context.field} label={context.label} />,
	],
	[
		'TextSearchRule',
		(context) => (
			<TextSection
				ruleId={context.ruleId}
				field={context.field}
				label={context.label}
				placeholder={`Search ${context.label.toLowerCase()}…`}
				ariaLabel={`Search ${context.label}`}
			/>
		),
	],
	[
		'FuzzySearchRule',
		(context) => {
			const config = context.entry.config as { readonly threshold?: number };
			// Array-valued fields (e.g. `authors: string[]`) must route through Fuse's multi-key mode,
			// which the corpus tells us — the config never declares it.
			const keys = context.vocab.isArrayField(context.field) ? [context.field] : undefined;

			return (
				<FuzzySection
					ruleId={context.ruleId}
					field={context.field}
					label={context.label}
					placeholder={`Search ${context.label.toLowerCase()} (typo-tolerant)…`}
					ariaLabel={`Search ${context.label} with typo tolerance`}
					threshold={config.threshold ?? 0.4}
					{...(keys !== undefined ? { keys } : {})}
				/>
			);
		},
	],
	[
		'RegexRule',
		(context) => (
			// `RegexSection` reads its initial pattern from the *runtime* rule (via `useRule`), so the
			// config's declared pattern (reconstructed by `RegexRule.deserialize`) pre-populates the box.
			<RegexSection
				ruleId={context.ruleId}
				field={context.field}
				label={context.label}
				placeholder="a regular expression…"
				ariaLabel={`Filter ${context.label} by regular expression`}
			/>
		),
	],
]);
