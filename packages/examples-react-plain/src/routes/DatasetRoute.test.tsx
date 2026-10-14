/**
 * `<DatasetRoute />` — the boot lifecycle, the three caption states, and the failure screen.
 *
 * @remarks
 * The route is also walked incidentally by `lab/labRoute.test.tsx` (`<LabRoute />` renders
 * `<DatasetRoute />`), but that suite is asking about something else entirely. This file asserts the
 * route's own contract directly, so its coverage is earned rather than inherited.
 *
 * ### Two things the harness has to get right
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
 * @packageDocumentation
 */

import type * as UrlStateRouter from '@filter-enginez/url-state-router';

// `act` from Testing Library, never from `react` directly: RTL's wrapper sets
// `IS_REACT_ACT_ENVIRONMENT` around the call, and React's own `act` without it prints "the current
// testing environment is not configured to support act(...)" and does not batch — so every
// assertion after an emission would be racing the render it is about.
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedDataset, DatasetBootProgress, DatasetEntry } from '../datasets.js';

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
 * The seam is chosen, not convenient. `<DatasetRoute>`'s contract with URL sync is exactly "render it
 * when the entry opts in, with this engine, this async config and this serializer" — it never looks
 * inside. Recording the props asserts that contract directly, while the real component's behavior
 * stays the business of `url-state-router`'s own suite. `createTaggedSerializer` is left REAL, so the
 * serializer identity being asserted is the one the route actually builds.
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

const { DatasetRoute } = await import('./DatasetRoute.js');

/** The dataset app rendered once boot resolves. */
const DatasetApp = (): React.ReactElement => <p>the live dataset app</p>;

/** Sentinel engine internals. `<DatasetRoute>` forwards these untouched, so identity IS the contract. */
const engineCore = { name: 'core' };
const engineAsync = { name: 'asyncEngine' };
const bootedEngine = { asyncEngine: engineAsync, core: engineCore } as unknown as BootedDataset['engine'];

/** Progress listeners, as a real registry — see the file docblock. */
let progressListeners: Set<() => void>;
/** The current snapshot, held rather than rebuilt, so `Object.is` can do its job. */
let progressSnapshot: DatasetBootProgress | null;
/** Settles the pending `boot()` promise. */
let settleBoot: { readonly reject: (reason: unknown) => void; readonly resolve: (value: BootedDataset) => void };

beforeEach(() => {
	progressListeners = new Set();
	progressSnapshot = null;
	urlSyncRenders.length = 0;
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

/**
 * Build a dataset entry whose boot this test controls.
 *
 * @param overrides - Fields to replace on the base live entry.
 * @returns A `DatasetEntry` suitable for `<DatasetRoute entry={…} />`.
 */
function makeEntry(overrides: Partial<DatasetEntry> = {}): DatasetEntry {
	return {
		boot: async (): Promise<BootedDataset> =>
			new Promise<BootedDataset>((resolve, reject) => {
				settleBoot = { reject, resolve };
			}),
		Component: DatasetApp,
		getProgressSnapshot: () => progressSnapshot,
		id: 'books',
		label: 'Books',
		recordNoun: 'books',
		subscribeProgress: (onStoreChange: () => void) => {
			progressListeners.add(onStoreChange);

			return () => {
				progressListeners.delete(onStoreChange);
			};
		},
		tagline: 'a test dataset',
		...overrides,
	};
}

/** Resolve the pending boot and flush the resulting render. */
async function resolveBoot(): Promise<void> {
	await act(async () => {
		settleBoot.resolve({ engine: bootedEngine });
		await Promise.resolve();
	});
}

describe('DatasetRoute', () => {
	it('shows the brand loader until boot resolves, then the dataset app', async () => {
		render(<DatasetRoute entry={makeEntry()} />);

		expect(screen.getByLabelText('Loading Books')).toBeDefined();
		expect(screen.queryByText('the live dataset app')).toBeNull();

		await resolveBoot();

		expect(screen.getByText('the live dataset app')).toBeDefined();
	});

	describe('the boot caption', () => {
		it('reads as pre-stream before any progress arrives', () => {
			render(<DatasetRoute entry={makeEntry()} />);

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
		});

		it('reads as pre-stream when the total is still zero', async () => {
			// 🔴 The edge case. `{ loaded: 0, total: 0 }` is not `null` and does not satisfy `0 < 0`, so
			// without the `<= 0` guard it would fall into the third arm and render "0 books loaded ·
			// constructing filter index" — a completed-load claim about a load that has not started.
			render(<DatasetRoute entry={makeEntry()} />);
			await emitProgress({ loaded: 0, total: 0 });

			expect(screen.getByText('Spinning up worker thread')).toBeDefined();
			expect(screen.queryByText(/constructing filter index/u)).toBeNull();
		});

		it('counts records against the tier total while streaming', async () => {
			render(<DatasetRoute entry={makeEntry()} />);
			await emitProgress({ loaded: 40_000, total: 130_000 });

			// `toLocaleString`, so the assertion has to read `40,000` — the separators are the point of the
			// call and a bare `40000` would pass over a version that had lost it.
			expect(screen.getByText(/Loaded/u).textContent).toContain('40,000');
			// An exact total, so no tilde.
			expect(screen.getByText(/Loaded/u).textContent).toContain('of 130,000 books');
		});

		it('marks an estimated total with a tilde', async () => {
			render(<DatasetRoute entry={makeEntry()} />);
			await emitProgress({ isTotalEstimated: true, loaded: 8_000, total: 129_907 });

			expect(screen.getByText(/Loaded/u).textContent).toContain('of ~129,907 books');
		});

		it('names the indexing pause once every record has arrived', async () => {
			// The state that earns the third arm: after the last row lands there is still a visible pause
			// while the bitmap index builds, and a caption frozen on the final count reads as a hang.
			render(<DatasetRoute entry={makeEntry()} />);
			await emitProgress({ loaded: 130_000, total: 130_000 });

			expect(screen.getByText(/constructing filter index/u).textContent).toContain('130,000');
		});

		it('falls back to a null snapshot for an entry with no progress hooks', () => {
			// The defensive `?? noopSubscribe` / `?? (() => null)` pair. A registry entry may omit both —
			// `labEntry` does — and the loader has to render something rather than throw.
			render(<DatasetRoute entry={makeEntry({ getProgressSnapshot: undefined, subscribeProgress: undefined })} />);

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
			render(<DatasetRoute entry={makeEntry({ supportsUrlState: true })} />);
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
			render(<DatasetRoute entry={makeEntry()} />);
			await resolveBoot();

			expect(screen.queryByTestId('url-sync')).toBeNull();
			expect(urlSyncRenders).toEqual([]);
		});
	});

	describe('when boot fails', () => {
		it('surfaces the error message and the recovery instruction', async () => {
			render(<DatasetRoute entry={makeEntry()} />);

			await act(async () => {
				settleBoot.reject(new Error('corpus fetch returned 503'));
				await Promise.resolve();
			});

			expect(screen.getByText('Engine failed to boot')).toBeDefined();
			expect(screen.getByText('corpus fetch returned 503')).toBeDefined();
			expect(screen.getByText('Refresh the page to retry.')).toBeDefined();
		});

		it('coerces a non-Error rejection into one', async () => {
			// A rejection carrying a string would otherwise reach `<BootError>` as an `Error`-typed value
			// with no `.message`, rendering an empty paragraph where the diagnosis should be.
			render(<DatasetRoute entry={makeEntry()} />);

			await act(async () => {
				settleBoot.reject('the worker died');
				await Promise.resolve();
			});

			expect(screen.getByText('the worker died')).toBeDefined();
		});
	});

	describe('when the dataset changes mid-boot', () => {
		// 🔴 These two are deliberately NOT "unmount, then settle, then assert no console warning". That
		// is the obvious shape and it is vacuous: React 19 removed the state-update-on-unmounted-component
		// warning, so `expect(consoleError).not.toHaveBeenCalled()` passes just as happily with the
		// `isCancelled` guard deleted.
		//
		// The guard's real job is observable, and it is this: the route's effect keys on `entry`, so a
		// slow dataset's boot can land after the user has already navigated to a different one. Without
		// the guard the abandoned boot wins the race and installs its engine over the current dataset's.

		it('ignores a resolution from the dataset it has navigated away from', async () => {
			const abandoned = makeEntry({ id: 'wine', label: 'Wine reviews' });
			const current = makeEntry();
			const { rerender } = render(<DatasetRoute entry={abandoned} />);
			const settleAbandoned = settleBoot;

			rerender(<DatasetRoute entry={current} />);

			const settleCurrent = settleBoot;

			await act(async () => {
				settleAbandoned.resolve({ engine: bootedEngine });
				await Promise.resolve();
			});

			// 🔴 The symptom is NOT "the abandoned dataset renders". `Component` is read from the CURRENT
			// entry while `booted` comes from whichever boot resolved last, so a leaked resolution renders
			// the RIGHT component over the WRONG engine — from outside, the app simply appears before its
			// own corpus has finished loading. Asserting the abandoned component's absence would be the
			// obvious check, and it could never fail.
			expect(screen.queryByText('the live dataset app')).toBeNull();
			expect(screen.getByLabelText('Loading Books')).toBeDefined();

			await act(async () => {
				settleCurrent.resolve({ engine: bootedEngine });
				await Promise.resolve();
			});

			expect(screen.getByText('the live dataset app')).toBeDefined();
		});

		it('ignores a rejection from the dataset it has navigated away from', async () => {
			const abandoned = makeEntry({ id: 'wine', label: 'Wine reviews' });
			const current = makeEntry();
			const { rerender } = render(<DatasetRoute entry={abandoned} />);
			const settleAbandoned = settleBoot;

			rerender(<DatasetRoute entry={current} />);

			await act(async () => {
				settleAbandoned.reject(new Error('the abandoned corpus fetch failed'));
				await Promise.resolve();
			});

			// A dataset the user has left cannot put the app on an error screen.
			expect(screen.queryByText('Engine failed to boot')).toBeNull();
			expect(screen.getByLabelText('Loading Books')).toBeDefined();
		});
	});
});
