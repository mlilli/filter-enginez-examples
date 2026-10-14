/**
 * `@filter-enginez/examples-shared/docs` — the shared documentation-site slice.
 *
 * @remarks
 * A data-driven docs section (shell + rule/algorithm pages + playground + API reference) mounted as a
 * `/docs` layout route in each React app (and as the standalone documentation site), so the docs are
 * part of the same site as the dataset demos. All content lives in `./content/*`; the pages are pure templates. Browser-only.
 *
 * ### One route object, and nothing that would load the pages
 *
 * The barrel exports {@link docsRoute} and the content types, and deliberately not the pages, the
 * layout or the content catalogs. `docsRoute` loads each of those on demand (see `docsRoutes.tsx`),
 * but only if nothing on an app's startup graph imports them statically: a re-export here is a static
 * import of the page module by every app that imports `docsRoute`, and the bundler has to keep a
 * static import of a module that may have side effects, so every docs page would be fetched by every
 * app at startup. Code inside this slice imports the page files directly.
 *
 * @packageDocumentation
 */

export type { AlgorithmDoc, CodeExample, RuleDoc, RuleFigureSpec, RuleGroup } from './content/types.js';
export { docsRoute } from './docsRoutes.js';
