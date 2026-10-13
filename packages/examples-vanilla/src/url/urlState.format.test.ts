/**
 * `url/urlState` — the shareable-URL FORMAT: where it is remembered, how it cycles, and what happens
 * to a link already in the address bar when it does.
 *
 * @remarks
 * ## Why a second file beside `urlState.test.ts`
 *
 * That one is about the engine → URL write-back and its tier branch. This one is about module-level
 * state that is decided at IMPORT time — `let urlFormat = readInitialFormat()` runs once, reading
 * `localStorage` — so every case here needs a freshly-evaluated module rather than a fresh object.
 * `vi.resetModules()` plus a dynamic import is the only way to ask "what would this app do on a cold
 * load?", and threading that through the existing file's fixtures would make both harder to read.
 *
 * ## The storage key is written out here, deliberately
 *
 * `STORAGE_KEY` is not exported, and duplicating the literal is the right call rather than a DRY
 * violation: it is a **persisted-data contract**, not an implementation detail. Renaming it silently
 * orphans every user's saved preference, so a test that fails on the rename is the correct alarm.
 * Importing the constant would make the test agree with the code by construction and notice nothing.
 *
 * ## 🔴 "Malformed `?f`" means two different things, one layer apart
 *
 * `pages/winePage.test.ts` has a case named "boots neutral on a MALFORMED ?f", and reading the NAME
 * rather than the PAYLOAD is enough to conclude `readConfigFromUrl`'s `catch` is covered. It is not:
 * that payload is `h~{"version":1,…,"type":"not-a-real-rule"}` — a well-formed tagged value holding
 * valid JSON — so `decode` SUCCEEDS, and the throw happens one layer later inside
 * `engine.core.loadConfig()`, caught by `mountWineRoute`'s own `try`.
 *
 * The two failures are genuinely different and both are real: a payload that cannot be DECODED (no
 * tag, truncated, wrong serializer), and a payload that decodes into a config the engine then
 * rejects. The last case below pins the boundary deliberately, so the next reader does not have to
 * re-derive it from a coverage report.
 *
 * ## One guard here is UNOBSERVABLE, and it has no test pretending otherwise
 *
 * `reEncodeUrlFormat`'s `current === null || current === ''` early return cannot be distinguished
 * from its absence. Measured, not assumed: `createTaggedSerializer(...).decode` throws on both `''`
 * and `null` ("missing or unknown format tag"), so without the guard the very next line throws into
 * the same `catch` and the function returns having done exactly nothing either way. The search
 * one level out — what does the skipped code DO — comes back empty: it constructs a serializer and
 * touches no DOM, focus, listener or request. The branch is COVERED by the cases below (both sides
 * are taken); it simply has no mutant, because none is possible. Coverage and mutation-killability
 * are different properties and this is the module where they come apart.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UrlStateModule from './urlState.js';

/** See the docblock: written out rather than imported, because it is a persisted-data contract. */
const STORAGE_KEY = 'fe:url-format';

/** A readable-format `?f` payload — valid enough for `decode`, small enough to eyeball. */
const READABLE_STATE = 'h~{"version":1,"rules":[]}';

/**
 * Evaluate `urlState.js` from scratch, so its import-time `readInitialFormat()` runs again.
 *
 * @returns The freshly-evaluated module.
 */
async function freshUrlState(): Promise<typeof UrlStateModule> {
	vi.resetModules();

	return import('./urlState.js');
}

/**
 * The `?f` currently in the address bar, or `null`.
 *
 * @returns The raw parameter value.
 */
function urlParam(): string | null {
	return new URL(window.location.href).searchParams.get('f');
}

describe('the remembered URL format', () => {
	beforeEach(() => {
		localStorage.clear();
		window.history.replaceState(null, '', '/wine');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
		window.history.replaceState(null, '', '/');
	});

	it('boots into the format the last session chose', async () => {
		// The whole point of persisting it. A user who prefers compact links should not have to re-pick
		// on every reload, and nothing else in the app would notice if this silently stopped working —
		// every format produces a valid link.
		localStorage.setItem(STORAGE_KEY, 'compact');

		const urlState = await freshUrlState();

		expect(urlState.getUrlFormat()).toBe('compact');
	});

	it('ignores a stored value that is not a format', async () => {
		// A hand-edited devtools entry, or a value left by an older build that named its formats
		// differently. The narrowing exists so a junk string cannot become the active format and reach
		// `createTaggedSerializer`, which would throw on every single write-back thereafter.
		localStorage.setItem(STORAGE_KEY, 'nonsense');

		const urlState = await freshUrlState();

		expect(urlState.getUrlFormat()).toBe('human-readable');
	});

	it('boots readable when storage is DENIED rather than failing to load', async () => {
		// Safari in private mode, and any browser with site data blocked, throw from `getItem` itself
		// rather than returning null. This read happens at module evaluation, so an uncaught throw here
		// is not a degraded format preference — it is a blank page on every route, since every route
		// imports this module.
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('The operation is insecure.');
		});

		const urlState = await freshUrlState();

		expect(urlState.getUrlFormat()).toBe('human-readable');
	});
});

describe('cycleUrlFormat', () => {
	beforeEach(() => {
		localStorage.clear();
		window.history.replaceState(null, '', '/wine');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
		window.history.replaceState(null, '', '/');
	});

	it('runs readable → compact → base64 → readable', async () => {
		// Asserted as the full three-step loop rather than one step, because the failure worth catching
		// is an order or modulo mistake that still "cycles" — two formats, or three that never return
		// to the start, both look like working buttons.
		const urlState = await freshUrlState();

		expect(urlState.getUrlFormat()).toBe('human-readable');
		expect(urlState.cycleUrlFormat()).toBe('compact');
		expect(urlState.cycleUrlFormat()).toBe('json-base64');
		expect(urlState.cycleUrlFormat()).toBe('human-readable');
	});

	it('remembers the choice for the next load', async () => {
		// The write half of the first describe's read half, asserted through a reload rather than by
		// spying on `setItem` — what matters is that a returning visitor gets their format, not that a
		// particular API was called.
		const urlState = await freshUrlState();

		urlState.cycleUrlFormat();

		const reloaded = await freshUrlState();

		expect(reloaded.getUrlFormat()).toBe('compact');
	});

	it('still cycles when the write is DENIED', async () => {
		// Same storage-denied browsers as above, on the other API. The in-memory value has to keep
		// driving the session: a toggle that throws leaves the click handler dead and the label frozen,
		// which is a worse outcome than a preference that does not survive the reload.
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('The operation is insecure.');
		});

		const urlState = await freshUrlState();

		expect(urlState.cycleUrlFormat()).toBe('compact');
		expect(urlState.getUrlFormat()).toBe('compact');
	});
});

describe('re-encoding the link already in the address bar', () => {
	beforeEach(() => {
		localStorage.clear();
		window.history.replaceState(null, '', '/wine');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
		window.history.replaceState(null, '', '/');
	});

	it('rewrites an existing ?f the instant the format changes', async () => {
		// Without this, the address bar keeps the OLD format until the next engine change — so a user
		// who cycles the format and immediately copies the link shares the format they just moved away
		// from. The tag prefix is the observable: `h~` readable, `c~` compact, `b~` base64.
		window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(READABLE_STATE)}`);

		const urlState = await freshUrlState();

		urlState.cycleUrlFormat();

		expect(urlParam()?.startsWith('c~'), 'the ?f was not re-encoded into compact').toBe(true);
	});

	it('publishes the re-encoded value, so the Compare button cannot carry a stale one', async () => {
		// The two channels must agree. `createCompareLinkButton` builds its href from the PUBLISHED
		// state rather than from `window.location`, precisely because writes are debounced — so a
		// re-encode that updated the URL without publishing would leave the button transporting a
		// payload in a format the address bar no longer shows. Both are valid links, which is exactly
		// why nothing else would catch it.
		window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(READABLE_STATE)}`);

		const urlState = await freshUrlState();
		let published: string | null = null;
		const stop = urlState.subscribeSerializedFilterState((serialized) => {
			published = serialized;
		});

		urlState.cycleUrlFormat();

		expect(published).toBe(urlParam());
		expect(published).not.toBe(READABLE_STATE);
		stop();
	});

	it('reads a link that cannot be decoded as no link at all', async () => {
		// `readConfigFromUrl`'s own `catch`, which no other suite reaches.
		// Two claims, and the second is the load-bearing one: it must return `null` rather than throw
		// out of every route's boot, AND it must PUBLISH null — the module's comment argues that a
		// malformed parameter is still a parameter, so publishing it would let the Compare button offer
		// to transport a state nothing can read at the other end.
		const urlState = await freshUrlState();

		window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(READABLE_STATE)}`);

		expect(urlState.readConfigFromUrl()).not.toBeNull();
		expect(urlState.getSerializedFilterState(), 'the readable link should have published').toBe(READABLE_STATE);

		// No tag at all — `createTaggedSerializer.decode` throws "missing or unknown format tag".
		window.history.replaceState(null, '', '/wine?f=garbage');

		expect(urlState.readConfigFromUrl()).toBeNull();
		// Not merely "not garbage": the PREVIOUS value must be cleared, or an inert-looking button
		// keeps carrying a payload the address bar no longer holds.
		expect(urlState.getSerializedFilterState()).toBeNull();
	});

	it('does NOT take that path for a link that decodes into a config the engine rejects', async () => {
		// The boundary, pinned. This is `winePage.test.ts`'s "malformed" payload verbatim: a valid tag
		// around valid JSON naming a rule type the registry does not know. `decode` succeeds, so this
		// function returns a config and publishes the link — and the rejection happens a layer later, in
		// `mountWineRoute`'s `loadConfig` try. Reading that test's NAME and assuming it exercised the
		// `catch` above is exactly how that branch stayed uncovered.
		const urlState = await freshUrlState();
		const unknownRule = 'h~{"version":1,"rules":[{"id":"x","type":"not-a-real-rule","config":{}}]}';

		window.history.replaceState(null, '', `/wine?f=${encodeURIComponent(unknownRule)}`);

		expect(urlState.readConfigFromUrl()).not.toBeNull();
		expect(urlState.getSerializedFilterState()).toBe(unknownRule);
	});

	it('leaves an unreadable ?f exactly as it found it', async () => {
		// A truncated paste, or a link from a build whose serializer has since changed. Re-encoding is a
		// convenience; failing it must not throw out of the toggle's click handler, and must not
		// overwrite the parameter with something derived from garbage — the user may still want to see
		// what they pasted.
		window.history.replaceState(null, '', '/wine?f=garbage');

		const urlState = await freshUrlState();

		expect(() => urlState.cycleUrlFormat()).not.toThrow();
		expect(urlParam()).toBe('garbage');
	});
});
