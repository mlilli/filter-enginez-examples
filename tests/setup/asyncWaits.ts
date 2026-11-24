/**
 * The budgets every unit-test run in this repository shares: how long an async wait may poll, and how
 * long a test or hook may run.
 *
 * @remarks
 * A setup file of all four unit-test runners: the root Vitest config (both of its browser and Node
 * projects), examples-vue's and examples-sveltekit's Vitest configs, and examples-angular's
 * `@angular/build:unit-test` target. `tests/tooling/vitestTimeouts.test.ts` fails if any of them stops
 * listing it, and `asyncWaits.test.ts` beside this file, run by each of them, proves it applied.
 *
 * ### The flake this exists to kill
 *
 * testing-library's `waitFor` and `findBy*`, and Vitest's `vi.waitFor`, poll for one second by
 * default. Under a full coverage run on a busy machine a boot that takes milliseconds alone can take
 * longer than that: three `DatasetRoute.test.tsx` tests failed a pre-push hook on that default at a load
 * average near 90, and passed on rerun. The repository has some eighty such waits across the apps, so
 * the budget is set here, once, rather than on the one call that happened to fail.
 *
 * ### Why 10 s, under a 30 s test
 *
 * A wait that never resolves should fail with its own message, naming what it was waiting for, so
 * its budget sits well under the per-test budget: a third of it. The per-test budget is the root
 * config's (`testTimeout` there explains it), applied here too because the three framework runners
 * would otherwise keep Vitest's 5 s default and cut a 10 s wait short.
 *
 * A call that passes its own timeout keeps it. The numbers live in `budgets.ts`.
 *
 * @packageDocumentation
 */

import { configure } from '@testing-library/dom';
import { vi } from 'vitest';

import { ASYNC_WAIT_TIMEOUT_MS, TEST_TIMEOUT_MS } from './budgets.js';

configure({ asyncUtilTimeout: ASYNC_WAIT_TIMEOUT_MS });

const waitForWithDefaultBudget = vi.waitFor.bind(vi);

vi.waitFor = async (callback, options) =>
	waitForWithDefaultBudget(
		callback,
		typeof options === 'number' ? options : { timeout: ASYNC_WAIT_TIMEOUT_MS, ...options },
	);

vi.setConfig({ hookTimeout: TEST_TIMEOUT_MS, testTimeout: TEST_TIMEOUT_MS });
