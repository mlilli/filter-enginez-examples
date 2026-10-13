/**
 * Tests for the app's shareable-URL state — shared by every dataset route.
 *
 * @remarks
 * Three things here are worth more than the line coverage they buy:
 *
 * **The `try` around `localStorage` is not defensive noise.** A browser with site data blocked
 * *throws* on `localStorage.getItem` rather than returning `null`, and an uncaught throw in a module
 * initializer takes the whole route down before it renders. That configuration is reproduced literally
 * below, because a future "simplify this" refactor would otherwise look completely safe.
 *
 * **The format round-trip is the feature.** `reEncodeUrlFormat` decodes-then-encodes rather than
 * regenerating from engine state, precisely so that flipping the toggle demonstrates the same filter
 * state surviving three encodings. A test that only asserted "the tag changed" would pass on a
 * clobbered payload, so the decoded config is compared too.
 *
 * **The module-level signal is shared state.** `urlFormat` lives at module scope so the toggle button
 * and the sync loop agree; that makes it a cross-test hazard, which is why `beforeEach` resets the
 * signal, storage and the address bar. Tests that need a *fresh* module evaluation (the ones covering
 * the initializer) re-import it under `vi.resetModules` instead.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	cycleUrlFormat,
	readConfigFromUrl,
	reEncodeUrlFormat,
	serializedFilterState,
	startEngineUrlSync,
	URL_FORMAT_LABELS,
	type UrlFormat,
	urlFormat,
} from './url-state.js';

/** Where the module persists the chosen format. Mirrors its private constant. */
const STORAGE_KEY = 'fe:url-format';

/** The debounce the sync loop coalesces commit bursts into. Mirrors its private constant. */
const WRITE_DEBOUNCE_MS = 150;

/** A minimal but structurally real exported config. */
const SAMPLE_CONFIG: FilterEngineConfig = {
	rules: [
		{
			id: 'genre',
			rule: { config: { set: ['fantasy', 'mystery']}, field: 'genre', type: 'inSet' },
		},
	],
	version: 1,
};

/** A second config, distinguishable from {@link SAMPLE_CONFIG} at a glance. */
const OTHER_CONFIG: FilterEngineConfig = {
	rules: [{ id: 'in-print', rule: { config: true, field: 'isInPrint', type: 'boolean' }}],
	version: 1,
};

/**
 * Put a serialized payload into `?f=` without navigating.
 *
 * @param payload - The raw (unencoded) parameter value, or `null` to clear it.
 */
function setUrlPayload(payload: string | null): void {
	const url = new URL(window.location.href);

	if (payload === null) {
		url.searchParams.delete('f');
	} else {
		url.searchParams.set('f', payload);
	}
	window.history.replaceState(null, '', url);
}

/** Read `?f=` back out of the address bar, decoded. */
function getUrlPayload(): string | null {
	return new URLSearchParams(window.location.search).get('f');
}

/**
 * Build the smallest object `startEngineUrlSync` will accept.
 *
 * @remarks
 * Deliberately not a booted engine: the function touches exactly `core.subscribe`,
 * `core.exportConfig` and `asyncEngine`, so a real engine would add a boot cost and a great deal of
 * unrelated surface for no extra confidence.
 *
 * @param options - Optional async reader, and an `exportConfig` result.
 * @returns The fake plus a `fire()` that plays the role of an engine commit.
 */
function createFakeEngine(options: {
	readonly asyncEngine?: { exportConfig: () => Promise<FilterEngineConfig> };
	readonly syncConfig?: FilterEngineConfig | (() => FilterEngineConfig);
} = {}): {
	engine: RxJsEngine<unknown>;
	fire: () => void;
	isUnsubscribed: () => boolean;
} {
	const listeners: (() => void)[] = [];
	let isUnsubscribed = false;
	const { syncConfig = SAMPLE_CONFIG } = options;

	const engine = {
		asyncEngine: options.asyncEngine,
		core: {
			exportConfig: (): FilterEngineConfig =>
				typeof syncConfig === 'function' ? syncConfig() : syncConfig,
			subscribe: (listener: () => void): (() => void) => {
				listeners.push(listener);

				return (): void => {
					isUnsubscribed = true;
				};
			},
		},
	} as unknown as RxJsEngine<unknown>;

	return {
		engine,
		fire: (): void => {
			for (const listener of listeners) {
				listener();
			}
		},
		isUnsubscribed: (): boolean => isUnsubscribed,
	};
}

describe('url-state', () => {
	beforeEach(() => {
		// The module-level signals outlive each test — reset them, storage and the URL or the tests
		// silently couple to one another's leftovers.
		urlFormat.set('human-readable');
		serializedFilterState.set(null);
		localStorage.clear();
		window.history.replaceState(null, '', '/books');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	describe('URL_FORMAT_LABELS', () => {
		it('labels all three encodings', () => {
			expect(URL_FORMAT_LABELS).toEqual({
				compact: 'Compact',
				'human-readable': 'Readable',
				'json-base64': 'Base64',
			});
		});
	});

	describe('readInitialFormat (observed through the module-level signal)', () => {
		/**
		 * Re-evaluate the module so its initializer runs against the current globals.
		 *
		 * @returns The freshly-initialized `urlFormat` value.
		 */
		async function loadInitialFormat(): Promise<UrlFormat> {
			vi.resetModules();

			const fresh = await import('./url-state.js');

			return fresh.urlFormat();
		}

		it('defaults to the readable format when nothing is stored', async () => {
			await expect(loadInitialFormat()).resolves.toBe('human-readable');
		});

		it('restores a valid stored format', async () => {
			localStorage.setItem(STORAGE_KEY, 'compact');

			await expect(loadInitialFormat()).resolves.toBe('compact');
		});

		it('rejects a stored value that names no real format', async () => {
			// `isUrlFormat` is the narrowing gate; garbage in storage (a stale key from an older build,
			// a hand-edited devtools value) must not become the active format.
			localStorage.setItem(STORAGE_KEY, 'yaml-with-emoji');

			await expect(loadInitialFormat()).resolves.toBe('human-readable');
		});

		it('defaults when localStorage is absent entirely (the SSR shape)', async () => {
			vi.stubGlobal('localStorage', undefined);

			await expect(loadInitialFormat()).resolves.toBe('human-readable');
		});

		it('defaults when localStorage THROWS on access (site data blocked)', async () => {
			// Not hypothetical: with third-party/site data blocked, the property exists and every access
			// throws a SecurityError. Without the `try`, importing this module throws and the route never
			// renders.
			vi.stubGlobal('localStorage', {
				getItem: (): string => {
					throw new Error('SecurityError: access denied');
				},
				setItem: (): void => {
					throw new Error('SecurityError: access denied');
				},
			});

			await expect(loadInitialFormat()).resolves.toBe('human-readable');
		});
	});

	describe('cycleUrlFormat', () => {
		it('wraps through all three formats and back', () => {
			expect(cycleUrlFormat()).toBe('compact');
			expect(cycleUrlFormat()).toBe('json-base64');
			expect(cycleUrlFormat()).toBe('human-readable');
			expect(urlFormat()).toBe('human-readable');
		});

		it('persists the chosen format', () => {
			cycleUrlFormat();

			expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
		});

		it('still cycles when storage refuses the write', () => {
			// Persistence is best-effort; a denied write must not break the toggle itself.
			vi.stubGlobal('localStorage', {
				getItem: (): null => null,
				setItem: (): void => {
					throw new Error('SecurityError: access denied');
				},
			});

			expect(cycleUrlFormat()).toBe('compact');
			expect(urlFormat()).toBe('compact');
		});

		it('is a no-op for persistence when localStorage is absent', () => {
			vi.stubGlobal('localStorage', undefined);

			expect(cycleUrlFormat()).toBe('compact');
		});
	});

	describe('readConfigFromUrl', () => {
		it('returns null when the parameter is absent', () => {
			expect(readConfigFromUrl()).toBeNull();
		});

		it('returns null when the parameter is present but empty', () => {
			setUrlPayload('');

			expect(readConfigFromUrl()).toBeNull();
		});

		it('returns null rather than throwing on an undecodable payload', () => {
			// A truncated or hand-mangled share link must degrade to "no filters", not a boot crash.
			setUrlPayload('not-a-tagged-payload');

			expect(readConfigFromUrl()).toBeNull();
		});

		it('decodes a real payload', () => {
			setUrlPayload(createTaggedSerializer('human-readable').encode(SAMPLE_CONFIG));

			expect(readConfigFromUrl()).toEqual(SAMPLE_CONFIG);
		});

		it('decodes a payload written in a DIFFERENT format than the active one', () => {
			// The whole reason the serializer is tagged: a link someone copied while "Compact" was
			// selected still opens for a visitor whose stored preference is "Readable".
			setUrlPayload(createTaggedSerializer('compact').encode(SAMPLE_CONFIG));
			urlFormat.set('human-readable');

			expect(readConfigFromUrl()).toEqual(SAMPLE_CONFIG);
		});
	});

	describe('reEncodeUrlFormat', () => {
		it('changes the encoding while preserving the decoded config', () => {
			const readable = createTaggedSerializer('human-readable').encode(SAMPLE_CONFIG);

			setUrlPayload(readable);
			reEncodeUrlFormat('json-base64');

			const rewritten = getUrlPayload();

			expect(rewritten).not.toBe(readable);
			expect(rewritten?.startsWith('b~')).toBe(true);
			// The round-trip is the point — the toggle must be lossless, not merely different.
			expect(createTaggedSerializer('json-base64').decode(rewritten ?? '')).toEqual(SAMPLE_CONFIG);
		});

		it('survives a full three-hop tour of the formats', () => {
			setUrlPayload(createTaggedSerializer('human-readable').encode(SAMPLE_CONFIG));
			reEncodeUrlFormat('compact');
			reEncodeUrlFormat('json-base64');
			reEncodeUrlFormat('human-readable');

			expect(createTaggedSerializer('human-readable').decode(getUrlPayload() ?? '')).toEqual(
				SAMPLE_CONFIG,
			);
		});

		it('leaves a non-tagged payload untouched', () => {
			// Someone else's `?f=` (or a truncated paste) is not ours to rewrite — clobbering it would
			// destroy the only copy of whatever it held.
			setUrlPayload('someone-elses-value');
			reEncodeUrlFormat('compact');

			expect(getUrlPayload()).toBe('someone-elses-value');
		});

		it('does nothing when there is no payload at all', () => {
			reEncodeUrlFormat('compact');

			expect(getUrlPayload()).toBeNull();
		});

		it('does nothing when the payload is empty', () => {
			setUrlPayload('');
			reEncodeUrlFormat('compact');

			expect(getUrlPayload()).toBe('');
		});
	});

	describe('startEngineUrlSync', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it('coalesces a burst of commits into ONE url write', async () => {
			// A slider drag emits per pointer-move. Writing the address bar on each would be both
			// wasteful and visibly janky, so the burst has to collapse to a single trailing write.
			const exportConfig = vi.fn(() => SAMPLE_CONFIG);
			const { engine, fire } = createFakeEngine({ syncConfig: exportConfig });
			const stop = startEngineUrlSync(engine);

			fire();
			fire();
			fire();
			expect(getUrlPayload()).toBeNull();

			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

			expect(exportConfig).toHaveBeenCalledTimes(1);
			expect(createTaggedSerializer('human-readable').decode(getUrlPayload() ?? '')).toEqual(
				SAMPLE_CONFIG,
			);
			stop();
		});

		it('writes in whatever format is selected at flush time', async () => {
			urlFormat.set('compact');

			const { engine, fire } = createFakeEngine();
			const stop = startEngineUrlSync(engine);

			fire();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

			expect(getUrlPayload()?.startsWith('c~')).toBe(true);
			stop();
		});

		it('writes again for a commit that arrives after the debounce window', async () => {
			let current = SAMPLE_CONFIG;
			const { engine, fire } = createFakeEngine({ syncConfig: () => current });
			const stop = startEngineUrlSync(engine);

			fire();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);
			current = OTHER_CONFIG;
			fire();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

			expect(createTaggedSerializer('human-readable').decode(getUrlPayload() ?? '')).toEqual(
				OTHER_CONFIG,
			);
			stop();
		});

		it('reads through asyncEngine when one is present', async () => {
			// The branch `/books` never takes, and the reason it exists: an async engine's synchronous
			// `.core` shim THROWS on `exportConfig`, so the reader is chosen up front. If this ever
			// regressed, the server-backed and worker tiers would lose their URLs with no visible error.
			const asyncExport = vi.fn(async () => Promise.resolve(OTHER_CONFIG));
			const { engine, fire } = createFakeEngine({
				asyncEngine: { exportConfig: asyncExport },
				syncConfig: (): FilterEngineConfig => {
					throw new Error('core.exportConfig is not available on an async engine');
				},
			});
			const stop = startEngineUrlSync(engine);

			fire();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

			expect(asyncExport).toHaveBeenCalledTimes(1);
			expect(createTaggedSerializer('human-readable').decode(getUrlPayload() ?? '')).toEqual(
				OTHER_CONFIG,
			);
			stop();
		});

		it('cancels a pending write and unsubscribes on teardown', async () => {
			const exportConfig = vi.fn(() => SAMPLE_CONFIG);
			const { engine, fire, isUnsubscribed } = createFakeEngine({ syncConfig: exportConfig });
			const stop = startEngineUrlSync(engine);

			fire();
			stop();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS * 4);

			expect(exportConfig).not.toHaveBeenCalled();
			expect(getUrlPayload()).toBeNull();
			expect(isUnsubscribed()).toBe(true);
		});

		it('tears down cleanly when no write is pending', () => {
			const { engine, isUnsubscribed } = createFakeEngine();

			startEngineUrlSync(engine)();

			expect(isUnsubscribed()).toBe(true);
		});
	});

	/**
	 * The store the header Compare button reads.
	 *
	 * Three functions publish, and all three matter. The debounced write and the re-encode are the
	 * obvious ones; the HYDRATION read is the one that carries its weight least visibly, because it is
	 * what makes an inbound shared link enable the button immediately, with no engine change and no
	 * interaction — and it is the path the cross-vertical e2e drives.
	 *
	 * There is deliberately no "it starts as null at module load" test. That claim is true and
	 * unobservable from inside this file: module state persists for the whole run, and the describes
	 * above have already driven writes through the signal by the time one could run. Such a test would
	 * measure test ORDER and pass or fail accordingly. The claim lives in the module's docblock instead.
	 */
	describe('serializedFilterState', () => {
		it('publishes the inbound payload when hydration decodes it', () => {
			const payload = createTaggedSerializer('human-readable').encode(SAMPLE_CONFIG);

			window.history.replaceState(null, '', `/books?f=${encodeURIComponent(payload)}`);
			readConfigFromUrl();

			expect(serializedFilterState()).toBe(payload);
		});

		it('publishes null when the parameter is absent', () => {
			serializedFilterState.set('stale');
			readConfigFromUrl();

			expect(serializedFilterState()).toBeNull();
		});

		it('publishes null when the parameter is present but empty', () => {
			serializedFilterState.set('stale');
			window.history.replaceState(null, '', '/books?f=');
			readConfigFromUrl();

			expect(serializedFilterState()).toBeNull();
		});

		// A parameter that cannot be decoded is still a parameter. Publishing it would let the button
		// offer to transport a state the destination cannot read — so an undecodable `?f` publishes
		// null, and an inert button is the honest answer to a broken link.
		it('publishes null for a payload it cannot decode', () => {
			serializedFilterState.set('stale');
			window.history.replaceState(null, '', '/books?f=not-a-tagged-value');
			readConfigFromUrl();

			expect(serializedFilterState()).toBeNull();
		});

		it('publishes what the re-encode wrote, in the new format', () => {
			const payload = createTaggedSerializer('human-readable').encode(SAMPLE_CONFIG);

			window.history.replaceState(null, '', `/books?f=${encodeURIComponent(payload)}`);
			reEncodeUrlFormat('compact');

			const published = serializedFilterState();

			expect(published).toBe(getUrlPayload());
			expect(createTaggedSerializer('compact').decode(published ?? '')).toEqual(SAMPLE_CONFIG);
		});

		it('leaves the published value alone when the re-encode refuses a non-tagged payload', () => {
			serializedFilterState.set('untouched');
			window.history.replaceState(null, '', '/books?f=not-a-tagged-value');
			reEncodeUrlFormat('compact');

			expect(serializedFilterState()).toBe('untouched');
		});

		// `advanceTimersByTimeAsync`, not `advanceTimersByTime`. The write reads the config through a
		// promise even on a main-thread engine, so a synchronous advance fires the timeout without ever
		// flushing the microtask after it — and the failure reads as "the sync never wrote" rather than
		// "the test never waited".
		it('publishes what the debounced engine write put in the URL', async () => {
			vi.useFakeTimers();

			const { engine, fire } = createFakeEngine();
			const stop = startEngineUrlSync(engine);

			fire();
			await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

			expect(serializedFilterState()).toBe(getUrlPayload());
			expect(serializedFilterState()).not.toBeNull();
			stop();
		});
	});
});
