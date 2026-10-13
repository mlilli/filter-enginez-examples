/**
 * `books-domain/vocabulary` — pure, framework-neutral vocabulary + baseline derivation for the books
 * panel.
 *
 * @remarks
 * The books panel derives its chip vocabularies + the three numeric slider baselines from the resident
 * corpus via `uniqueSorted` + `deriveBaseline`. The Vue, Svelte, vanilla and Angular books panels all
 * import from here, so their vocab + slider track geometry derive identically. No engine / framework /
 * browser imports; safe to unit-test in isolation.
 *
 * **`deriveBaseline` is an alias, not an implementation.** It re-exports `react-ui`'s
 * `deriveBaselineBounds`, so every vertical — React included — derives identical slider extents from
 * one algorithm. The `./bounds` subpath is React-free by construction, so importing it here does NOT
 * taint the framework-neutral graph.
 *
 * The alias is kept because four verticals import `deriveBaseline` by that name and the books-domain
 * import is the semantically correct one for them; `react-ui` is where it lives, not where they should
 * have to look.
 *
 * @packageDocumentation
 */

export {
	deriveBaselineBounds as deriveBaseline,
	// Re-exported for the same reason as the rest of this block: a vertical reaching for a TYPE should
	// not have to add `@filter-enginez/react-ui` to its package.json.
	type HistogramBucket,
	type NumericBounds,
} from '@filter-enginez/react-ui/bounds';

/**
 * Distinct values of a string series, sorted for stable UI ordering. Non-string / nullish entries are
 * dropped so a partially-shaped corpus (e.g. a test fixture missing a field) can't inject `undefined`
 * chips — mirrors the React panel's `uniqueSorted` intent while staying defensive.
 *
 * @param values - The raw field values (may contain nullish / non-string entries).
 * @returns The sorted, de-duplicated string vocabulary.
 */
// Defined in `../../vocabulary/index.ts` — deriving a chip vocabulary belongs to no dataset, and the
// repo's package layout forbids one dataset importing from another. Re-exported so books-domain
// imports resolve; new consumers should reach for `@filter-enginez/examples-shared/vocabulary`.
export { uniqueSorted } from '../../vocabulary/index.js';

