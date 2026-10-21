/**
 * `@filter-enginez/examples-shared/search` — dataset-agnostic search-input helpers shared across the
 * example apps.
 *
 * @remarks
 * The React binding. The timing contract it binds is React-free and lives at `./search-core`, where
 * the other four apps' search fields import it.
 *
 * @packageDocumentation
 */

export { type TypeaheadSearchBinding, type TypeaheadSearchParams, useTypeaheadSearch } from './useTypeaheadSearch.js';
