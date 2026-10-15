/**
 * `@filter-enginez/examples-shared/real-estate` — the real-estate domain slice shared by the apps.
 *
 * @remarks
 * Mirror of the `./wine` + `./books` slices: state-agnostic presentation + orchestration (main-thread
 * engine boot + progress pub/sub, the `buildRealEstateEngine` factory, the route-singleton busy
 * tracker) in one self-contained folder. The location tree with its rule (`buildListingLocationRule`)
 * and the distance rule (`buildListingGeoRadiusRule`) are the rules every app commits, the same in all
 * six. Only the app shell + results header stay per-app.
 *
 * @packageDocumentation
 */

// ── Presentation ──────────────────────────────────────────────────────────────
export { RealEstateCard, type RealEstateCardProps } from './RealEstateCard.js';
export { RealEstateResultGrid } from './RealEstateResultGrid.js';
export { RealEstateFilterPanel, type RealEstateFilterPanelProps } from './RealEstateFilterPanel.js';

// ── Engine boot (main-thread over the streamed default tier) ──
// The React apps consume the signals-wrapped boot; the bare core + the progress pub/sub live one
// module down, in `bootRealEstateCore.ts`, so the RxJS vertical can boot without the signals surface.
export {
	getRealEstateBootProgressSnapshot,
	type RealEstateBootMeta,
	type RealEstateBootProgress,
	type RealEstateCoreBundle,
	subscribeRealEstateBootProgress,
} from './bootRealEstateCore.js';
export { bootRealEstateEngine, type RealEstateEngineBundle } from './realEstateEngine.js';

// ── Shared engine builder (single source of truth for the boot path) ──
export { buildRealEstateEngine } from './buildRealEstateEngine.js';

// ── Framework-neutral domain logic (re-exported for React consumers) ──
// The canonical home is `./real-estate-domain`, which the four non-React verticals import directly.
// These re-exports keep the React apps' existing import sites working — one slice, one barrel.
export {
	buildListingGeoRadiusRule,
	buildListingLocationRule,
	buildListingLocationTree,
	buildLocationNodeSpecs,
	buildRuleSummaries,
	ContainsAllRule,
	type ContainsAllRuleConfig,
	deriveGeoRadius,
	deriveLocationSelection,
	deriveMetroCenters,
	describeMapCoords,
	type FilterSummary,
	findMetroLabel,
	GEO_RADIUS_RULE_ID,
	type GeoRadius,
	kmToMiles,
	type LocationNodeSpec,
	type MapCoords,
	type MetroCenterOption,
	milesToKm,
	type PickerTreeNode,
	summarizeRule,
	writeGeoRadius,
	writeLocationSelection,
} from './real-estate-domain/index.js';

// ── Render-timed scheduling (dataset-agnostic; shared across every dataset slice) ──
export {
	commitFilterMutation,
	executeAfterRender,
	type FilterMutationSteps,
} from '../scheduling/index.js';

// ── Busy tracker (route singleton over the shared createEngineBusyModule factory) ──
export {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} from './engineBusy.js';
