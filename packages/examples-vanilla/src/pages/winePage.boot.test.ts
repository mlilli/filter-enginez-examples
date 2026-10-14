/**
 * The wine page's BOOT — the three caption states and the progress subscription's lifetime.
 *
 * @remarks
 * ## Why a second file beside `winePage.test.ts`
 *
 * That suite drives a MOUNTED page: it resolves the boot immediately, hands the shell a hand-driven
 * engine, and asks questions about repaint wiring. This one never gets that far on purpose — every
 * case here happens while the boot is still in flight, so the boot promise is held open by the test
 * rather than resolved by the fixture. The two need opposite things from the same three mocks, and
 * one file serving both would mean a factory with a mode switch in it.
 *
 * The split follows the `<Module>.<aspect>.test.ts` convention used elsewhere in this repo
 * (`WineView.presets`, `WineFilterPanel.seed`, `urlState.format`).
 *
 * ## `winePageShell.ts` is mocked, and that is a narrowing rather than a shortcut
 *
 * The shell is a separate module with its own 100% coverage, reached through the sibling suite. What
 * this file needs from it is one line — `container.replaceChildren()` (`winePageShell.ts:99`), which
 * is what detaches the boot screen — because a DETACHED caption is how the listener-leak cases below
 * observe the leak. Standing up a real engine to assert a string about unsubscribing would test the
 * shell twice and this module's boot once.
 *
 * ## What these cases pin
 *
 * Every branch here is `setProgress`, and the module docblock argues for exactly the behavior they
 * encode: that a zero total must not claim `0 / 0 bottles`, and that a caption frozen on the final
 * count "reads as a hang precisely when the user is most likely to reload".
 *
 * @packageDocumentation
 */

import type { WineBootProgress } from '@filter-enginez/examples-shared/wine-core';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RouteTeardown } from '../router.js';

/** The wine-core progress pub/sub's listener shape. */
type ProgressListener = (progress: WineBootProgress | null) => void;

/**
 * The mocked pub/sub, standing in for `wineEngine.ts`'s module-level registry.
 *
 * @remarks
 * A real `Set` rather than a `vi.fn`, because every case below asks whether a listener is still
 * REGISTERED, and the honest way to answer that is to emit through the registry and watch what the
 * caption does — not to assert that an unsubscribe function was called.
 */
const progressListeners = new Set<ProgressListener>();

/** What `getWineBootProgressSnapshot` answers, mirroring the real module's frozen `currentProgress`. */
let progressSnapshot: WineBootProgress | null = null;

/** Settles the boot the current test is holding open. Assigned when `bootWineAsyncEngine` is called. */
let bootControls: { readonly reject: (reason: unknown) => void; readonly resolve: () => void } | null = null;

/**
 * Fired synchronously from inside `bootWineAsyncEngine`, so a case can reproduce the real module's
 * defining behavior: it starts streaming — and publishing — the moment it is called.
 */
let onBootCalled: (() => void) | null = null;

/** The in-flight `renderWinePage` call, held so no case leaves a floating promise behind. */
let pendingBoot: Promise<RouteTeardown> | null = null;

/**
 * Publish a progress value to every subscriber and update the snapshot, as the real module does.
 *
 * @param progress - The value to publish.
 */
function emitProgress(progress: WineBootProgress | null): void {
	progressSnapshot = progress;
	// Copied before iterating: a listener that unsubscribes itself would otherwise mutate the set
	// mid-walk, which is the real module's behavior too.
	for (const listener of [...progressListeners]) {
		listener(progress);
	}
}

vi.mock('@filter-enginez/examples-shared/wine-core', () => ({
	bootWineAsyncEngine: async (): Promise<unknown> => {
		// Synchronous, and it must stay that way: the real module starts streaming — and publishing —
		// on call, which is the behavior the subscribe-ordering case reproduces. Nothing may be awaited
		// above this line.
		onBootCalled?.();

		// Deliberately never settles on its own. Every case here is about the window BEFORE the engine
		// is up, so the test decides when — and whether — that window closes.
		const booted = await new Promise((resolve, reject) => {
			bootControls = {
				reject,
				resolve: () => {
					resolve({ asyncEngine: {}, meta: { source: 'synthetic-full-tier' }});
				},
			};
		});

		return booted;
	},
	describeWineCorpusTier: (): string => 'full corpus · synthetic',
	getWineBootProgressSnapshot: (): WineBootProgress | null => progressSnapshot,
	subscribeWineBootProgress: (listener: ProgressListener): (() => void) => {
		progressListeners.add(listener);

		return () => {
			progressListeners.delete(listener);
		};
	},
}));

vi.mock('@filter-enginez/examples-shared/wine-worker-spawn', () => ({
	spawnWineWorker: (): unknown => ({}),
}));

vi.mock('@filter-enginez/reactive-signals/worker', () => ({
	createSignalsEngineFromAsync: async (): Promise<unknown> => {
		await Promise.resolve();

		return {};
	},
}));

vi.mock('./winePageShell.js', () => ({
	mountWineRoute: (routeContainer: HTMLElement): RouteTeardown => {
		routeContainer.replaceChildren();

		return () => undefined;
	},
}));

const { renderWinePage } = await import('./winePage.js');

describe('vanilla wine page — boot progress', () => {
	let container: HTMLElement;

	/**
	 * The boot screen's caption text, or the empty string once the screen is gone.
	 *
	 * @returns The caption's rendered text.
	 */
	const caption = (): string => container.querySelector('p')?.textContent ?? '';

	/**
	 * Begin a boot without awaiting it.
	 *
	 * @remarks
	 * `renderWinePage` runs everything up to its first `await` synchronously — the boot screen, the
	 * subscription and the snapshot read — so a case can emit progress the moment this returns.
	 */
	function startBoot(): void {
		pendingBoot = renderWinePage(container);
		// Fire-and-forget by design: the cases that never settle their boot would otherwise surface a
		// rejection in whichever unrelated case happened to run next. `afterEach` does the real settling.
		void pendingBoot.catch(() => undefined);
	}

	beforeEach(() => {
		document.body.replaceChildren();
		progressListeners.clear();
		progressSnapshot = null;
		bootControls = null;
		onBootCalled = null;
		pendingBoot = null;
		container = document.createElement('div');
		document.body.append(container);
	});

	afterEach(async () => {
		bootControls?.resolve();

		const teardown = await pendingBoot?.catch(() => null);

		teardown?.();
	});

	it('says the worker is spinning up before the stream reports a length', () => {
		// The guard's second half, and the reason it is not just a null check: a stream that has parsed
		// nothing and estimated nothing reports `{ loaded: 0, total: 0 }`. Rendered through the counting
		// arm that reads as "0 bottles loaded · constructing filter index" — a completed load of an empty
		// corpus, which is a failure claim about something that has not happened.
		startBoot();

		expect(caption(), 'the pre-stream caption').toBe('Spinning up worker thread');

		emitProgress({ isTotalEstimated: false, loaded: 0, source: 'synthetic-full-tier', total: 0 });

		expect(caption()).toBe('Spinning up worker thread');
	});

	it('counts up while rows are still arriving', () => {
		startBoot();
		emitProgress({ isTotalEstimated: false, loaded: 40_000, source: 'synthetic-full-tier', total: 150_000 });

		expect(caption()).toBe('Loaded 40,000 of 150,000 bottles');
	});

	it('marks the total as an estimate only while the local real corpus streams', () => {
		// The synthetic tier knows its length exactly, so the case above prints no `~`. The local real
		// corpus streams from a file whose length is unknown until it ends; its reporter says so, and
		// the caption must carry that through rather than state a guess as a fact. Vanilla hands the
		// snapshot to the shared caption unchanged, which is what keeps the flag from being dropped.
		startBoot();
		emitProgress({ isTotalEstimated: true, loaded: 40_000, source: 'full-corpus-ndjson', total: 129_907 });

		expect(caption()).toBe('Loaded 40,000 of ~129,907 bottles');
	});

	it('switches to INDEXING once the last row lands, rather than freezing on the count', () => {
		// The third caption state, and the one the module docblock exists to justify. After the final row
		// there is still a visible pause while the bitmap index builds; a caption stuck on the final
		// count reads as a hang at the exact moment a user reaches for reload.
		//
		// This state is shared: `examples-shared/boot-caption` holds the states for all twelve render
		// sites, its own suite pins the wording, and `tests/e2e/bootCaption.ts` asserts a real browser
		// reaches this state in all six verticals. What stays this case's own is the vanilla WIRING —
		// that a progress event with `loaded >= total` reaches the DOM through this route's
		// subscription, which is the half no shared test can see.
		startBoot();
		emitProgress({ isTotalEstimated: false, loaded: 150_000, source: 'synthetic-full-tier', total: 150_000 });

		expect(caption()).toBe('150,000 bottles loaded · constructing filter index');
	});

	it('is ALREADY listening when the boot starts streaming', () => {
		// `bootWineAsyncEngine` publishes from inside the stream it starts on call, so subscribing after
		// that call misses every event on a fast connection and leaves a counter that never moves —
		// which reads worse than no counter at all. Emitting from inside the boot is what makes the
		// ordering observable instead of incidental.
		onBootCalled = () => {
			emitProgress({ isTotalEstimated: false, loaded: 12_000, source: 'synthetic-full-tier', total: 150_000 });
		};
		startBoot();

		expect(caption()).toBe('Loaded 12,000 of 150,000 bottles');
	});

	it('stops listening once the engine is up', async () => {
		// Held across the mount: the shell clears the container, so after boot this node is detached and
		// nothing a leaked listener writes to it would ever be seen on screen. That is precisely why the
		// leak needs asserting here — the cost is a listener retaining a dead subtree for the life of the
		// page, and there is no visible symptom to notice it by.
		startBoot();

		const captionNode = container.querySelector('p');

		bootControls?.resolve();
		await pendingBoot;

		expect(container.contains(captionNode), 'the shell should have cleared the boot screen').toBe(false);

		emitProgress({ isTotalEstimated: false, loaded: 150_000, source: 'synthetic-full-tier', total: 150_000 });

		expect(captionNode?.textContent).toBe('Spinning up worker thread');
	});

	it('stops listening when the boot FAILS, which is why the teardown is a `.finally`', async () => {
		// A rejected boot leaves the `await` without reaching the line after it, so an unsubscribe
		// written there would never run and the listener would stay in a module-level set for the life
		// of the page. A worker that fails its handshake is the ordinary way to reach this.
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		startBoot();

		const captionNode = container.querySelector('p');

		bootControls?.reject(new Error('worker never handshook'));
		await pendingBoot;

		emitProgress({ isTotalEstimated: false, loaded: 40_000, source: 'synthetic-full-tier', total: 150_000 });

		expect(captionNode?.textContent).toBe('Spinning up worker thread');
		expect(logged).toHaveBeenCalledWith('[wine] boot failed:', expect.any(Error));
		logged.mockRestore();
	});
});

describe('vanilla wine page — a boot that fails', () => {
	let container: HTMLElement;

	beforeEach(() => {
		document.body.replaceChildren();
		progressListeners.clear();
		progressSnapshot = null;
		bootControls = null;
		onBootCalled = null;
		container = document.createElement('div');
		document.body.append(container);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	/**
	 * Start a boot, fail it with `reason`, and wait for the page to settle.
	 *
	 * @param reason - What the boot rejects with.
	 * @returns The route's teardown.
	 */
	async function failBoot(reason: unknown): Promise<RouteTeardown> {
		const rendering = renderWinePage(container);

		bootControls?.reject(reason);

		return rendering;
	}

	it('replaces the boot screen with the failure screen, naming the error and the main-thread switch', async () => {
		await failBoot(new Error('worker never handshook'));

		const alert = container.querySelector('[role="alert"]');

		// The loader is gone: a boot screen still animating over a dead boot reads as a hang.
		expect(container.querySelector('[role="img"]')).toBeNull();
		expect(alert?.textContent).toContain('The wine engine could not start.');
		// The error's own message, not its `String()` form ("Error: …").
		expect(alert?.querySelectorAll('p')[1]?.textContent).toBe('worker never handshook');
		expect(alert?.querySelector('code')?.textContent).toBe('VITE_WINE_TIER=default');
	});

	it('shows a rejection that is not an Error as its text', async () => {
		// A worker's `error` event, or a rejected `postMessage`, can reject with a bare value.
		await failBoot('worker script failed to load');

		expect(container.querySelector('[role="alert"]')?.querySelectorAll('p')[1]?.textContent).toBe('worker script failed to load');
	});

	it('still returns a teardown, which clears the failure screen on navigation', async () => {
		const teardown = await failBoot(new Error('worker never handshook'));

		teardown();

		expect(container.childElementCount).toBe(0);
	});
});
