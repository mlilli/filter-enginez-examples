/**
 * The three results headers of the signals-only app: "Clear all" is exactly one engine `clearRules`,
 * a pill's × one `removeRule`, and the pill of the rule changed last carries the "recently changed"
 * emphasis.
 *
 * @remarks
 * Each case mounts a header over a REAL engine (`createSignalsEngine` over `createFilterEngine`), so
 * the pills come from the shared summarizers and the highlight from the engine's own
 * `lastChangeRuleId` signal, and spies on the engine's `clearRules` / `removeRule`. "Clear all" must
 * be ONE `clearRules` and no `removeRule` at all — the shared `clearAllFilters` contract (one
 * `RULES_CLEARED`, one Undo) every app's header honors. The writes run a painted frame or two after
 * the click (`commitFilterMutation`), so each assertion waits for them.
 *
 * The RTK app's `resultsHeaders.test.tsx` pins the same writes travelling through Redux.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { BooksResultsHeader } from './books/BooksResultsHeader.js';
import { RealEstateResultsHeader } from './real-estate/RealEstateResultsHeader.js';
import { ResultsHeader } from './wine/ResultsHeader.js';

afterEach(() => {
	// No `globals: true`, so Testing Library registers no auto-cleanup.
	cleanup();
	vi.restoreAllMocks();
});

/** One header under test: how to build its engine and how to render it. */
interface HeaderCase {
	/** The header element. */
	readonly header: React.ReactElement;
	/** The label the rule's pill shows. */
	readonly label: string;
	/** An engine holding that rule. */
	readonly makeCore: () => FilterEngine<unknown>;
	/** A second write to the same rule, which makes it the engine's last change. */
	readonly rewrite: (core: FilterEngine<unknown>) => void;
	/** The rule id the case's engine holds. */
	readonly ruleId: string;
}

const CASES: readonly HeaderCase[] = [
	{
		header: <BooksResultsHeader />,
		label: 'Genre',
		makeCore: () => {
			const core = createFilterEngine<Book>({
				sourceData: [{ format: 'ebook', genre: 'fantasy' }, { format: 'paperback', genre: 'mystery' }] as unknown as Book[],
			});

			core.addRule('genre', inSet('genre', ['fantasy']));
			core.addRule('format', inSet('format', ['ebook']));

			return core;
		},
		rewrite: (core) => {
			core.addRule('genre', inSet('genre', ['mystery']));
		},
		ruleId: 'genre',
	},
	{
		header: <RealEstateResultsHeader />,
		label: 'Type',
		makeCore: () => {
			const core = createFilterEngine<Listing>({
				sourceData: [
					{ coordinates: { lat: 39.7, lon: -105 }, metroArea: 'Greater Denver', propertyType: 'condo' },
				] as unknown as Listing[],
			});

			core.addRule('property-type', inSet('propertyType', ['condo']));

			return core;
		},
		rewrite: (core) => {
			core.addRule('property-type', inSet('propertyType', ['condo', 'townhouse']));
		},
		ruleId: 'property-type',
	},
	{
		header: <ResultsHeader />,
		label: 'Color',
		makeCore: () => {
			const core = createFilterEngine<Wine>({ sourceData: [{ color: 'red' }] as unknown as Wine[] });

			core.addRule('color', inSet('color', ['red']));

			return core;
		},
		rewrite: (core) => {
			core.addRule('color', inSet('color', ['red', 'white']));
		},
		ruleId: 'color',
	},
];

/**
 * Render a header over its case's engine.
 *
 * @param headerCase - The case.
 * @returns The engine, with `clearRules` and `removeRule` spied on.
 */
function mount(headerCase: HeaderCase): {
	readonly clearRules: MockInstance;
	readonly core: FilterEngine<unknown>;
	readonly removeRule: MockInstance;
} {
	const core = headerCase.makeCore();
	const clearRules = vi.spyOn(core, 'clearRules');
	const removeRule = vi.spyOn(core, 'removeRule');

	render(<FilterEngineProvider engine={createSignalsEngine(core)}>{headerCase.header}</FilterEngineProvider>);

	return { clearRules, core, removeRule };
}

describe.each(CASES)('the $label header', (headerCase) => {
	it('clears every rule with ONE clearRules and no removeRule', async () => {
		const { clearRules, core, removeRule } = mount(headerCase);

		fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

		await waitFor(() => {
			expect(clearRules).toHaveBeenCalledOnce();
		});
		expect(removeRule).not.toHaveBeenCalled();
		expect(core.getRules().size).toBe(0);
	});

	it("removes one rule on its pill's ×", async () => {
		const { clearRules, removeRule } = mount(headerCase);

		fireEvent.click(screen.getByRole('button', { name: `Remove ${headerCase.label} filter` }));

		await waitFor(() => {
			expect(removeRule).toHaveBeenCalledWith(headerCase.ruleId);
		});
		expect(clearRules).not.toHaveBeenCalled();
	});

	it("highlights the pill of the engine's last-changed rule", async () => {
		const { core } = mount(headerCase);

		await act(async () => {
			headerCase.rewrite(core);
			await Promise.resolve();
		});

		const remove = screen.getByRole('button', { name: `Remove ${headerCase.label} filter` });

		expect(remove.closest('.fe-filter-chip')?.classList.contains('fe-filter-chip--recent')).toBe(true);
	});
});
