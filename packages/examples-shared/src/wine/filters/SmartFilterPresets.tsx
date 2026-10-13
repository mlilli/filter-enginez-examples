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
 * **Worker-safe state.** The wine engine is often worker-backed, so the reactive expression signal
 * updates a round-trip AFTER a synchronous `setExpression`. The local `selectedIds` is therefore the
 * source of truth for the chips; it is reset ONLY on a genuine `expression → null` transition (an
 * external Clear-all), never during the async settle after our own set — which is why a naïve "reset
 * when not in expression mode" effect wiped the selection.
 *
 * **Seeded from the engine, once.** That local-first design is right for every transition AFTER mount
 * and wrong for mount itself: a `?f` link calls `loadConfig` before this renders, so starting at an
 * empty selection would show filtered results with no chip lit and no way to tell which preset produced
 * them. The initial state comes from `deriveSelectedPresetIds`, which recovers the ids by matching
 * the committed expression's structure against the preset table. Seeding is deliberately restricted to
 * the initializer — adopting on every change would reintroduce exactly the round-trip race the local
 * state exists to avoid.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useExpression, useFilterEngine } from '@filter-enginez/react-signals';
import { ChipToggleGroup } from '@filter-enginez/react-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildSmartFilterExpression, deriveSelectedPresetIds, WINE_SMART_FILTERS } from '../smartFilters.js';
import { SectionHeader } from './SectionHeader.js';

/** The preset ids, in display order — the chip vocabulary. */
const PRESET_IDS: readonly string[] = WINE_SMART_FILTERS.map((preset) => preset.id);

/** id → chip label lookup. */
const PRESET_LABELS: Record<string, string> = Object.fromEntries(WINE_SMART_FILTERS.map((preset) => [preset.id, preset.label]));

/** Stable empty selection so an unset state doesn't churn referential identity. */
const EMPTY_IDS: readonly string[] = [];

/** Render a preset id as its chip label. */
function formatPresetLabel(id: string): string {
	return PRESET_LABELS[id] ?? id;
}

/**
 * The wine expression-mode preset row.
 */
export const SmartFilterPresets = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const expression = useExpression();
	// Read straight off `engine.core` rather than from the `useExpression()` signal above: a `?f`
	// restore has already called `loadConfig`, so the expression is on the engine now, while the signal
	// can still be a round-trip behind on the worker tier. Only the two initializers below consume
	// this — it is a mount-time seed, so a later recompute is deliberately ignored.
	const seededIds = useMemo(() => deriveSelectedPresetIds(engine.core.getExpression()), [engine]);
	// More than one preset can only have been committed through "Match any (OR)", so the mode restores
	// with the selection — otherwise the chips would come back multi-selected in single-select mode,
	// and the next click would silently drop the others.
	const [isMulti, setIsMulti] = useState(() => seededIds.length > 1);
	const [selectedIds, setSelectedIds] = useState<readonly string[]>(() => (seededIds.length > 0 ? seededIds : EMPTY_IDS));
	const previousExpressionRef = useRef(expression);

	// Reset the local selection ONLY on a genuine expression → null transition (an external Clear-all).
	// Our own SET is null → non-null and must never reset here — critical for the worker-backed engine,
	// where the expression signal updates a round-trip after our synchronous `setSelectedIds`.
	useEffect(() => {
		const previous = previousExpressionRef.current;

		previousExpressionRef.current = expression;

		if (previous !== null && expression === null && selectedIds.length > 0) {
			setSelectedIds(EMPTY_IDS);
		}
	}, [expression, selectedIds]);

	// Rebuild + apply the expression from a selection: none → flat-map; one → that preset; many → an
	// OR of them (a union — the set only grows, never empties).
	//
	// Built by the shared `buildSmartFilterExpression`, which is the write half of the round trip
	// `deriveSelectedPresetIds` (seeded above) reads back. Every vertical calls it rather than
	// open-coding the build, so the `or(...)` operands always come out in `WINE_SMART_FILTERS` order,
	// never in SELECTION order. Either order filters the same, but only a fixed order gives the same
	// presets picked in any order the same `?f=` string in every vertical — which is what keeps a
	// shared or `/compare` link round-tripping.
	const applySelection = useCallback((ids: readonly string[]): void => {
		engine.core.setExpression(buildSmartFilterExpression(ids));
		setSelectedIds(ids);
	}, [engine]);

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
		engine.core.setExpression(null);
		setSelectedIds(EMPTY_IDS);
	}, [engine]);

	// Switching selection style resets the current selection so the two modes never blur together.
	const changeMode = useCallback((multi: boolean): void => {
		setIsMulti(multi);
		engine.core.setExpression(null);
		setSelectedIds(EMPTY_IDS);
	}, [engine]);

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
