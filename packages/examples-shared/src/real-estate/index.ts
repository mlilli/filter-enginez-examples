/**
 * `@filter-enginez/examples-shared/real-estate` — the real-estate domain slice shared by the apps.
 *
 * @remarks
 * Mirror of the `./wine` + `./books` slices: state-agnostic presentation + orchestration (main-thread
 * engine boot + progress pub/sub, the `buildRealEstateEngine` factory, the route-singleton busy
 * tracker) in one self-contained folder. The boundary field extractors (`extractListingCoords`,
 * `extractListingLocationId`) + the location tree bridge the generated filter-config to the actual
 * `Listing` shape + the core rule contracts. Only the app shell + results header stay per-app.
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
	buildListingLocationTree,
	buildLocationNodeSpecs,
	buildRuleSummaries,
	ContainsAllRule,
	type ContainsAllRuleConfig,
	deriveMetroCenters,
	describeMapCoords,
	extractListingCoords,
	extractListingLocationId,
	type FilterSummary,
	findMetroLabel,
	kmToMiles,
	listingLocationTree,
	listingMetroCenters,
	type LocationNodeSpec,
	type MapCoords,
	type MetroCenterOption,
	milesToKm,
	type PickerTreeNode,
	summarizeRule,
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
