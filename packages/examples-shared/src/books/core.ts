/**
 * `@filter-enginez/examples-shared/books-core` — the React-FREE slice of the books example.
 *
 * @remarks
 * The books slice's main barrel (`./books`) mixes framework-agnostic orchestration (engine boot +
 * boot-progress store) with React `.tsx` presentation, so importing it drags React in. This subpath
 * exposes ONLY the agnostic bits, so non-React apps (SvelteKit, Vue, vanilla, Angular) reuse the exact
 * same engine boot the React apps use.
 *
 * ### Two boots, one core — pick by reactive surface
 *
 *   - **{@link bootBooksCore}** → a bare `FilterEngine<Book>`. Surface-neutral: wrap it in whichever
 *     adapter you want (`createRxJsEngine`, `createSignalsEngine`) or drive it directly. This is the
 *     entry point for the RxJS/Angular vertical, and it lives in its own module so importing it does
 *     not pull `@preact/signals-core` into the graph.
 *   - **{@link bootBooksEngine}** → the same core already wrapped in `createSignalsEngine`, for the
 *     React / Svelte / Vue verticals.
 *
 * Both share ONE cached core, so acceleration initializes once and the corpus builds once regardless
 * of how many surfaces are in play.
 *
 * **Deliberately excluded:** `vocabularies.ts` (chip vocab + slider baselines) is React-shaped and is
 * not re-exported here. The framework-neutral `./books-domain` subpath fills that role for every
 * non-React vertical.
 *
 * The range helpers it depends on are not a taint risk: `deriveBaselineBounds` + `NumericBounds` come
 * from `@filter-enginez/react-ui/bounds`, a subpath whose module imports nothing at all, and
 * `./books-domain` re-exports that same `deriveBaselineBounds` as `deriveBaseline`.
 *
 * @packageDocumentation
 */

export { type BooksEngineBundle, bootBooksEngine } from './booksEngine.js';
export {
	type BooksBootMeta,
	type BooksBootProgress,
	type BooksCoreBundle,
	bootBooksCore,
	getBooksBootProgressSnapshot,
	subscribeBooksBootProgress,
} from './bootBooksCore.js';
export { buildBooksEngine } from './buildBooksEngine.js';
