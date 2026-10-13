/**
 * Tests for the per-dataset engine-busy module factory.
 *
 * @remarks
 * The factory exists for exactly one reason: **isolation**. Each dataset route (wine, books,
 * real-estate) owns its own tracker so one route's "computing" state cannot bleed into another's. A
 * refactor to a shared module-level tracker would pass every test that only exercises one instance,
 * then show the books route spinning because wine is busy. So the independence assertion is the point
 * of this file, not a bonus case.
 *
 * The second contract is that the forwarders are **detachable**. Consumers destructure them
 * (`const { markUserAction } = booksEngineBusy`) and pass them as bare callbacks. The tracker's
 * methods are closures rather than `this`-bound, which is what makes that safe — and what would break
 * silently, at the call site rather than here, if the tracker ever grew a `this`.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEngineBusyModule } from './createEngineBusyModule.js';

describe('createEngineBusyModule', () => {
	it('starts idle', () => {
		expect(createEngineBusyModule().getIsEngineBusy()).toBe(false);
	});

	it('is busy after a user action and idle once that version resolves', () => {
		const busy = createEngineBusyModule();

		busy.markUserAction();

		expect(busy.getIsEngineBusy()).toBe(true);

		busy.markResolvedAtLeast(busy.captureCurrentVersion());

		expect(busy.getIsEngineBusy()).toBe(false);
	});

	it('stays busy when a STALE resolution lands', () => {
		// The reason `markResolvedAtLeast` is monotonic rather than a plain assignment: an in-flight
		// fetch from before the newest action must not clear a busy state it knows nothing about, or
		// the indicator vanishes while the engine is still working.
		const busy = createEngineBusyModule();

		busy.markUserAction();

		const stale = busy.captureCurrentVersion();

		busy.markUserAction();
		busy.markResolvedAtLeast(stale);

		expect(busy.getIsEngineBusy()).toBe(true);
	});

	it('notifies subscribers on both edges and stops after unsubscribe', () => {
		const busy = createEngineBusyModule();
		const listener = vi.fn();
		const unsubscribe = busy.subscribeEngineBusy(listener);

		busy.markUserAction();

		expect(listener).toHaveBeenCalledTimes(1);

		busy.markResolvedAtLeast(busy.captureCurrentVersion());

		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		busy.markUserAction();

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('keeps two modules fully independent', () => {
		// THE reason this is a factory. A shared module-level tracker would satisfy every other test
		// here and then leave the books route showing "computing" because the wine route is busy.
		const wine = createEngineBusyModule();
		const books = createEngineBusyModule();

		wine.markUserAction();

		expect(wine.getIsEngineBusy()).toBe(true);
		expect(books.getIsEngineBusy()).toBe(false);
	});

	it('exposes forwarders that survive being detached from the module', () => {
		// Consumers destructure these and hand them to commit handlers as bare callbacks. The tracker's
		// methods are closures, not `this`-bound — a regression there would throw at the call site,
		// which is a much worse place to discover it.
		const { captureCurrentVersion, getIsEngineBusy, markResolvedAtLeast, markUserAction } = createEngineBusyModule();

		markUserAction();

		expect(getIsEngineBusy()).toBe(true);

		markResolvedAtLeast(captureCurrentVersion());

		expect(getIsEngineBusy()).toBe(false);
	});

	it('re-renders the hook as the busy state flips', () => {
		const busy = createEngineBusyModule();
		const { rerender, result } = renderHook(() => busy.useIsEngineBusy());

		expect(result.current).toBe(false);

		busy.markUserAction();
		rerender();

		expect(result.current).toBe(true);
	});
});
