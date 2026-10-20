/**
 * `@filter-enginez/examples-shared/wine` — the wine domain slice shared by the example apps.
 *
 * @remarks
 * Holds everything wine-specific that does NOT diverge between the RTK and plain React apps:
 *
 *   - **Presentation** — `WineCard`, `WineResultGrid`, `WineFilterPanel` and its twelve filter
 *     sections, `DevtoolsPanel`. All dumb or engine-driven, styled from `@filter-enginez/ui-styles`.
 *   - **Filter plumbing** — `filterConfig` (per-slider getters, steps, fallback bounds, baseline
 *     derivation) and `filterBundle` (the predictive-disable + histogram bundle for the panel).
 *   - **Orchestration** — the size-aware engine boot (`bootWineEngine` + its progress pub/sub), the
 *     shared `buildWineEngine` factory, and the app-singleton `engineBusy` tracker.
 *
 * ### What stays per-app
 *
 * The reactive difference between the two apps is confined to a small area, because the filter
 * sections all read through `react-signals` hooks rather than either app's store. Only two files
 * genuinely diverge, and both for the same reason — they are the redux-bridge
 * demonstration:
 *
 *   - **`WineApp`** — the RTK copy reads evaluation `mode` from the Redux mirror.
 *   - **`ResultsHeader`** — the RTK copy sources `resultCount` and `activeRuleIds` from the mirror
 *     and dispatches a single facet's removal as a `forwardToEngine('removeRule')` intent, so
 *     redux-logger and the Redux DevTools see it. The plain copy reads the identical values through
 *     `useResultCount()` and removes the rule directly. Both write through the same shared wine
 *     commit helpers, so the engine records the same actions either way.
 *
 * That contrast is the whole point of maintaining two React apps, so those two stay local. Everything
 * else lives here, tested once.
 *
 * Real estate and books have sibling slices (`../real-estate`, `../books`) with the same shape —
 * presentation + orchestration together, one self-contained folder.
 *
 * @packageDocumentation
 */

// ── Presentation ──────────────────────────────────────────────────────────────
export { WineCard } from './WineCard.js';
export type { WineCardProps } from './WineCard.js';
export { WineResultGrid } from './WineResultGrid.js';
export { WineFilterPanel } from './WineFilterPanel.js';
export type { WineFilterPanelProps } from './WineFilterPanel.js';
export { DevtoolsPanel } from './DevtoolsPanel.js';
export type { DevtoolsPanelProps } from './DevtoolsPanel.js';

// ── Filter plumbing (shared by every section in the panel) ────────────────────
export {
	FALLBACK_BOUNDS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
	useBaselineBounds,
} from './filters/filterConfig.js';
export type { SliderFieldId } from './filters/filterConfig.js';

// ── Expression-mode smart-filter presets (framework-agnostic AND/OR/NOT expressions) ──
export { deriveSelectedPresetIds, WINE_SMART_FILTERS } from './smartFilters.js';
export type { WineSmartFilter } from './smartFilters.js';

// The vintage range ↔ year-set conversions. Surfaced on the React-facing barrel because the two React
// apps' own `<ResultsHeader>` summary builders format a vintage chip and must agree with the shared
// one — this keeps the FORMAT single-sourced.
export {
	formatVintage,
	formatVintageRange,
	NON_VINTAGE_YEAR,
	parseVintage,
	vintageBoundsFromSet,
	vintageYearsFromRange,
} from './wine-domain/vintage.js';

// ── Engine boot (size-aware: worker for the full corpus, main thread for the default tier) ──
export {
	bootWineEngine,
	describeBootedWineCorpusTier,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
	type WineBootProgress,
	type WineEngineBundle,
} from './wineEngine.js';

// ── Shared engine builder (single source of truth for both boot paths) ──
export { buildWineEngine } from './buildWineEngine.js';

// ── Render-timed scheduling (paint optimistic UI → disable+loader → engine, each its own frame) ──
export {
	commitFilterMutation,
	executeAfterRender,
	type FilterMutationSteps,
} from '../scheduling/index.js';

// ── Busy tracker (app singleton over the library's createEngineBusyTracker) ──
export {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} from './engineBusy.js';
