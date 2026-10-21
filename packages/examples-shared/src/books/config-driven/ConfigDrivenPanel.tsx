/**
 * `<ConfigDrivenPanel />` — a filter panel rendered entirely FROM a declarative `FilterEngineConfig`.
 *
 * @remarks
 * The headline demonstration of config-driven filter UIs: rather than hand-authoring a
 * section per filter (as `BooksFilterPanel` does), this iterates `config.groups` → `filterIds`,
 * looks each rule up in `config.rules`, and renders it through the {@link ControlRegistry}. Add a
 * rule to the JSON, a control appears; remove one, it vanishes — no filter code changes. The engine
 * itself is booted with the same config via `loadConfig`, so the panel is a pure *view* of the
 * declarative filter taxonomy.
 *
 * The panel is books-scoped by design: its sections are `Book`-typed and it reads the books bundle
 * context, matching the one config-driven route (`/books-config`) it serves.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, SerializedRule } from '@filter-enginez/core';
import type { Book } from '@filter-enginez/mock-data/books';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { Fragment, useMemo } from 'react';

import { useIsEngineBusy } from '../engineBusy.js';
import { BooksBundleContext, useFetchBooksBundle } from '../filterBundle.js';
import { buildConfigBundleQuery } from './configBundleQuery.js';
import { type ControlRegistry, defaultControlRegistry, humanizeRuleId } from './controlRegistry.js';
import { buildCorpusVocabulary } from './vocabularies.js';

/**
 * Props for `<ConfigDrivenPanel />`.
 */
export interface ConfigDrivenPanelProps {
	/** The declarative config the panel renders (and the engine was booted from). */
	readonly config: FilterEngineConfig;
	/**
	 * Whether to render the panel's own "Filters" title. Defaults to `true`, which every app's sidebar
	 * uses on every viewport; a host that supplies its own titled header passes `false`.
	 */
	readonly isHeaderVisible?: boolean;
	/** Override / extend the rule-type → control mapping. Defaults to {@link defaultControlRegistry}. */
	readonly registry?: ControlRegistry;
}

/**
 * The config-driven filter panel.
 */
export const ConfigDrivenPanel = (props: ConfigDrivenPanelProps): React.ReactElement => {
	const { config, isHeaderVisible = true, registry = defaultControlRegistry } = props;
	const engine = useFilterEngine<Book>();
	const isBusy = useIsEngineBusy();
	const sourceData = engine.core.getSourceData();

	// Data-derived control inputs (chip vocabularies, slider extents, array-field detection). Rebuilds
	// only on a source-data swap.
	const vocab = useMemo(() => buildCorpusVocabulary(sourceData), [sourceData]);

	// Predictive-disable bundle — DERIVED FROM THE CONFIG (InSet → chip exclusion, Range → slider
	// bounds), fetched in one synchronous `applyFiltersAndQuery` pass per engine change, then
	// distributed via `BooksBundleContext` so chips + sliders can't drive the result set to zero.
	const bundleQuery = useMemo(() => buildConfigBundleQuery(config, vocab), [config, vocab]);
	const bundle = useFetchBooksBundle(bundleQuery);
	const bundleValue = useMemo(() => ({ bundle }), [bundle]);

	// rule id → serialized entry, for O(1) lookup while walking the group filterId lists.
	const rulesById = useMemo(() => {
		const map = new Map<string, SerializedRule>();

		for (const { id, rule } of config.rules) {
			map.set(id, rule);
		}

		return map;
	}, [config]);

	// Rule ids not claimed by any group — rendered under a trailing "Other filters" section so a
	// config that omits (or partially covers) groups still surfaces every rule.
	const ungroupedIds = useMemo(() => {
		const grouped = new Set((config.groups ?? []).flatMap((group) => group.filterIds));

		return config.rules.map((entry) => entry.id).filter((id) => !grouped.has(id));
	}, [config]);

	/** Render one rule id through the registry, skipping unmapped types / non-string fields. */
	function renderRule(ruleId: string): React.ReactElement | null {
		const entry = rulesById.get(ruleId);

		if (entry === undefined) {
			return null;
		}
		// Function extractors serialize to the lossy `'<function>'` placeholder and array-path fields
		// aren't top-level keys — neither is renderable generically, so skip them (books has neither).
		if (typeof entry.field !== 'string') {
			return null;
		}
		const renderer = registry.get(entry.type);

		if (renderer === undefined) {
			return null;
		}

		return (
			<Fragment key={ruleId}>
				{renderer({ entry, field: entry.field, label: humanizeRuleId(ruleId), ruleId, vocab })}
			</Fragment>
		);
	}

	return (
		<div className="fe-filter-panel">
			{isHeaderVisible ? <PanelHeader /> : null}
			{/* Scroll container — owns overflow + the dim-during-compute treatment, mirroring the
			    hand-authored books panel so the two read identically. */}
			<div
				className={`fe-filter-panel__scroller fe-filter-panel__body${isBusy ? ' fe-filter-panel__body--busy' : ''}`}
				aria-busy={isBusy}
			>
				<BooksBundleContext value={bundleValue}>
					{(config.groups ?? []).map((group) => (
						<GroupBlock key={group.id} label={group.displayName ?? humanizeRuleId(group.id)}>
							{group.filterIds.map((ruleId) => renderRule(ruleId))}
						</GroupBlock>
					))}
					{ungroupedIds.length > 0 ? (
						<GroupBlock label="Other filters">{ungroupedIds.map((ruleId) => renderRule(ruleId))}</GroupBlock>
					) : null}
				</BooksBundleContext>
			</div>
		</div>
	);
};

/**
 * A titled group of generated controls — the config group's `displayName` as a heading over its
 * member sections.
 *
 * @internal
 */
const GroupBlock = (props: { readonly children: React.ReactNode; readonly label: string }): React.ReactElement => {
	return (
		<section className="flex flex-col gap-1">
			{/*
				Deliberately NOT `fe-filter-section-label`. This is a GROUP heading sitting above several
				sections, so it is one level up in the hierarchy and keeps its own treatment: accent
				color and the display face, marking it as config-derived structure rather than a facet.

				16px places it between the 18px panel title and the 14px section labels it contains. Anything
				below 14px would render a group heading SMALLER than its own children and invert the
				hierarchy it exists to express.
			*/}
			<h3
				className="uppercase"
				style={{
					color: 'var(--accent)',
					fontFamily: 'var(--font-display)',
					fontSize: '16px',
					fontWeight: 600,
					letterSpacing: '0.14em',
					margin: '0 0 0.25rem',
				}}
			>
				{props.label}
			</h3>
			{props.children}
		</section>
	);
};

/**
 * Panel title — fixed at the top, outside the scroller. Mirrors the hand-authored books panel header.
 *
 * @internal
 */
const PanelHeader = (): React.ReactElement => {
	return (
		<div className="fe-filter-panel__header">
			<h2 className="fe-filter-panel__title">Filters</h2>
			<p
				className="text-xs"
				style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', margin: '0.25rem 0 0' }}
			>
				generated from config
			</p>
		</div>
	);
};
