/**
 * Public surface of the shared MSW wiring — `@filter-enginez/examples-shared/mocks`.
 *
 * @remarks
 * Import this DYNAMICALLY, from inside your app's own development guard, so the bundler can drop MSW
 * from the production build. See `./startMockServiceWorker.ts` for the full rationale.
 *
 * @packageDocumentation
 */

export { startMockServiceWorker } from './startMockServiceWorker.js';
