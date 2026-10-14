/**
 * The comparison slice, React-free — reachable as `@filter-enginez/examples-shared/compare-core`.
 *
 * @remarks
 * Everything the comparison page at `filterenginez.com/compare` and the Compare button in every app
 * need that is not markup: which datasets it covers, where each vertical and the landing site live,
 * how one serialized state becomes a link per serving vertical, the URL that carries a visitor's state
 * to the page, and the ready-made states for a cold visit.
 *
 * Framework-free and DOM-free by construction — {@link CompareLocation} is structural, so nothing
 * here reads a global. That is what lets one module serve all six apps' buttons, in five framework
 * idioms, and the landing site's page, which renders at build time under Node and again in the
 * browser.
 *
 * @packageDocumentation
 */

export * from './copy.js';
export * from './links.js';
export * from './origins.js';
export * from './presets.js';
export * from './state.js';
export * from './target.js';
