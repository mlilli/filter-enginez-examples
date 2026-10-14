/**
 * Build-time constants, replaced with literals by `@angular/build`'s `define` option (`angular.json`).
 *
 * @remarks
 * `@angular/build` does not define Vite's `import.meta.env`, so this app cannot write the
 * `import.meta.env.DEV` guard the other five verticals use. `define` is its equivalent: esbuild
 * substitutes the literal before bundling, so a branch guarded by a `false` constant is removed from
 * the output together with any `import()` inside it, and no chunk is emitted for that import.
 *
 * @packageDocumentation
 */

/**
 * Whether `main.ts` starts the Mock Service Worker before bootstrapping.
 *
 * `angular.json` sets it to `false` in the base build options, which the production configuration
 * inherits, and to `true` in the development configuration that `ng serve`, `ng test` and the
 * end-to-end suite's dev server use.
 */
declare const shouldStartMockServiceWorker: boolean;
