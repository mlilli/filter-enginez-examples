/**
 * `configBundleQuery.ts` — derive a `FilterBundleQuery` from a declarative config.
 *
 * @remarks
 * Step 2 of the config-driven showcase: the never-zero predictive-disable UX is itself generated
 * from the config. Each `InSetRule` becomes a chip-exclusion group (so a chip whose selection would
 * empty the results dims out), and each `RangeRule` becomes a filtered-except-self field-bounds
 * request (so a slider's dimmed "available" zone tracks the other active filters). The engine
 * answers all of it in one `applyFiltersAndQuery` pass — the same single-round-trip bundle the
 * hand-authored books panel uses, only here the query is a function of the config, not hand-written.
 *
 * Rule types without a bundle candidate kind (Boolean / Exists / Regex / …) are simply omitted; their
 * toggles predictive-disable independently via `useIsToggleDisabled`.
 *
 * @packageDocumentation
 */

import type { FilterBundleQuery, FilterEngineConfig } from '@filter-enginez/core';

import { sliderBucketCount } from '@filter-enginez/react-ui';

import { deriveStep } from './controlRegistry.js';
import { type CorpusVocabulary } from './vocabularies.js';

/** One entry of the query's `chipGroups` array. */
type ChipGroupQuery = NonNullable<FilterBundleQuery['chipGroups']>[number];
/** One entry of the query's `fields` array. */
type FieldQuery = NonNullable<FilterBundleQuery['fields']>[number];

/**
 * Build the predictive-disable `FilterBundleQuery` for a config: `InSetRule`s → chip-exclusion
 * groups (corpus vocabulary as candidates), `RangeRule`s → filtered-except-self field requests
 * (baseline padded identically to the rendered slider, via {@link deriveStep}).
 *
 * @param config - The declarative config the panel renders.
 * @param vocab - Corpus-derived vocabularies/bounds (shared with the control registry).
 */
export function buildConfigBundleQuery(config: FilterEngineConfig, vocab: CorpusVocabulary): FilterBundleQuery {
	const chipGroups: ChipGroupQuery[] = [];
	const fields: FieldQuery[] = [];

	for (const { id, rule } of config.rules) {
		if (typeof rule.field !== 'string') {
			continue;
		}
		if (rule.type === 'InSetRule') {
			chipGroups.push({ candidates: vocab.distinctStrings(rule.field), field: rule.field, kind: 'inSet', ruleId: id });
		} else if (rule.type === 'RangeRule') {
			const rangeConfig = rule.config as { readonly max: number; readonly min: number };
			const baseline = vocab.numericBounds(
				rule.field,
				{ max: rangeConfig.max, min: rangeConfig.min },
				deriveStep(rangeConfig.min, rangeConfig.max),
			);

			fields.push({
				baselineMax: baseline.max,
				baselineMin: baseline.min,
				// Derived from the corpus rather than from a table, because a config declares a field's
				// bounds and never its granularity. Omitting it would take the engine's 12-bucket default,
				// so `/books-config` would draw 12 bars where `/books` next door draws 76 over the same
				// field — the divergence a config-driven twin exists to make impossible.
				bucketCount: sliderBucketCount(baseline, vocab.numericValueStep(rule.field)),
				fieldKey: rule.field,
				ruleId: id,
			});
		}
	}

	return { chipGroups, fields };
}
