/**
 * Tests for {@link useFetchFilterBundle}'s ASYNC branch.
 *
 * @remarks
 * The sibling suite covers the main-thread path. This one covers the branch the worker tier and the
 * server-backed route take: when the engine carries an `asyncEngine`, the bundle is fetched across a
 * boundary and arrives one round-trip later.
 *
 * **The case that matters is the stale one.** Filter mutations arrive far faster than a worker or an
 * HTTP round-trip resolves, so overlapping fetches are normal, not exceptional. Without the
 * `isStale` latch the LAST fetch to resolve wins rather than the LATEST one issued — and because a
 * slower earlier request usually carries a WIDER result set, the visible failure is a panel that
 * re-enables chips the user just filtered away. It looks like the filter silently failed to apply.
 *
 * A deferred promise drives the ordering explicitly. Resolving out of order is the entire point, so
 * the test must control resolution rather than await it.
 */

import { createFilterEngine, type FilterBundle, type FilterBundleQuery, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFetchFilterBundle } from './index.js';

const rows = [
	{ id: 'a', kind: 'alpha' },
	{ id: 'b', kind: 'beta' },
];

type Row = (typeof rows)[number];

const query: FilterBundleQuery = {
	chipGroups: [{ candidates: ['alpha', 'beta'], field: 'kind', kind: 'inSet', ruleId: 'kind' }],
};

afterEach(cleanup);

/** A promise plus its resolver, so a test decides WHEN a fetch completes. */
function deferred(): { promise: Promise<FilterBundle>; resolve: (bundle: FilterBundle) => void } {
	let resolve!: (bundle: FilterBundle) => void;
	const promise = new Promise<FilterBundle>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

/**
 * A bundle carrying a recognizable result count.
 *
 * @param resultCount - The count this bundle reports.
 * @returns A `FilterBundle`-shaped stub.
 */
function bundleWithCount(resultCount: number): FilterBundle {
	return { chipGroups: [], fields: [], resultCount, resultIndices: new Uint32Array() };
}

/**
 * A signals engine that also exposes an `asyncEngine`, as the worker + server tiers do.
 *
 * @param applyFiltersAndQuery - The async fetch the hook will call.
 * @returns An engine the provider accepts.
 */
function asyncEngineOver(applyFiltersAndQuery: (q: FilterBundleQuery) => Promise<FilterBundle>): SignalsEngine<Row> {
	const engine = createSignalsEngine(createFilterEngine<Row>({ sourceData: rows }));

	// Spread rather than mutate: `asyncEngine` is optional-readonly on the interface, and the hook
	// only checks for its presence.
	return { ...engine, asyncEngine: { applyFiltersAndQuery }} as unknown as SignalsEngine<Row>;
}

/** Render the hook's current bundle count, or `pending`. */
const Harness = (): React.ReactElement => {
	const bundle = useFetchFilterBundle<Row>(query);

	return <span data-testid="count">{bundle === null ? 'pending' : String(bundle.resultCount)}</span>;
};

describe('the async branch', () => {
	it('renders pending until the async engine resolves', async () => {
		const gate = deferred();
		const engine = asyncEngineOver(async () => gate.promise);

		render(<FilterEngineProvider engine={engine}><Harness /></FilterEngineProvider>);

		expect(screen.getByTestId('count').textContent).toBe('pending');

		await act(async () => {
			gate.resolve(bundleWithCount(7));
			await gate.promise;
		});

		expect(screen.getByTestId('count').textContent).toBe('7');
	});

	it('prefers the async engine over the synchronous core', async () => {
		// Both are present on a worker-backed engine. Calling the core would run the filter on the main
		// thread — the exact work the worker tier exists to avoid — and would still produce a plausible
		// bundle, so nothing downstream would look wrong.
		const core = createFilterEngine<Row>({ sourceData: rows });
		const applySync = vi.spyOn(core, 'applyFiltersAndQuery');
		const signals = createSignalsEngine(core);
		const engine = {
			...signals,
			asyncEngine: { applyFiltersAndQuery: async (): Promise<FilterBundle> => Promise.resolve(bundleWithCount(3)) },
		} as unknown as SignalsEngine<Row>;

		await act(async () => {
			await Promise.resolve();
			render(<FilterEngineProvider engine={engine}><Harness /></FilterEngineProvider>);
		});

		expect(screen.getByTestId('count').textContent).toBe('3');
		expect(applySync).not.toHaveBeenCalled();
	});

	it('ignores a fetch that resolves after its effect was torn down', async () => {
		// The stale latch. Without it this resolution calls `setBundle` on an unmounted tree — and in the
		// live app, on a tree that has since asked a NEWER question, so the panel reverts to the previous
		// answer and reads as a filter that did not take.
		const gate = deferred();
		const engine = asyncEngineOver(async () => gate.promise);
		const { unmount } = render(<FilterEngineProvider engine={engine}><Harness /></FilterEngineProvider>);
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		unmount();

		await act(async () => {
			gate.resolve(bundleWithCount(99));
			await gate.promise;
		});

		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it('shows the LATEST query\'s answer when an earlier fetch resolves last', async () => {
		// Overlapping fetches are the normal case, not an edge case: a user dragging a slider outruns a
		// worker round-trip easily. Last-to-resolve-wins would show the older, wider result set.
		const gates = [deferred(), deferred()];
		let call = 0;
		const engine = asyncEngineOver(async () => gates[call++]?.promise ?? Promise.resolve(bundleWithCount(0)));
		const { rerender } = render(<FilterEngineProvider engine={engine}><Harness /></FilterEngineProvider>);

		// A rule mutation re-keys the effect, tearing down the first fetch and issuing a second.
		await act(async () => {
			engine.core.addRule('kind', inSet<string>('kind', ['alpha']));
			await Promise.resolve();
		});
		rerender(<FilterEngineProvider engine={engine}><Harness /></FilterEngineProvider>);

		await act(async () => {
			gates[1]?.resolve(bundleWithCount(2));
			gates[0]?.resolve(bundleWithCount(500));
			await Promise.all(gates.map(async (gate) => gate.promise));
		});

		expect(screen.getByTestId('count').textContent).toBe('2');
	});
});
