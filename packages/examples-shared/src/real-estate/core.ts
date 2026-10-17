/**
 * `@filter-enginez/examples-shared/real-estate-core` — the React-FREE slice of the real-estate example.
 *
 * @remarks
 * The real-estate slice's main barrel (`./real-estate`) mixes framework-agnostic orchestration with
 * React `.tsx` presentation — the filter panel, the result grid, the card — so importing it drags
 * React in. This subpath exposes ONLY the agnostic engine boot, so the non-React apps (SvelteKit, Vue,
 * Angular, vanilla) reuse the exact same boot the React apps use rather than reimplementing it.
 *
 * Direct mirror of `./books-core`, down to shipping **two** boots: the bare
 * {@link bootRealEstateCore} for the RxJS / Angular vertical, whose route resolver needs a
 * `FilterEngine` without dragging `@preact/signals-core` into the graph, and the signals-wrapped
 * {@link bootRealEstateEngine} for everyone else. They share ONE cache, held in
 * `bootRealEstateCore.ts` over the expensive work, so acceleration initializes once and the corpus
 * builds once no matter which surfaces are in play.
 *
 * **Angular imports the narrow `./real-estate-boot-core` subpath, not this barrel** — this one
 * re-exports `realEstateEngine.js`, which would re-admit the signals surface through the back door.
 * Same relationship `./books-boot-core` has to `./books-core`, for the same reason.
 *
 * The corpus itself comes through `loadDefaultTierCorpus`: streamed over `/api/real-estate` where the
 * development mock API serves it, and a dynamically-imported bundled copy everywhere else. That is
 * transparent to consumers: await the boot, get an engine.
 *
 * Pure logic — the extractors, the location tree, the custom rule, the chip summarizer — lives in the
 * sibling `./real-estate-domain` subpath, and the imperative Leaflet controller in `./real-estate-map`.
 *
 * @packageDocumentation
 */

export { buildRealEstateEngine } from './buildRealEstateEngine.js';
export {
	bootRealEstateCore,
	getRealEstateBootProgressSnapshot,
	type RealEstateBootMeta,
	type RealEstateBootProgress,
	type RealEstateCoreBundle,
	subscribeRealEstateBootProgress,
} from './bootRealEstateCore.js';
export { bootRealEstateEngine, type RealEstateEngineBundle } from './realEstateEngine.js';
export {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
} from './engineBusyCore.js';
