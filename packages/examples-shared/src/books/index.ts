/**
 * `@filter-enginez/examples-shared/books` — the books domain slice shared by the example apps.
 *
 * @remarks
 * Mirror of the `./wine` slice: state-agnostic presentation (`BooksCard`, the result grid + filter
 * panel) + orchestration (the main-thread engine boot + its progress pub/sub, the `buildBooksEngine`
 * factory, the app-singleton `engineBusy` tracker). The panel / grid / sections are Redux-free and
 * identical across the RTK + plain apps, so they live here (shared) rather than being duplicated;
 * only the app shell (`BooksApp`) + results header stay per-app, where the RTK vs plain reactive
 * surfaces (Redux mirror vs raw signals) actually diverge.
 *
 * @packageDocumentation
 */

// ── Presentation ──────────────────────────────────────────────────────────────
export { BooksCard, type BooksCardProps } from './BooksCard.js';
export { BooksResultGrid } from './BooksResultGrid.js';
export { BooksFilterPanel, type BooksFilterPanelProps } from './BooksFilterPanel.js';

// ── Config-driven panel (the "UI is a function of the data" showcase) ──
export { ConfigDrivenPanel, type ConfigDrivenPanelProps } from './config-driven/ConfigDrivenPanel.js';
export { ConfigJsonView, type ConfigJsonViewProps } from './config-driven/ConfigJsonView.js';
export {
	type ControlContext,
	type ControlRegistry,
	type ControlRenderer,
	defaultControlRegistry,
	humanizeRuleId,
} from './config-driven/controlRegistry.js';
export { buildCorpusVocabulary, type CorpusVocabulary } from './config-driven/vocabularies.js';

// ── Engine boot (main-thread over the bundled default tier) ──
// The signals-wrapped boot; the surface-neutral core boot + progress store live in `bootBooksCore`.
export { type BooksEngineBundle, bootBooksEngine } from './booksEngine.js';
export {
	type BooksBootMeta,
	type BooksBootProgress,
	type BooksCoreBundle,
	bootBooksCore,
	getBooksBootProgressSnapshot,
	subscribeBooksBootProgress,
} from './bootBooksCore.js';

// ── Config-driven engine boot (loads booksFilterConfig via loadConfig) ──
export {
	type BooksConfigBootProgress,
	type BooksConfigEngineBundle,
	bootBooksConfigEngine,
	getBooksConfigBootProgressSnapshot,
	getBootedBooksFilterConfig,
	subscribeBooksConfigBootProgress,
} from './bootBooksConfigEngine.js';

// ── Shared engine builder (single source of truth for the boot path) ──
export { buildBooksEngine } from './buildBooksEngine.js';

// ── Render-timed scheduling (dataset-agnostic; shared across every dataset slice) ──
export {
	commitFilterMutation,
	executeAfterRender,
	type FilterMutationSteps,
} from '../scheduling/index.js';

// ── Busy tracker (books' own instance over the library's createEngineBusyTracker) ──
export {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} from './engineBusy.js';
