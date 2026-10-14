/**
 * `url/urlState` — shareable-URL plumbing for the framework-less vertical, shared by every route.
 *
 * @remarks
 * Notably, this is the vertical where the "framework-neutral" claim about the URL layer stops being a
 * claim: the Vue and Svelte ports of this file each wrapped the format state in a `ref` / `writable`,
 * but the load-bearing logic — the tagged serializer, the debounced `history.replaceState` write-back,
 * and the initial `?f` hydration — was always plain TypeScript. Here it simply *is* plain TypeScript,
 * with a hand-rolled listener list standing in for the store.
 *
 * The serializer is `@filter-enginez/examples-shared/link-serializer`'s, the one all six apps share:
 * url-state-router's React-free tagged serializer (its only dependency is `lz-string`), whose `decode`
 * also reads a link's wine origin rule in the form every app commits. A tagged value self-identifies
 * its format (`<tag>~<payload>`) and `decode` auto-detects it, so a shared link keeps working across a
 * format switch.
 *
 * @packageDocumentation
 */

import type { FilterEngine, FilterEngineConfig } from '@filter-enginez/core';

import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { type BuiltInSerializerName } from '@filter-enginez/url-state-router/serializers';

/** The URL query key holding the encoded filter state. */
const URL_STATE_PARAM = 'f';

/** `localStorage` key persisting the chosen format across sessions. */
const STORAGE_KEY = 'fe:url-format';

/** Debounce window (ms) for engine → URL writes — coalesces rapid filter-flicking into one write. */
const WRITE_DEBOUNCE_MS = 150;

/** The three shareable-URL serializer formats. */
export type UrlFormat = BuiltInSerializerName;

/** Short button labels per format. */
export const URL_FORMAT_LABELS: Record<UrlFormat, string> = {
	compact: 'Compact',
	'human-readable': 'Readable',
	'json-base64': 'Base64',
};

/** Toggle cycle order: readable → compact → base64 → readable. */
const CYCLE_ORDER: readonly UrlFormat[] = ['human-readable', 'compact', 'json-base64'];

/** Narrow an arbitrary stored string to a valid {@link UrlFormat}. */
function isUrlFormat(value: string | null): value is UrlFormat {
	return value === 'compact' || value === 'human-readable' || value === 'json-base64';
}

/** Read the persisted format on first load (tolerant of storage denial). */
function readInitialFormat(): UrlFormat {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);

		return isUrlFormat(stored) ? stored : 'human-readable';
	} catch {
		return 'human-readable';
	}
}

/** The app-wide format, plus the listeners that repaint when it cycles. */
let urlFormat: UrlFormat = readInitialFormat();
const formatListeners = new Set<(format: UrlFormat) => void>();

/** The current shareable-URL serializer format. */
export function getUrlFormat(): UrlFormat {
	return urlFormat;
}

/**
 * Subscribe to format changes (the framework-less stand-in for a store subscription).
 *
 * @param listener - Called immediately with the current format, then on every cycle.
 * @returns An unsubscribe.
 */
export function subscribeUrlFormat(listener: (format: UrlFormat) => void): () => void {
	formatListeners.add(listener);
	listener(urlFormat);

	return () => {
		formatListeners.delete(listener);
	};
}

/** The `?f` currently in the address bar, plus the listeners watching it. */
let serializedFilterState: string | null = null;
const stateListeners = new Set<(serialized: string | null) => void>();

/**
 * The `?f` value currently in the address bar, or `null` when there is none worth carrying.
 *
 * @returns The serialized state, or `null`.
 */
export function getSerializedFilterState(): string | null {
	return serializedFilterState;
}

/**
 * Subscribe to the serialized filter state — the framework-less stand-in for a store.
 *
 * @remarks
 * Exists because **`history.replaceState` fires no event.** Nothing in this app can observe `?f`
 * arriving, so a control that needs to react to filter state appearing in the URL has no source to
 * react to. React gets this free from `useSearchParams`, because its sync goes through the router;
 * the SvelteKit, Vue and Angular ports each grew the same thing in their own primitive, and here it
 * is the same hand-rolled listener list {@link subscribeUrlFormat} already uses.
 *
 * The header Compare button is the first consumer: it needs both WHETHER there is state (to decide
 * whether it is inert) and WHAT that state is (to build its href). Reading `window.location.search`
 * on click would satisfy neither — writes are debounced by {@link WRITE_DEBOUNCE_MS}, so a click
 * inside that window would find nothing and send the visitor to `/compare` with a preset instead of
 * their own filters.
 *
 * @param listener - Called immediately with the current value, then on every change.
 * @returns An unsubscribe.
 */
export function subscribeSerializedFilterState(listener: (serialized: string | null) => void): () => void {
	stateListeners.add(listener);
	listener(serializedFilterState);

	return () => {
		stateListeners.delete(listener);
	};
}

/**
 * Record the current `?f` and notify anyone watching.
 *
 * @param serialized - The new value, or `null` when there is nothing worth carrying.
 *
 * @internal
 */
function publishSerializedFilterState(serialized: string | null): void {
	serializedFilterState = serialized;
	for (const listener of stateListeners) {
		listener(serialized);
	}
}

/**
 * Advance to the next format, persist it, re-encode any existing `?f`, and notify listeners.
 *
 * @returns The newly-selected format.
 */
export function cycleUrlFormat(): UrlFormat {
	const index = CYCLE_ORDER.indexOf(urlFormat);

	/* v8 ignore next -- defensive: `noUncheckedIndexedAccess` fallback, unreachable. `urlFormat` is
	   only ever assigned from `readInitialFormat()` (which narrows) or from `next` below, so it is
	   always a member of CYCLE_ORDER — `indexOf` therefore returns 0, 1 or 2 and the modulo keeps the
	   lookup in range. Same category as `about/figures/roaring.ts`'s `?? 0`. */
	const next = CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length] ?? 'human-readable';

	urlFormat = next;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// Storage unavailable/denied — the in-memory value still drives the session.
	}
	reEncodeUrlFormat(next);
	for (const listener of formatListeners) {
		listener(next);
	}

	return next;
}

/**
 * Read + deserialize the `?f` param into a config on initial load.
 *
 * @returns The decoded config, or `null` when the param is absent or malformed.
 */
export function readConfigFromUrl(): FilterEngineConfig | null {
	const serialized = new URLSearchParams(window.location.search).get(URL_STATE_PARAM);

	if (serialized === null || serialized === '') {
		publishSerializedFilterState(null);

		return null;
	}
	try {
		// `decode` auto-detects the tag regardless of the current format setting.
		// The shared link serializer: it also reads a link's wine origin rule in the form every app
		// commits (`examples-shared/src/url/linkSerializer.ts`).
		const config = createLinkSerializer(urlFormat).decode(serialized);

		// Published only after a SUCCESSFUL decode, deliberately. A malformed `?f` is still a
		// parameter, and publishing it would let the Compare button offer to transport a state that
		// cannot be read at the other end — an inert button is the honest answer to a broken link.
		publishSerializedFilterState(serialized);

		return config;
	} catch {
		publishSerializedFilterState(null);

		return null;
	}
}

/**
 * Re-encode the existing `?f` into `nextFormat`, auto-detecting the old tag — so the address bar
 * updates the instant the user cycles the format, even with no engine change.
 *
 * @param nextFormat - The format to re-encode into.
 */
export function reEncodeUrlFormat(nextFormat: UrlFormat): void {
	const url = new URL(window.location.href);
	const current = url.searchParams.get(URL_STATE_PARAM);

	if (current === null || current === '') {
		return;
	}
	const serializer = createLinkSerializer(nextFormat);

	try {
		const reEncoded = serializer.encode(serializer.decode(current));

		url.searchParams.set(URL_STATE_PARAM, reEncoded);
		window.history.replaceState(window.history.state, '', url);
		publishSerializedFilterState(reEncoded);
	} catch {
		// Current param isn't a tagged value we can re-encode — leave it as-is.
	}
}

/**
 * What {@link startEngineUrlSync} needs from a route's engine.
 *
 * @remarks
 * Structural rather than `SignalsEngine`, so `/books-raw` — which holds the bare core and no
 * reactive surface at all — passes `{ core }` and shares this unchanged. That route exists to show
 * the adapter buys granularity rather than capability, and a URL layer that demanded the adapter
 * would quietly contradict it.
 */
export interface UrlSyncSource<T> {
	/**
	 * The async engine, on the tiers that have one.
	 *
	 * @remarks
	 * Typed as the one method this module calls rather than as `FilterEngineAsync`, which would drag
	 * the worker-bridge types into a file whose entire job is a query parameter.
	 */
	readonly asyncEngine?: { readonly exportConfig: () => Promise<FilterEngineConfig> };
	/** The engine to subscribe to — and, on the main-thread tiers, to export from. */
	readonly core: FilterEngine<T>;
}

/**
 * Start syncing engine state → URL: subscribe, debounce, and serialize the config in the
 * currently-selected format on each settle.
 *
 * @remarks
 * Uses `history.replaceState` (not `pushState`) so filter changes don't pollute the back stack.
 *
 * ## Reading the config differs by engine tier, and getting this wrong is SILENT
 *
 * The main-thread engine exports synchronously off `.core`. **The worker tier's sync `.core` shim
 * has no `exportConfig` at all** — `createAsyncCoreShim` deliberately throws `unsupported`, on the
 * argument that a fabricated answer is worse than a refusal — so the config must be read from
 * `asyncEngine.exportConfig()`, which is async.
 *
 * Getting it wrong has no visible symptom: the throw would happen inside a debounced `setTimeout`,
 * so it would surface as an uncaught error in the console and nothing else — no `?f` ever written,
 * the copy-link and compare buttons inert because their state is published from here, and every
 * other route still working. The Vue, Svelte and Angular copies of this file carry the same branch,
 * and `urlState.test.ts` pins it here.
 *
 * @param source - The route's engine. Pass the reactive facade where there is one; `{ core }` on
 * `/books-raw`, which has none.
 * @returns A teardown clearing the pending write + detaching the subscription.
 */
export function startEngineUrlSync<T>(source: UrlSyncSource<T>): () => void {
	const { asyncEngine, core } = source;
	// Picked up front rather than per write: the tier cannot change for the life of a route, and
	// branching inside the debounce would re-ask a settled question on every keystroke.
	const readConfig = async (): Promise<FilterEngineConfig> =>
		asyncEngine === undefined ? core.exportConfig() : asyncEngine.exportConfig();

	let timer: ReturnType<typeof setTimeout> | null = null;

	const off = core.subscribe(() => {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			void readConfig().then((config) => {
				const url = new URL(window.location.href);
				const serialized = createLinkSerializer(urlFormat).encode(config);

				url.searchParams.set(URL_STATE_PARAM, serialized);
				window.history.replaceState(window.history.state, '', url);
				publishSerializedFilterState(serialized);
			});
		}, WRITE_DEBOUNCE_MS);
	});

	return () => {
		if (timer !== null) {
			clearTimeout(timer);
		}
		off();
	};
}
