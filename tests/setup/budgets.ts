/**
 * The budgets every unit-test run in this repository shares, as numbers only.
 *
 * @remarks
 * Kept apart from `asyncWaits.ts`, which applies them: importing that module applies the budgets as a
 * side effect, so `asyncWaits.test.ts` reads the numbers from here. Otherwise the test would apply the
 * setup itself and pass in a runner that never listed it.
 *
 * @packageDocumentation
 */

/** How long an async wait polls before it fails, in ms. */
export const ASYNC_WAIT_TIMEOUT_MS = 10_000;

/** How long a test or a hook may run before it fails, in ms: the root config's `testTimeout`. */
export const TEST_TIMEOUT_MS = 30_000;
