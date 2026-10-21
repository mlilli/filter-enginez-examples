/**
 * `@filter-enginez/examples-shared/books-domain` — the canonical, framework-neutral home for the books
 * demo's pure domain logic, shared by every non-React vertical (Vue, Svelte, Angular, vanilla) and
 * available to React.
 *
 * @remarks
 * These concerns are identical in every app, so this module is their single source rather than a
 * copy per app:
 *
 *   - {@link ./bootCopy} — the cold-start caption's route-supplied wording.
 *   - {@link ./vocabulary} — chip vocabulary + numeric slider baseline derivation.
 *   - {@link ./bundle} — predictive-disable readers over `applyFiltersAndQuery`.
 *   - {@link ./curated} — genre super-groups, Editor's-picks Bloom, regex-compile helpers.
 *   - {@link ./ruleSummaries} — active-rule → chip-summary mapping.
 *
 * React-free by design (imports only `@filter-enginez/core`, `mock-data`, and `reactive-signals`),
 * reachable via the `./books-domain` subpath so the SvelteKit / Vue / Angular / vanilla apps consume
 * it without dragging React in — the same pattern as `./books-core`.
 *
 * @packageDocumentation
 */

export * from './bootCopy.js';
export * from './bundle.js';
export * from './curated.js';
export * from './panelCopy.js';
export * from './ruleSummaries.js';
export * from './vocabulary.js';
