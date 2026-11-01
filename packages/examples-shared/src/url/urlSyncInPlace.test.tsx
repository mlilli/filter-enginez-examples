/**
 * The React apps' half of following `?f=` in place: under a browser router, Back and Forward between
 * two filter states load each into the route's one engine, and the route is never mounted again.
 *
 * @remarks
 * The React apps bind the URL with `<FilterEngineUrlSync>` fed by {@link useLinkSerializer}, mounted
 * inside the dataset route; the four other apps do it with `url-state-follower`, whose own suite and
 * each app's page suite pin the same sequence. Here a route component boots its engine once (a spy
 * counts boots, as the apps' boots are counted) and renders the sync and a readout of the engine's
 * state, under react-router's `<BrowserRouter>` over jsdom's real history. The sequence is the e2e
 * suite's: a filter, its `?f=` write, a duplicated history entry, a second filter, then
 * `history.back()` and `history.forward()`, which fire real `popstate` events.
 *
 * @packageDocumentation
 */

import { createFilterEngine, type FilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLinkSerializer } from './useLinkSerializer.js';

/** A record the engine filters. */
interface Row {
	/** The faceted field. */
	readonly color: string;
}

/** Four rows over three colors. */
const ROWS: readonly Row[] = [{ color: 'red' }, { color: 'white' }, { color: 'red' }, { color: 'rosé' }];

/** Builds the route's engine; a spy, so a test can count boots. */
const bootEngine = vi.fn((): FilterEngine<Row> => createFilterEngine<Row>({ sourceData: ROWS }));

/** The engine the route booted, for the test to drive. */
let routeEngine: FilterEngine<Row> | null = null;

/**
 * The colors the engine's `color` rule holds, as the readout shows them.
 *
 * @param engine - The engine.
 * @returns The colors, comma-separated, or `none`.
 */
function colorsHeld(engine: FilterEngine<Row>): string {
	const rule = engine.exportConfig().rules.find((entry) => entry.id === 'color');
	const config = rule?.rule.config as { readonly set?: readonly string[] } | undefined;

	return config?.set?.join(',') ?? 'none';
}

/**
 * A dataset route: boots its engine once per mount, syncs it with the URL, and shows its state.
 *
 * @returns The route.
 */
const BooksLikeRoute = (): ReactElement => {
	const [engine] = useState(() => {
		const booted = bootEngine();

		routeEngine = booted;

		return booted;
	});
	const serializer = useLinkSerializer();
	const colors = useSyncExternalStore(
		(onChange) => engine.subscribe(onChange),
		() => colorsHeld(engine),
	);

	return (
		<>
			<FilterEngineUrlSync debounceMs={0} engine={engine} serializer={serializer} />
			<output data-testid="colors">{colors}</output>
		</>
	);
};

/**
 * Select `colors` in the engine, as the panel's chips do.
 *
 * @param colors - The colors the rule holds afterwards.
 */
function select(...colors: string[]): void {
	act(() => {
		routeEngine?.addRule('color', inSet<string>('color', colors));
	});
}

/**
 * Traverse history by `delta` and wait for the `popstate` it fires.
 *
 * @param delta - `-1` for Back, `1` for Forward.
 */
async function traverse(delta: -1 | 1): Promise<void> {
	await act(async () => {
		const popped = new Promise((resolve) => {
			window.addEventListener('popstate', resolve, { once: true });
		});

		window.history.go(delta);
		await popped;
	});
}

/**
 * The `?f=` in the address bar.
 *
 * @returns It, or `null`.
 */
function param(): string | null {
	return new URLSearchParams(window.location.search).get('f');
}

beforeEach(() => {
	bootEngine.mockClear();
	routeEngine = null;
	window.history.replaceState(null, '', '/books');
});

afterEach(() => {
	cleanup();
	window.history.replaceState(null, '', '/');
});

describe('<FilterEngineUrlSync> under a browser router, on Back and Forward', () => {
	it('loads each state into the route’s one engine, and never mounts the route again', async () => {
		render(
			<BrowserRouter>
				<Routes>
					<Route element={<BooksLikeRoute />} path="/books" />
				</Routes>
			</BrowserRouter>,
		);
		const readout = screen.getByTestId('colors');

		select('red');
		await waitFor(() => {
			expect(param()).not.toBeNull();
		});
		const earlier = param();

		window.history.pushState(window.history.state, '', window.location.href);
		select('red', 'white');
		await waitFor(() => {
			expect(param()).not.toBe(earlier);
		});
		const newer = param();

		await traverse(-1);
		expect(param()).toBe(earlier);
		await waitFor(() => {
			expect(screen.getByTestId('colors').textContent).toBe('red');
		});

		await traverse(1);
		expect(param()).toBe(newer);
		await waitFor(() => {
			expect(screen.getByTestId('colors').textContent).toBe('red,white');
		});

		expect(bootEngine).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('colors'), 'the route was mounted again').toBe(readout);
	});
});
