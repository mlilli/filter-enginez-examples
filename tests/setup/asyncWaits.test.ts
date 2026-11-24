/**
 * Proves `asyncWaits.ts` applied in the runner that ran this file.
 *
 * @remarks
 * Every unit-test runner here runs this file: the root config's browser project, and examples-vue's,
 * examples-sveltekit's and examples-angular's own runners. A runner that listed the setup file but did
 * not apply it, or stopped listing it, would keep the one-second default wait and a 5 s test budget,
 * and this fails there.
 *
 * Each wait below holds for 1.2 s of real time, past the one-second default and well inside the
 * shared budget.
 *
 * @packageDocumentation
 */

import { getConfig, waitFor } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';

// From the numbers-only module: importing `./asyncWaits` would apply the setup and prove nothing.
import { ASYNC_WAIT_TIMEOUT_MS } from './budgets.js';

/** Past the one-second default every wait used to have. */
const PAST_THE_OLD_DEFAULT_MS = 1_200;

/** A check that fails until `PAST_THE_OLD_DEFAULT_MS` has passed since `startedAt`. */
function heldUntilPastTheOldDefault(startedAt: number): () => void {
	return () => {
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(PAST_THE_OLD_DEFAULT_MS);
	};
}

describe('the shared async-wait budget', () => {
	it('gives testing-library waits the shared budget', () => {
		expect(getConfig().asyncUtilTimeout).toBe(ASYNC_WAIT_TIMEOUT_MS);
	});

	it('lets a testing-library wait run past one second', async () => {
		await waitFor(heldUntilPastTheOldDefault(Date.now()));
	});

	it('lets vi.waitFor run past one second when the call sets no timeout', async () => {
		await vi.waitFor(heldUntilPastTheOldDefault(Date.now()));
	});

	it('keeps a timeout the call sets itself', async () => {
		await expect(vi.waitFor(heldUntilPastTheOldDefault(Date.now()), { interval: 10, timeout: 50 })).rejects.toThrow();
		await expect(vi.waitFor(heldUntilPastTheOldDefault(Date.now()), 50)).rejects.toThrow();
	});
});
