/**
 * Round-trip test for the shareable-URL plumbing: encode an engine's config in each of the three
 * formats, write it into a `?f` param, read it back with `readConfigFromUrl`, and prove a fresh engine
 * loaded from it filters identically. Covers the tagged-serializer format-agnostic decode (a link
 * written in any format restores), which is what makes the runtime format toggle safe.
 */

import { type ChangeListener, createFilterEngine, type FilterEngineConfig, inSet } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { type BuiltInSerializerName, createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readConfigFromUrl, reEncodeUrlFormat, serializedFilterState, startEngineUrlSync } from './urlState.js';

/** A tiny row set — two genres so an `inSet` rule has something to narrow. */
interface Row {
	readonly id: string;
	readonly genre: string;
}

const DATA: readonly Row[] = [
	{ genre: 'mystery', id: 'a' },
	{ genre: 'fantasy', id: 'b' },
];

/** Boot a signals engine over the mini corpus. */
function boot(): SignalsEngine<Row> {
	return createSignalsEngine(createFilterEngine({ sourceData: DATA }));
}

// jsdom persists `window.location` across a file — reset the query so each case starts clean.
afterEach(() => {
	window.history.replaceState(null, '', '/');
});

const FORMATS: readonly BuiltInSerializerName[] = ['human-readable', 'compact', 'json-base64'];

describe('urlState round-trip', () => {
	it.each(FORMATS)('restores filter state from a %s-encoded ?f param', (format) => {
		const source = boot();

		source.core.addRule('genre', inSet<string>('genre', ['mystery']));

		const serialized = createTaggedSerializer(format).encode(source.core.exportConfig());
		const url = new URL('http://localhost/');

		url.searchParams.set('f', serialized);
		window.history.replaceState(null, '', `${url.pathname}${url.search}`);

		const restored = readConfigFromUrl();

		expect(restored).not.toBeNull();
		if (restored === null) {
			throw new Error('expected a decoded config');
		}
		const target = boot();

		target.core.loadConfig(restored);
		expect(target.core.getResults().map((row) => row.id)).toEqual(['a']);

		source.dispose();
		target.dispose();
	});

	it('returns null when no ?f param is present', () => {
		expect(readConfigFromUrl()).toBeNull();
	});
});

describe('startEngineUrlSync — async (server-backed) engine', () => {
	afterEach(() => {
		vi.useRealTimers();
		window.history.replaceState(null, '', '/');
	});

	it('reads config from the async engine (its sync `.core.exportConfig` throws)', async () => {
		vi.useFakeTimers();
		const config: FilterEngineConfig = { rules: [{ id: 'genre', rule: inSet<string>('genre', ['mystery']).serialize() }], version: 1 };
		// A holder object (not a bare `let`) so TS doesn't narrow the captured listener to `never` at the
		// call site — it can't see the `subscribe` closure reassign it synchronously.
		const captured: { listener: ChangeListener | null } = { listener: null };
		// Faithful to the async core shim: `.core.exportConfig` throws `unsupported`, `.core.subscribe`
		// fans out change events, and the real config is only reachable via `asyncEngine.exportConfig`.
		const coreExportConfig = vi.fn(() => {
			throw new Error('unsupported: exportConfig');
		});
		const asyncExportConfig = vi.fn(async (): Promise<FilterEngineConfig> => {
			await Promise.resolve();

			return config;
		});
		const fakeEngine = {
			asyncEngine: { exportConfig: asyncExportConfig },
			core: {
				exportConfig: coreExportConfig,
				subscribe: (listener: ChangeListener) => {
					captured.listener = listener;

					return () => {
						captured.listener = null;
					};
				},
			},
		} as unknown as SignalsEngine<Row>;

		const stop = startEngineUrlSync(fakeEngine);

		expect(captured.listener).not.toBeNull();
		captured.listener?.({ rule: inSet<string>('genre', ['mystery']), ruleId: 'genre', type: 'rule:added' });
		await vi.advanceTimersByTimeAsync(300);

		// The write came from the ASYNC engine, never the throwing sync shim.
		expect(asyncExportConfig).toHaveBeenCalledTimes(1);
		expect(coreExportConfig).not.toHaveBeenCalled();

		const written = new URLSearchParams(window.location.search).get('f');

		expect(written).not.toBeNull();
		expect(readConfigFromUrl()?.rules.map((entry) => entry.id)).toEqual(['genre']);

		stop();
	});
});

/**
 * The store the header Compare button reads.
 *
 * @remarks
 * It exists because `history.replaceState` fires no event, so nothing in this app can observe `?f`
 * arriving. That makes these assertions the only thing standing between the button and a silent
 * failure: a write that updated the address bar but not the store would leave the button inert
 * while the URL was perfectly shareable, and nothing else in the suite would notice.
 */
describe('serializedFilterState — the observable the URL cannot provide', () => {
	afterEach(() => {
		vi.useRealTimers();
		window.history.replaceState(null, '', '/');
		serializedFilterState.set(null);
	});

	// NOTE: there is deliberately no "starts null at module load" test. The store IS initialized to
	// null — so that this module, which is imported on the server too, never reads a URL that does
	// not exist there or shares a value across requests — but that fact is unobservable from here:
	// module state persists for the whole file, and the describes above have already driven writes
	// through it by the time this one runs. A test asserting it would be measuring test ORDER.

	it('publishes what the engine sync wrote, matching the address bar exactly', async () => {
		vi.useFakeTimers();
		const engine = boot();

		const stop = startEngineUrlSync(engine);

		engine.core.addRule('genre', inSet<string>('genre', ['mystery']));
		// `…Async`, not the sync twin: the write path reads the config through a promise even on the
		// main-thread engine, and a synchronous timer advance fires the timeout without ever flushing
		// the microtask that follows it. The sync version leaves the URL untouched and the failure
		// reads as "the sync never wrote" rather than "the test never waited".
		await vi.advanceTimersByTimeAsync(300);

		const written = new URLSearchParams(window.location.search).get('f');

		expect(written).not.toBeNull();
		// Equality with the ADDRESS BAR, not merely non-null. The button builds its href from this
		// store, so a value that drifted from the URL would send a different state than the one the
		// visitor is looking at — and both would decode successfully, so nothing would look wrong.
		expect(get(serializedFilterState)).toBe(written);

		stop();
		engine.dispose();
	});

	it('publishes an inbound ?f on hydration, so a shared link arrives comparable', () => {
		const serialized = createTaggedSerializer('human-readable').encode({
			rules: [{ id: 'genre', rule: inSet<string>('genre', ['mystery']).serialize() }],
			version: 1,
		});
		const url = new URL('http://localhost/');

		url.searchParams.set('f', serialized);
		window.history.replaceState(null, '', `${url.pathname}${url.search}`);

		readConfigFromUrl();

		expect(get(serializedFilterState)).toBe(serialized);
	});

	it('publishes null for a malformed ?f rather than offering to transport it', () => {
		// A parameter that cannot be decoded is still a parameter. Publishing it would let the button
		// offer to carry a state the destination cannot read — an inert button is the honest answer.
		window.history.replaceState(null, '', '/?f=not-a-tagged-value');

		expect(readConfigFromUrl()).toBeNull();
		expect(get(serializedFilterState)).toBeNull();
	});

	it('republishes when the format is re-encoded, so the href follows the toggle', () => {
		const serialized = createTaggedSerializer('human-readable').encode({
			rules: [{ id: 'genre', rule: inSet<string>('genre', ['mystery']).serialize() }],
			version: 1,
		});

		window.history.replaceState(null, '', `/?f=${encodeURIComponent(serialized)}`);
		readConfigFromUrl();

		reEncodeUrlFormat('compact');

		const rewritten = new URLSearchParams(window.location.search).get('f');

		expect(rewritten).not.toBe(serialized);
		expect(get(serializedFilterState)).toBe(rewritten);
	});
});
