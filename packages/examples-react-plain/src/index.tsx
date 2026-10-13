/**
 * @filter-enginez/examples-react-plain
 *
 * Demo app: React 19 + react-signals (+ url-state-router) — NO Redux. Consumes the same
 * shared presentation (`@filter-enginez/react-ui`) and wine orchestration
 * (`@filter-enginez/examples-shared/wine`) as the RTK app. The point of this example is to prove
 * the engine is state-library-agnostic: identical UI + behavior, zero Redux.
 *
 * @remarks
 * **Entry point.** The actual Vite entry is `src/main.tsx`, which mounts `<App />` (defined in
 * `src/App.tsx`) into the `#root` element from `index.html`. This file exists as a convenience
 * re-export so other packages or scripts can `import { App } from
 * '@filter-enginez/examples-react-plain'` if they ever need to embed the app in a host shell.
 *
 * @packageDocumentation
 */

export { App } from './App.js';
