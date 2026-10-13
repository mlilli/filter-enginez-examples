/**
 * The store the header Compare button reads, and the three writers that keep it honest.
 *
 * @remarks
 * `serializedFilterState` exists because **`history.replaceState` fires no event** — nothing in this
 * app can observe `?f` arriving, so the button has no other source for either of the two things it
 * needs to know. That makes these assertions the only thing standing between it and a silent
 * failure: a write that updated the address bar but not the ref would leave the button inert while
 * the URL was perfectly shareable, and nothing else in this package would notice.
 *
 * The SvelteKit port carries the same four cases against `svelte/store`. Duplicated rather than
 * shared on purpose — the mechanism under test IS the per-framework primitive, so a shared test
 * would have to abstract away the only thing it is checking.
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
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

/** A readable-format state carrying one rule, for the inbound-link cases. */
function sampleState(): string {
	return createTaggedSerializer('human-readable').encode({
		rules: [{ id: 'genre', rule: inSet<string>('genre', ['mystery']).serialize() }],
		version: 1,
	});
}

afterEach(() => {
	vi.useRealTimers();
	window.history.replaceState(null, '', '/');
	serializedFilterState.value = null;
});

describe('serializedFilterState — the observable the URL cannot provide', () => {
	it('publishes what the engine sync wrote, matching the address bar exactly', async () => {
		vi.useFakeTimers();
		const engine = boot();
		const stop = startEngineUrlSync(engine);

		engine.core.addRule('genre', inSet<string>('genre', ['mystery']));
		// `…Async`, not the sync twin: the write path reads the config through a promise even on the
		// main-thread engine, so a synchronous timer advance fires the timeout without ever flushing
		// the microtask that follows it, and the URL is never touched.
		await vi.advanceTimersByTimeAsync(300);

		const written = new URLSearchParams(window.location.search).get('f');

		expect(written).not.toBeNull();
		// Equality with the ADDRESS BAR, not merely non-null. The button builds its href from this
		// ref, so a value that drifted from the URL would transport a different state than the one the
		// visitor is looking at — and both would decode successfully, so nothing would look wrong.
		expect(serializedFilterState.value).toBe(written);

		stop();
		engine.dispose();
	});

	it('publishes an inbound ?f on hydration, so a shared link arrives comparable', () => {
		const serialized = sampleState();
		const url = new URL('http://localhost/');

		url.searchParams.set('f', serialized);
		window.history.replaceState(null, '', `${url.pathname}${url.search}`);

		readConfigFromUrl();

		expect(serializedFilterState.value).toBe(serialized);
	});

	it('publishes null for a malformed ?f rather than offering to transport it', () => {
		// A parameter that cannot be decoded is still a parameter. Publishing it would let the button
		// offer to carry a state the destination cannot read — an inert button is the honest answer.
		window.history.replaceState(null, '', '/?f=not-a-tagged-value');

		expect(readConfigFromUrl()).toBeNull();
		expect(serializedFilterState.value).toBeNull();
	});

	it('republishes when the format is re-encoded, so the href follows the toggle', () => {
		const serialized = sampleState();

		window.history.replaceState(null, '', `/?f=${encodeURIComponent(serialized)}`);
		readConfigFromUrl();

		reEncodeUrlFormat('compact');

		const rewritten = new URLSearchParams(window.location.search).get('f');

		expect(rewritten).not.toBe(serialized);
		expect(serializedFilterState.value).toBe(rewritten);
	});
});
