/**
 * `<SmartFilterPresets />` — the expression-mode demo: "smart filter" presets that drive the engine
 * with an explicit `CompositeRule` via `setExpression`.
 *
 * @remarks
 * Each preset is a curated AND / OR / NOT expression (see `WINE_SMART_FILTERS` in
 * `@filter-enginez/examples-shared/wine`). Two selection styles are toggleable so the demo shows
 * both:
 *
 *   - **Single** (default) — one preset at a time; `setExpression(preset)`.
 *   - **Match any (OR)** — several presets combine with `or(...)` into a union (wines matching ANY
 *     selected preset). The set only GROWS as presets are added, so it can never reach zero results —
 *     no predictive-disable needed here.
 *
 * **The selection is the panel's, through `useSmartFilterSelection()`.** `<WineFilterPanel>` holds it
 * (see `./smartFilterSelection.ts`), because the facet sections need it too: each one drops the active
 * preset before it commits. The chips derive from the engine's expression, so a `?f` restore, Back /
 * Forward, devtools time travel or the header's "Clear all" relights them, and the row's own click
 * paints at once and survives the worker echo.
 *
 * **A preset REPLACES the manual filters.** Every write goes through the shared
 * `commitSmartFilterSelection`, the same helper the SvelteKit, Vue, Angular and vanilla rows call: a
 * non-empty selection clears every flat facet rule first and then sets the expression, and each write
 * marks the action busy before it is made. Leaving a manual rule in place would keep it in `?f=` and on
 * the action log, dormant behind the expression, and bring it back the moment the preset was cleared.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { ChipToggleGroup } from '@filter-enginez/react-ui';
import { useCallback, useState } from 'react';

import { buildSmartFilterExpression, deriveSelectedPresetIds, WINE_SMART_FILTERS } from '../smartFilters.js';
import { commitSmartFilterSelection, exitExpressionMode } from '../wine-domain/commit.js';
import { EMPTY_SELECTION } from './filterConfig.js';
import { SectionHeader } from './SectionHeader.js';
import { useSmartFilterSelection } from './smartFilterSelection.js';

/** The preset ids, in display order — the chip vocabulary. */
const PRESET_IDS: readonly string[] = WINE_SMART_FILTERS.map((preset) => preset.id);

/** id → chip label lookup. */
const PRESET_LABELS: Record<string, string> = Object.fromEntries(WINE_SMART_FILTERS.map((preset) => [preset.id, preset.label]));

/** Render a preset id as its chip label. */
function formatPresetLabel(id: string): string {
	return PRESET_LABELS[id] ?? id;
}

/**
 * The wine expression-mode preset row. Renders inside `<WineFilterPanel>`, which provides the
 * selection.
 */
export const SmartFilterPresets = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const { paintSelection, selectedIds } = useSmartFilterSelection();
	// More than one preset can only have been committed through "Match any (OR)", so the mode follows
	// a selection of several, whether the panel seeded it or adopted it later. One-way on purpose:
	// deriving the mode from the count outright would switch OR off the moment a user in OR mode
	// deselected down to one preset, changing the mode they chose.
	const [isMulti, setIsMulti] = useState(() => selectedIds.length > 1);

	// Adjusted during render rather than in an effect, so the checkbox never paints a frame that
	// disagrees with the chips.
	if (!isMulti && selectedIds.length > 1) {
		setIsMulti(true);
	}

	// Paint a selection, then write it: none → flat-map mode; one → that preset; many → an OR of them
	// (a union — the set only grows, never empties). A non-empty selection replaces the manual
	// filters; see the module remarks.
	//
	// The local selection is read back through `buildSmartFilterExpression` and
	// `deriveSelectedPresetIds`, the same pair the engine's echo goes through, so it already equals
	// what the echo will derive: the `or(...)` operands come out in `WINE_SMART_FILTERS` order, never in
	// SELECTION order, which is also what gives the same `?f=` string in every vertical.
	const applySelection = useCallback((ids: readonly string[]): void => {
		paintSelection(deriveSelectedPresetIds(buildSmartFilterExpression(ids)));
		commitSmartFilterSelection(engine, ids);
	}, [engine, paintSelection]);

	const handleToggle = useCallback((id: string): void => {
		const isSelected = selectedIds.includes(id);
		let next: readonly string[];

		if (isSelected) {
			next = selectedIds.filter((selectedId) => selectedId !== id);
		} else if (isMulti) {
			next = [...selectedIds, id];
		} else {
			next = [id];
		}
		applySelection(next);
	}, [applySelection, isMulti, selectedIds]);

	const clearAll = useCallback((): void => {
		applySelection(EMPTY_SELECTION);
	}, [applySelection]);

	// Switching selection style resets the current selection so the two modes never blur together.
	const changeMode = useCallback((multi: boolean): void => {
		setIsMulti(multi);
		paintSelection(EMPTY_SELECTION);
		exitExpressionMode(engine);
	}, [engine, paintSelection]);

	return (
		<section style={{ borderBottom: '1px solid var(--gray-3)', paddingBottom: '16px', paddingTop: '16px' }}>
			<SectionHeader label="Smart filters" note="(expression mode)" />
			<label style={{ alignItems: 'center', color: 'var(--gray-9)', cursor: 'pointer', display: 'inline-flex', fontSize: '12px', gap: '6px', marginBottom: '10px', minHeight: '44px' }}>
				<input
					type="checkbox"
					checked={isMulti}
					onChange={(event) => changeMode(event.target.checked)}
					style={{ accentColor: 'var(--accent)', height: '16px', width: '16px' }}
				/>
				<span>Match any (OR)</span>
			</label>
			<ChipToggleGroup<string>
				options={PRESET_IDS}
				selected={selectedIds}
				onToggle={handleToggle}
				formatLabel={formatPresetLabel}
			/>
			{selectedIds.length > 0 ? (
				<div style={{ alignItems: 'center', color: 'var(--gray-9)', display: 'flex', flexWrap: 'wrap', fontSize: '12px', gap: '8px', marginTop: '10px' }}>
					<span>Manual filters are paused.</span>
					<button
						type="button"
						onClick={clearAll}
						style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, minHeight: '44px', padding: 0, textDecoration: 'underline' }}
					>
						Clear smart filters
					</button>
				</div>
			) : null}
		</section>
	);
};
