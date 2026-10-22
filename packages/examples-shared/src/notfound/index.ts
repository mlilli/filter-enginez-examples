/**
 * The shared "filtered to zero" 404 slice — React barrel.
 *
 * @remarks
 * Both React apps put {@link notFoundRoute} in their route tables (`AppRouter`'s `routes`) as the final
 * (catch-all) entry, so the 404 is defined once — the same precedent as `docsRouteAt`. The React-free
 * content + logic live in `./core` (reachable via the `@filter-enginez/examples-shared/notfound-core`
 * subpath) so the non-React apps (SvelteKit, Vue, Angular, vanilla) share the exact copy + behavior.
 *
 * @packageDocumentation
 */

export { NotFoundPage } from './NotFoundPage.js';
export { notFoundRoute } from './notFoundRoute.js';
export * from './core.js';
