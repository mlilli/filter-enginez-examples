/**
 * The `/compare` slice, React-free — reachable as `@filter-enginez/examples-shared/compare-core`.
 *
 * @remarks
 * Everything `/compare` needs that is not a component: which datasets it covers, where each vertical
 * lives, how one serialized state becomes a link per serving vertical, and the ready-made states for
 * a cold visit.
 * Framework-free and DOM-free by construction — {@link CompareLocation} is structural, so nothing
 * here reads a global.
 *
 * The split follows `notfound/core.ts`: the two React apps consume the
 * component from `../compare`, and the four non-React verticals build their own shells over exactly
 * this module. That is the only shape that reaches all six — `docsRoute` and `notFoundRoute` are
 * `RouteObject`s, which only react-router can mount.
 *
 * @packageDocumentation
 */

export * from './copy.js';
export * from './links.js';
export * from './origins.js';
export * from './presets.js';
export * from './state.js';
export * from './target.js';
