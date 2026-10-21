/**
 * The three results headers' writes, as the Redux app makes them: every one a forwarded intent the
 * Redux DevTools can see, and "Clear all" exactly one engine `clearRules`.
 *
 * @remarks
 * Each case mounts a header over a REAL engine and a REAL mirror store (`createMirrorStore`, so the
 * forwarding middleware and `attachEngineToStore` are the production ones) and spies on two seams:
 * `store.dispatch`, which proves the intent travelled through Redux, and the engine's own
 * `clearRules` / `removeRule`, which prove it arrived. A header that called the engine directly would
 * pass the second half and fail the first; one that dispatched an intent no middleware handled would
 * pass the first and fail the second.
 *
 * "Clear all" must be ONE `clearRules` and no `removeRule` at all — the shared `clearAllFilters`
 * contract (one `RULES_CLEARED`, one Undo) that every app's header honors. The writes run a painted
 * frame or two after the click (`commitFilterMutation`), so each assertion waits for them.
 *
 * Rendered with `react-dom` directly: this package has no Testing Library.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, inSet } from '@filter-enginez/core';
import { buildSmartFilterExpression, WINE_SMART_FILTERS } from '@filter-enginez/examples-shared/wine-domain';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BooksResultsHeader } from './books/BooksResultsHeader.js';
import { createMirrorStore } from './mirrorStore.js';
import { RealEstateResultsHeader } from './real-estate/RealEstateResultsHeader.js';
import { ResultsHeader } from './wine/ResultsHeader.js';

/** The element each case renders into, attached to the document. */
let container: HTMLElement;
/** The React root rendering into it. */
let root: Root;
/** Detaches the mirror of the case's store. */
let detachMirror: () => void = () => undefined;

beforeEach(() => {
	// React's `act` warns, and does not flush, unless the environment says it supports it.
	Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root.unmount();
	});
	detachMirror();
	container.remove();
	vi.restoreAllMocks();
});

/** What a mounted header exposes to the assertions. */
interface MountedHeader<T> {
	/** The engine the header writes to. */
	readonly core: FilterEngine<T>;
	/** Every action dispatched to the store, in order. */
	readonly dispatched: () => readonly { readonly type: string }[];
}

/**
 * Mount a header over an engine holding two InSet rules, inside its providers.
 *
 * @param core - The engine.
 * @param header - The header element.
 * @returns The engine and the dispatch log.
 */
async function mountHeader<T>(core: FilterEngine<T>, header: React.ReactElement): Promise<MountedHeader<T>> {
	const engine = createSignalsEngine(core);
	const { detach, store } = createMirrorStore<T>(core);
	const dispatch = vi.spyOn(store, 'dispatch');

	detachMirror = detach;
	await act(async () => {
		root.render(
			<Provider store={store}>
				<FilterEngineProvider engine={engine}>{header}</FilterEngineProvider>
			</Provider>,
		);
		await Promise.resolve();
	});

	return {
		core,
		dispatched: () => dispatch.mock.calls.map(([action]) => action as { readonly type: string }),
	};
}

/**
 * Click the button with this exact accessible text or `aria-label`.
 *
 * @param name - The button's label.
 */
async function clickButton(name: string): Promise<void> {
	const button = [...container.querySelectorAll('button')].find(
		(candidate) => candidate.textContent.trim() === name || candidate.getAttribute('aria-label') === name,
	);

	expect(button, `no "${name}" button`).toBeDefined();
	await act(async () => {
		button?.click();
		await Promise.resolve();
	});
}

/**
 * The forwarded intents among the dispatched actions, by method name.
 *
 * @param mounted - The mounted header.
 * @returns e.g. `['removeRule']`.
 */
function forwardedMethods(mounted: MountedHeader<unknown>): readonly string[] {
	return mounted.dispatched()
		.map((action) => /forward\/(\w+)$/u.exec(action.type)?.[1])
		.filter((method): method is string => method !== undefined);
}

/**
 * Wait for the deferred write, then assert what reached Redux and the engine.
 *
 * @param mounted - The mounted header.
 * @param clearRules - The engine's `clearRules` spy.
 * @param removeRule - The engine's `removeRule` spy.
 * @param expected - The one forwarded method expected.
 */
async function expectForwarded(
	mounted: MountedHeader<unknown>,
	clearRules: ReturnType<typeof vi.fn>,
	removeRule: ReturnType<typeof vi.fn>,
	expected: 'clearRules' | 'removeRule',
): Promise<void> {
	// Inside `act`, so the renders the write causes (the pills, the count) are flushed with it.
	await act(async () => {
		await vi.waitFor(() => {
			expect(forwardedMethods(mounted)).toEqual([expected]);
		});
	});
	if (expected === 'clearRules') {
		expect(clearRules).toHaveBeenCalledOnce();
		expect(removeRule).not.toHaveBeenCalled();
	} else {
		expect(removeRule).toHaveBeenCalledOnce();
		expect(clearRules).not.toHaveBeenCalled();
	}
}

/** Two books, so both InSet rules match something. */
const BOOKS = [
	{ format: 'ebook', genre: 'fantasy' },
	{ format: 'paperback', genre: 'mystery' },
] as unknown as Book[];

/** A books engine with a genre and a format rule. */
function booksCore(): FilterEngine<Book> {
	const core = createFilterEngine<Book>({ sourceData: BOOKS });

	core.addRule('genre', inSet('genre', ['fantasy']));
	core.addRule('format', inSet('format', ['ebook']));

	return core;
}

describe('the books results header', () => {
	it('clears every rule with ONE forwarded clearRules intent', async () => {
		const core = booksCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <BooksResultsHeader />);

		await clickButton('Clear all');

		await expectForwarded(mounted, clearRules, removeRule, 'clearRules');
		expect(core.getRules().size).toBe(0);
	});

	it("forwards a pill's × as a removeRule intent", async () => {
		const core = booksCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <BooksResultsHeader />);

		await clickButton('Remove Genre filter');

		await expectForwarded(mounted, clearRules, removeRule, 'removeRule');
		expect(removeRule).toHaveBeenCalledWith('genre');
	});

	it('highlights the pill of the rule changed last, read off the mirror', async () => {
		const core = booksCore();

		await mountHeader(core, <BooksResultsHeader />);
		await act(async () => {
			core.addRule('genre', inSet('genre', ['mystery']));
			await Promise.resolve();
		});

		const recent = container.querySelector('.fe-filter-chip--recent');

		expect(recent?.textContent).toContain('Genre');
	});
});

describe('the real-estate results header', () => {
	/** A real-estate engine with a property-type rule. */
	function realEstateCore(): FilterEngine<Listing> {
		const core = createFilterEngine<Listing>({
			sourceData: [{ coordinates: { lat: 39.7, lon: -105 }, metroArea: 'Greater Denver', propertyType: 'condo' }] as unknown as Listing[],
		});

		core.addRule('property-type', inSet('propertyType', ['condo']));

		return core;
	}

	it('clears every rule with ONE forwarded clearRules intent', async () => {
		const core = realEstateCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <RealEstateResultsHeader />);

		await clickButton('Clear all');

		await expectForwarded(mounted, clearRules, removeRule, 'clearRules');
	});

	it("forwards a pill's × as a removeRule intent", async () => {
		const core = realEstateCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <RealEstateResultsHeader />);
		const remove = container.querySelector<HTMLButtonElement>('.fe-filter-chip button');

		expect(remove).not.toBeNull();
		await clickButton(remove?.getAttribute('aria-label') ?? '');

		await expectForwarded(mounted, clearRules, removeRule, 'removeRule');
		expect(removeRule).toHaveBeenCalledWith('property-type');
	});
});

describe('the wine results header', () => {
	/** A wine engine with a color rule. */
	function wineCore(): FilterEngine<Wine> {
		const core = createFilterEngine<Wine>({ sourceData: [{ color: 'red' }] as unknown as Wine[] });

		core.addRule('color', inSet('color', ['red']));

		return core;
	}

	it('renders the shared wine pill text', async () => {
		await mountHeader(wineCore(), <ResultsHeader />);

		expect(container.querySelector('.fe-filter-chip')?.textContent).toContain('Color');
		expect(container.querySelector('.fe-filter-chip')?.textContent).toContain('red');
	});

	it('clears every rule with ONE forwarded clearRules intent', async () => {
		const core = wineCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <ResultsHeader />);

		await clickButton('Clear all');

		await expectForwarded(mounted, clearRules, removeRule, 'clearRules');
	});

	it("forwards a facet pill's × as a removeRule intent", async () => {
		const core = wineCore();
		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <ResultsHeader />);

		await clickButton('Remove Color filter');

		await expectForwarded(mounted, clearRules, removeRule, 'removeRule');
	});

	it("leaves expression mode through the forwarded clearRules seam on the smart-filter pill's ×", async () => {
		const core = wineCore();
		const expression = buildSmartFilterExpression([WINE_SMART_FILTERS[0]?.id ?? '']);

		expect(expression).not.toBeNull();
		core.setExpression(expression);

		const clearRules = vi.spyOn(core, 'clearRules');
		const removeRule = vi.spyOn(core, 'removeRule');
		const mounted = await mountHeader(core, <ResultsHeader />);

		await clickButton('Remove Smart filter filter');

		await expectForwarded(mounted, clearRules, removeRule, 'clearRules');
	});
});
