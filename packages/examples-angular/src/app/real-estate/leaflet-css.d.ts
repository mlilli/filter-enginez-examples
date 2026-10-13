/**
 * Ambient declaration for Leaflet's stylesheet side-effect import.
 *
 * @remarks
 * `@filter-enginez/examples-shared/real-estate-map` opens with `import 'leaflet/dist/leaflet.css'` —
 * the map chrome (tile pane, zoom control, attribution) is unusable without it. This app reaches that
 * module twice: an `import type` for `RadiusMapController`, and the dynamic `import()` that actually
 * loads it. Either one puts the module's SOURCE in the TypeScript program, and TypeScript then has to
 * be told what a `.css` module is:
 *
 *     error TS2882: Cannot find module or type declarations for side-effect import of
 *     'leaflet/dist/leaflet.css'.
 *
 * Every other vertical answers this with a `declare module '*.css';` in its Vite `env.d.ts`
 * (`examples-shared/src/vite-env.d.ts` has exactly that). Angular has no such file, and an ambient
 * declaration only applies when its own file is part of the program — which `examples-shared`'s is
 * not, since this app typechecks against package SOURCE with no project references.
 *
 * Declared for the ONE specifier rather than as a `*.css` wildcard, deliberately. A wildcard would
 * quietly bless any future `import './something.css'` in app code, and component styling in this
 * vertical belongs in `@filter-enginez/ui-styles` or in a `styles:` block, never in a TypeScript
 * import. Naming the specifier keeps this a note about a third-party module rather than a new
 * affordance.
 *
 * ### Its runtime counterpart lives in `angular.json`
 *
 * This declaration satisfies the TYPE checker. The BUNDLER needs one thing too, and the failure is
 * separate and later: `leaflet.css` references four PNGs by `url()`, and esbuild refuses a stylesheet
 * reached through a JavaScript import unless it has a loader for whatever that stylesheet points at —
 *
 *     ✘ [ERROR] No loader is configured for ".png" files:
 *       node_modules/leaflet/dist/images/layers.png
 *
 * — so the build target carries `"loader": { ".png": "file" }`. Vite handles this natively, which is
 * why no other vertical needs either half. **`ngc` does NOT catch the second half**, exactly as
 * `tsconfig.app.json` warns: `ng build` is the real gate on this route.
 *
 * @packageDocumentation
 */

declare module 'leaflet/dist/leaflet.css';
