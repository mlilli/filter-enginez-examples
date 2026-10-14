/**
 * `<DatasetRoute />` — the load + boot lifecycle, the three caption states, the failure screen, and the
 * hub's prefetch.
 *
 * @remarks
 * The route is also walked incidentally by `lab/labRoute.test.tsx` (`<LabRoute />` renders
 * `<DatasetRoute />`), but that suite is asking about something else entirely. This file asserts the
 * route's own contract directly, so its coverage is earned rather than inherited. It renders the REAL
 * `<DatasetView>` (the route's lazily loaded render half), so that module's contract is asserted here
 * too, through the route that loads it.
 *
 * ### Three things the harness has to get right
 *
 * **The progress store is a real `Set`, not a `vi.fn`.** `useSyncExternalStore` re-renders only when
 * the subscribed callback actually fires and the snapshot actually changes identity; a `vi.fn()`
 * returning `undefined` subscribes to nothing and the caption never moves, so every caption case
 * would pass by rendering the idle string. `examples-vanilla`'s `winePage.boot.test.ts` made the
 * same choice for the same reason and says so.
 *
 * **The snapshot is a stored value, not a factory.** `useSyncExternalStore` compares with
 * `Object.is`; a getter returning a fresh `{ loaded, total }` literal on every call is an infinite
 * render loop rather than a failing assertion.
 *
 * **Boot starts after a load, not on mount.** The route first loads the dataset's module and its own
 * view (two dynamic imports), and only then calls `boot`, so a case that wants to settle a boot first
 * waits for the call ({@link waitForBoots}) instead of assuming it happened during the render.
 *
 * @packageDocumentation
 */

import type * as UrlStateRouter from '@filter-enginez/url-state-router';

// `act` from Testing Library, never from `react` directly: RTL's wrapper sets
// `IS_REACT_ACT_ENVIRONMENT` around the call, and React's own `act` without it prints "the current
// testing environment is not configured to support act(...)" and does not batch — so every
// assertion after an emission would be racing the render it is about.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedDataset, DatasetBootProgress, DatasetEntry, DatasetModule } from '../datasets.js';

/**
 * Props `<FilterEngineUrlSync>` was handed, one entry per render.
 *
 * @remarks
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above the imports and cannot close over an
 * ordinary `const`.
 */
const urlSyncRenders = vi.hoisted(() => [] as Record<string, unknown>[]);

/**
 * Stub `<FilterEngineUrlSync>`, keeping the rest of the package real.
 *
 * @remarks
 * The seam is chosen, not convenient. The route's contract with URL sync is exactly "render it when
 * the entry opts in, with this engine, this async config and this serializer" — it never looks
 * inside. Recording the props asserts that contract directly, while the real component's behavior
 * stays the business of `url-state-router`'s own suite. `createTaggedSerializer` is left REAL, so the
 * serializer identity being asserted is the one the route actually builds. The mock applies to the
 * route's dynamic `import('./DatasetView.js')` too, which is where the component is rendered.
 */
vi.mock('@filter-enginez/url-state-router', async (importOriginal) => {
	const actual = await importOriginal<typeof UrlStateRouter>();

	return {
		...actual,
		FilterEngineUrlSync: (props: Record<string, unknown>): React.ReactElement => {
			urlSyncRenders.push(props);

			return <div data-testid="url-sync" />;
		},
	};
});

const { DatasetRoute, prefetchDatasetRoute } = await import('./DatasetRoute.js');

/** The dataset app rendered once boot resolves. */
const DatasetApp = (): React.ReactElement => <p>the live dataset app</p>;

/** Sentinel engine internals. The route forwards these untouched, so identity IS the contract. */
const engineCore = { name: 'core' };
const engineAsync = { name: 'asyncEngine' };
const bootedEngine = { asyncEngine: engineAsync, core: engineCore } as unknown as BootedDataset['engine'];

/** One `boot()` call, with the handles that settle it. */
interface BootCall {
	/** The id of the dataset whose module was booted. */
	readonly datasetId: string;
	readonly reject: (reason: unknown) => void;
	readonly resolve: (value: BootedDataset) => void;
}

/** Progress listeners, as a real registry — see the file docblock. */
let progressListeners: Set<() => void>;
/** The current snapshot, held rather than rebuilt, so `Object.is` can do its job. */
let progressSnapshot: DatasetBootProgress | null;
/** Every `boot()` call so far, in order. */
let boots: BootCall[];

beforeEach(() => {
	progressListeners = new Set();
	progressSnapshot = null;
	urlSyncRenders.length = 0;
	boots = [];
});

afterEach(() => {
	// The root vitest config sets no `globals: true`, so Testing Library registers no auto-cleanup and
	// the next case would find the previous case's DOM still mounted.
	cleanup();
	vi.restoreAllMocks();
});

/** Publish a new boot progress and let React react to it. */
async function emitProgress(next: DatasetBootProgress | null): Promise<void> {
	await act(async () => {
		progressSnapshot = next;
		for (const listener of progressListeners) {
			listener();
		}
		await Promise.resolve();
	});
}

/** Let every pending promise settle and React render the result. */
async function flush(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	});
}

/** Wait until the route has loaded its code and `boot` has been called `count` times in all. */
async function waitForBoots(count: number): Promise<void> {
	await waitFor(() => {
		expect(boots).toHaveLength(count);
	});
}

/**
 * Build a dataset module whose boot this test controls.
 *
 * @param overrides - Fields to replace on the base module.
 * @param datasetId - The dataset its boot calls are recorded under.
 * @returns A `DatasetModule` with a real progress registry.
 */
function makeModule(overrides: Partial<DatasetModule> = {}, datasetId = 'books'): DatasetModule {
	return {
		boot: async (): Promise<BootedDataset> =>
			new Promise<BootedDataset>((resolve, reject) => {
				boots.push({ datasetId, reject, resolve });
			}),
		Component: DatasetApp,
		getProgressSnapshot: () => progressSnapshot,
		subscribeProgress: (onStoreChange: () => void) => {
			progressListeners.add(onStoreChange);

			return () => {
				progressListeners.delete(onStoreChange);
			};
		},
		...overrides,
	};
}

/**
 * Build a dataset entry whose module loads at once.
 *
 * @param overrides - Fields to replace on the base live entry.
 * @param datasetModule - The module its `load` resolves to.
 * @returns A `DatasetEntry` suitable for `<DatasetRoute entry={…} />`.
 */
function makeEntry(
	overrides: Partial<DatasetEntry> = {},
	datasetModule: DatasetModule = makeModule({}, overrides.id),
): DatasetEntry {
	return {
		id: 'books',
		label: 'Books',
		load: async () => {
			await Promise.resolve();

			return datasetModule;
		},
		recordNoun: 'books',
		tagline: 'a test dataset',
		...overrides,
	};
}

/**
 * The boot call made for one dataset.
 *
 * @param datasetId - The dataset's id.
 * @returns Its boot call.
 * @throws If that dataset has not been booted.
 */
function bootOf(datasetId: string): BootCall {
	const call = boots.find((candidate) => candidate.datasetId === datasetId);

	if (call === undefined) {
		throw new Error(`no boot call for ${datasetId}`);
	}

	return call;
}

/** Render the route and wait for its boot to start. */
async function renderBooting(entry: DatasetEntry = makeEntry()): Promise<void> {
	render(<DatasetRoute entry={entry} />);
	await waitForBoots(1);
}

/** Resolve a dataset's pending boot (books by default) and flush the resulting render. */
async function resolveBoot(datasetId = 'books'): Promise<void> {
	await act(async () => {
		bootOf(datasetId).resolve({ engine: bootedEngine });
		await Promise.resolve();
	});
	await flush();
}

describe('DatasetRoute', () => {
	it('shows the brand loader until the code has loaded and boot resolves, then the dataset app', async () => {
		await renderBooting();

		expect(screen.getByLabelText('Loading Books')).toBeDefined();
		expect(screen.queryByText('the live dataset app')).toBeNull();

		await resolveBoot();

		expect(screen.getByText('the live dataset app')).toBeDefined();
	});

	it('loads the dataset module once per mount', async () => {
		const entry = makeEntry();
		const load = vi.spyOn(entry, 'load');
		const { rerender } = render(<DatasetRoute entry={entry} />);

		await waitForBoots(1);
		rerender(<DatasetRoute entry={entry} />);
		await flush();

		expect(load).toHaveBeenCalledTimes(1);
	});

	describe('the boot caption', () => {
		it('reads as pre-stream on the first frame, before the dataset code has loaded', () => {
			// The first caption `tests/e2e/bootCaption.ts` requires. The module (and its progress store)
			// is not in hand yet on the first render, so the screen has nothing to read but the idle state.
			render(<DatasetRoute entry={makeEntry()} />);

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
		});

		it('reads as pre-stream when the total is still zero', async () => {
			// 🔴 The edge case. `{ loaded: 0, total: 0 }` is not `null` and does not satisfy `0 < 0`, so
			// without the `<= 0` guard it would fall into the third arm and render "0 books loaded ·
			// constructing filter index" — a completed-load claim about a load that has not started.
			await renderBooting();
			await emitProgress({ loaded: 0, total: 0 });

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
			expect(screen.queryByText(/constructing filter index/u)).toBeNull();
		});

		it('counts records against the tier total while streaming', async () => {
			await renderBooting();
			await emitProgress({ loaded: 40_000, total: 130_000 });

			// `toLocaleString`, so the assertion has to read `40,000` — the separators are the point of the
			// call and a bare `40000` would pass over a version that had lost it.
			expect(screen.getByText(/Loaded/u).textContent).toContain('40,000');
			// An exact total, so no tilde.
			expect(screen.getByText(/Loaded/u).textContent).toContain('of 130,000 books');
		});

		it('picks up progress that arrived before the code had loaded', async () => {
			// A revisit: the boot is cached and its store already holds a figure. The screen subscribes
			// when the module arrives and must read the CURRENT snapshot then, not wait for the next event.
			progressSnapshot = { loaded: 40_000, total: 130_000 };
			await renderBooting();

			expect(screen.getByText(/Loaded/u).textContent).toContain('40,000');
		});

		it('marks an estimated total with a tilde', async () => {
			await renderBooting();
			await emitProgress({ isTotalEstimated: true, loaded: 8_000, total: 129_907 });

			expect(screen.getByText(/Loaded/u).textContent).toContain('of ~129,907 books');
		});

		it('names the indexing pause once every record has arrived', async () => {
			// The state that earns the third arm: after the last row lands there is still a visible pause
			// while the bitmap index builds, and a caption frozen on the final count reads as a hang.
			await renderBooting();
			await emitProgress({ loaded: 130_000, total: 130_000 });

			expect(screen.getByText(/constructing filter index/u).textContent).toContain('130,000');
		});

		it('falls back to a null snapshot for a module with no progress hooks', async () => {
			// The defensive `?? noopSubscribe` / `?? nullSnapshot` pair, for a LOADED module. A module may
			// omit both and the loader has to render something rather than throw.
			await renderBooting(makeEntry({}, makeModule({ getProgressSnapshot: undefined, subscribeProgress: undefined })));
			await emitProgress({ loaded: 40_000, total: 130_000 });

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
		});

		it('renders the idle caption on the server', () => {
			// The third `useSyncExternalStore` argument. React calls `getServerSnapshot` only when
			// rendering on the server, so `renderToString` is the ONLY way to reach it — the same
			// conclusion, and the same instrument, as `examples-shared`'s `useMediaQuery.test.tsx`.
			expect(renderToString(<DatasetRoute entry={makeEntry()} />)).toContain('Spinning up worker thread');
		});
	});

	describe('URL state', () => {
		it('syncs the URL for an entry that opts in', async () => {
			await renderBooting(makeEntry({ supportsUrlState: true }));
			await resolveBoot();

			expect(screen.getByTestId('url-sync')).toBeDefined();
			expect(urlSyncRenders).toHaveLength(1);
			// Bracketed because the recorder is typed as an index signature — `noPropertyAccessFromIndexSignature`
			// is on, and the point of recording raw props is that the stub asserts nothing about their shape.
			expect(urlSyncRenders[0]?.['engine']).toBe(engineCore);
			expect(urlSyncRenders[0]?.['asyncConfig']).toBe(engineAsync);
			expect(urlSyncRenders[0]?.['serializer']).toBeDefined();
		});

		it('does not sync for an entry that does not', async () => {
			// Every dataset route opts in, wine's worker tier included (its config reaches the URL through
			// `asyncConfig`). `/lab` opts out — `labEntry` sets `supportsUrlState: false`, because it is a
			// demonstration surface, not a shareable view — and an unset flag must read the same way.
			await renderBooting();
			await resolveBoot();

			expect(screen.getByText('the live dataset app')).toBeDefined();
			expect(screen.queryByTestId('url-sync')).toBeNull();
			expect(urlSyncRenders).toEqual([]);
		});
	});

	describe('when boot fails', () => {
		it('surfaces the error message and the recovery instruction', async () => {
			await renderBooting();

			await act(async () => {
				bootOf('books').reject(new Error('corpus fetch returned 503'));
				await Promise.resolve();
			});
			await flush();

			expect(screen.getByText('Engine failed to boot')).toBeDefined();
			expect(screen.getByText('corpus fetch returned 503')).toBeDefined();
			expect(screen.getByText('Refresh the page to retry.')).toBeDefined();
		});

		it('coerces a non-Error rejection into one', async () => {
			// A rejection carrying a string would otherwise reach `<BootError>` as an `Error`-typed value
			// with no `.message`, rendering an empty paragraph where the diagnosis should be.
			await renderBooting();

			await act(async () => {
				bootOf('books').reject('the worker died');
				await Promise.resolve();
			});
			await flush();

			expect(screen.getByText('the worker died')).toBeDefined();
		});

		it('surfaces a failure to load the dataset code the same way', async () => {
			// The chunk itself failing to arrive (a deploy replaced it, the network dropped) is a boot
			// failure as far as the visitor is concerned, and gets the same screen rather than a blank one.
			const entry = makeEntry({
				load: async () => {
					await Promise.resolve();

					throw new Error('Failed to fetch dynamically imported module');
				},
			});

			render(<DatasetRoute entry={entry} />);
			await flush();

			expect(screen.getByText('Engine failed to boot')).toBeDefined();
			expect(screen.getByText('Failed to fetch dynamically imported module')).toBeDefined();
			expect(boots).toEqual([]);
		});
	});

	describe('when the dataset changes mid-boot', () => {
		// 🔴 These are deliberately NOT "unmount, then settle, then assert no console warning". That is
		// the obvious shape and it is vacuous: React 19 removed the state-update-on-unmounted-component
		// warning, so `expect(consoleError).not.toHaveBeenCalled()` passes just as happily with the
		// `isCancelled` guard deleted.
		//
		// The guard's real job is observable, and it is this: the route's effect keys on `entry`, so a
		// slow dataset's boot can land after the user has already moved on. Without the guard the
		// abandoned boot wins the race and installs its engine and page over the current dataset's. The
		// app renders the route keyed by dataset, so "moved on" is an unmount there; a re-render with a
		// new entry exercises the same cleanup, and is the harder case, because the instance survives.

		it('ignores a resolution from the dataset it has navigated away from', async () => {
			const abandoned = makeEntry({ id: 'wine', label: 'Wine reviews' });
			const current = makeEntry();
			const { rerender } = render(<DatasetRoute entry={abandoned} />);

			// Switch BEFORE the abandoned code has loaded, so its late arrival is ignored too.
			rerender(<DatasetRoute entry={current} />);
			await waitForBoots(2);

			await act(async () => {
				bootOf('wine').resolve({ engine: bootedEngine });
				await Promise.resolve();
			});
			await flush();

			// 🔴 Assert the loader, not the abandoned page's absence: both entries render the same
			// component here, so a leaked resolution would show "the live dataset app" over the WRONG
			// engine — from outside, the app simply appears before its own boot has finished.
			expect(screen.queryByText('the live dataset app')).toBeNull();
			expect(screen.getByLabelText('Loading Books')).toBeDefined();

			await resolveBoot('books');

			expect(screen.getByText('the live dataset app')).toBeDefined();
		});

		it('ignores dataset code that arrives after it has navigated away', async () => {
			// The abandoned dataset's module must not reach the boot screen either, or the screen would
			// narrate the wrong boot: the current dataset's noun over the abandoned one's counts.
			const abandonedProgress: DatasetBootProgress = { loaded: 7, total: 9 };
			const abandonedModule = makeModule(
				{ getProgressSnapshot: () => abandonedProgress, subscribeProgress: () => () => undefined },
				'wine',
			);
			let deliverAbandoned: (loaded: DatasetModule) => void = () => undefined;
			const abandoned = makeEntry({
				id: 'wine',
				label: 'Wine reviews',
				load: async () =>
					new Promise<DatasetModule>((resolve) => {
						deliverAbandoned = resolve;
					}),
			});
			const { rerender } = render(<DatasetRoute entry={abandoned} />);

			rerender(<DatasetRoute entry={makeEntry()} />);
			await waitForBoots(1);

			await act(async () => {
				deliverAbandoned(abandonedModule);
				await Promise.resolve();
			});
			await flush();

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
			expect(screen.queryByText(/Loaded/u)).toBeNull();
		});

		it('ignores a rejection from the dataset it has navigated away from', async () => {
			const abandoned = makeEntry({ id: 'wine', label: 'Wine reviews' });
			const current = makeEntry();
			const { rerender } = render(<DatasetRoute entry={abandoned} />);

			rerender(<DatasetRoute entry={current} />);
			await waitForBoots(2);

			await act(async () => {
				bootOf('wine').reject(new Error('the abandoned corpus fetch failed'));
				await Promise.resolve();
			});
			await flush();

			// A dataset the user has left cannot put the app on an error screen.
			expect(screen.queryByText('Engine failed to boot')).toBeNull();
			expect(screen.getByLabelText('Loading Books')).toBeDefined();
		});
	});
});

describe('prefetchDatasetRoute', () => {
	it('loads the dataset code without booting it', async () => {
		const entry = makeEntry();
		const load = vi.spyOn(entry, 'load');

		prefetchDatasetRoute(entry);
		await flush();

		expect(load).toHaveBeenCalledTimes(1);
		// Code only: the engine boot, and the corpus it streams, wait for the route.
		expect(boots).toEqual([]);
	});

	it('drops a failed prefetch rather than leaving it unhandled', async () => {
		// Vitest fails a run on an unhandled rejection, so this case passing IS the assertion that the
		// failure was caught: the route's own load reports it, on arrival, on the boot-error screen.
		const entry = makeEntry({
			load: async () => {
				await Promise.resolve();

				throw new Error('offline');
			},
		});
		const load = vi.spyOn(entry, 'load');

		prefetchDatasetRoute(entry);
		await flush();

		expect(load).toHaveBeenCalledTimes(1);
	});
});
