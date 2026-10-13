/**
 * The shared `/compare` slice — React barrel.
 *
 * @remarks
 * Both React apps spread {@link compareRoute} into their `createBrowserRouter([...])`, the same
 * precedent as `docsRoute` and `notFoundRoute`. The React-free half lives in `./core` (reachable via
 * `@filter-enginez/examples-shared/compare-core`) so the SvelteKit, Vue, Angular and vanilla shells
 * share the origins, routes, presets and link construction verbatim rather than re-deriving them.
 *
 * @packageDocumentation
 */

export { ComparePage } from './ComparePage.js';
export { compareRoute } from './compareRoute.js';
export * from './core.js';
