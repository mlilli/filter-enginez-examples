/**
 * Tests for {@link useFetchFilterBundle}'s re-fetch keying.
 *
 * @remarks
 * The hook must key on the query's VALUE, not its reference, so a caller passing an inline object
 * literal settles instead of looping forever. Keyed on the reference, this file's first case would
 * not fail — it would HANG, which is exactly why the hazard is removed rather than documented.
 *
 * A render counter is the assertion rather than a timeout, so a regression reports "rendered 50
 * times" instead of stalling CI.
 */

import { createFilterEngine, type FilterBundleQuery, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFetchFilterBundle } from './index.js';

/** A tiny corpus — this suite is about render behavior, not filtering. */
const rows = [
	{ id: 'a', kind: 'alpha' },
	{ id: 'b', kind: 'beta' },
	{ id: 'c', kind: 'alpha' },
];

type Row = (typeof rows)[number];

/** The chip group both harnesses query for. */
const chipGroups = [{
	candidates: ['alpha', 'beta'],
	field: 'kind',
	kind: 'inSet' as const,
	ruleId: 'kind',
}];

afterEach(cleanup);

/**
 * Mount a harness and report how many times it rendered.
 *
 * @param useInlineQuery - When `true`, pass a brand-new object literal every render (the hazard).
 * @returns The render count and a handle to mutate the engine.
 */
function mountHarness(useInlineQuery: boolean): {
	readonly addRule: () => void;
	readonly getRenderCount: () => number;
} {
	const core = createFilterEngine<Row>({ sourceData: rows });
	const engine = createSignalsEngine(core);
	let renderCount = 0;

	const Harness = (): React.ReactElement => {
		renderCount += 1;

		// The control branch. Both are computed every render so the two paths differ only in which
		// reference reaches the hook.
		const memoized = useMemo<FilterBundleQuery>(() => ({ chipGroups }), []);
		const bundle = useFetchFilterBundle<Row>(useInlineQuery ? { chipGroups } : memoized);

		return <span>{bundle === null ? 'pending' : String(bundle.resultCount)}</span>;
	};

	render(
		<FilterEngineProvider engine={engine}>
			<Harness />
		</FilterEngineProvider>,
	);

	return {
		addRule: () => {
			act(() => {
				core.addRule('kind', inSet<string>('kind', ['alpha']));
			});
		},
		getRenderCount: () => renderCount,
	};
}

describe('useFetchFilterBundle', () => {
	it('settles with a NON-MEMOIZED query instead of looping', () => {
		// The regression guard. A reference-keyed effect would still be re-rendering here.
		const harness = mountHarness(true);

		expect(harness.getRenderCount()).toBeLessThan(10);
	});

	it('settles with a memoized query too', () => {
		const harness = mountHarness(false);

		expect(harness.getRenderCount()).toBeLessThan(10);
	});

	it('re-fetches when the engine changes, and settles again', () => {
		const harness = mountHarness(true);
		const afterMount = harness.getRenderCount();

		harness.addRule();

		// It must react to the engine change...
		expect(harness.getRenderCount()).toBeGreaterThan(afterMount);
		// ...without that reaction becoming a new loop.
		expect(harness.getRenderCount()).toBeLessThan(afterMount + 10);
	});
});
