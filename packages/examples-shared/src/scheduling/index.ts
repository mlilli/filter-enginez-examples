/**
 * `@filter-enginez/examples-shared/scheduling` — dataset-agnostic interaction plumbing shared by
 * every example-app dataset slice.
 *
 * @remarks
 * Two concerns live here, both shared by the wine, books and real-estate slices:
 *
 *   - **Render-timed scheduling** (`commitFilterMutation` + `executeAfterRender`) — paint the
 *     optimistic UI, then the disable + loader, then call the engine, each on its own frame.
 *   - **The engine-busy module factory** (`createEngineBusyModule`) — one busy tracker per dataset
 *     route, exposed under the convenience names every dataset uses.
 *
 * Each dataset slice (`../wine`, `../books`, `../real-estate`) re-exports from here, so its call sites
 * import from their own slice.
 *
 * ## This barrel is React-bound
 *
 * `createEngineBusyModule` imports `@filter-enginez/react-signals`, so importing anything from here
 * drags React into the graph. A non-React vertical that needs the busy core takes it from its dataset
 * slice instead — `wine-domain` re-exports `wineBusyCore` for exactly that reason — and adapts it to
 * its own reactive idiom locally.
 *
 * @packageDocumentation
 */

// ── Render-timed scheduling (paint optimistic UI → disable+loader → engine, each its own frame) ──
export {
	type AfterRenderCallback,
	commitFilterMutation,
	executeAfterRender,
	type FilterMutationSteps,
} from './renderScheduling.js';

// ── Engine-busy module factory (one tracker instance per dataset route) ──
export { createEngineBusyModule, type EngineBusyModule } from './createEngineBusyModule.js';
