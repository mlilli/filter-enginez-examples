/**
 * `urlState` — shareable-URL plumbing for every SvelteKit dataset route.
 *
 * @remarks
 * The SvelteKit port of the React `DatasetRoute` + `<UrlFormatToggle>` + `<CopyLinkButton>` URL-state
 * behavior, but framework-neutral: it drives the address bar through native `window.location` +
 * `history.replaceState` rather than `$app/navigation`. Two reasons: (1) it's SSR-guardable with a
 * single `typeof window` check, and (2) the components that consume it render inside `<BooksView>`,
 * which the component tests mount bare — and the plain-`svelte` vitest config maps only
 * `$app/stores` (to a test double), so `$app/navigation` has no module there and importing it would
 * break the suite.
 *
 * The serializer is the framework-neutral tagged serializer from `@filter-enginez/url-state-router`
 * (imported via its `/serializers` subpath so no `react-router` is dragged in). A tagged value
 * self-identifies its format (`<tag>~<payload>`) and `decode` auto-detects it, so a shared link keeps
 * working across a format switch — the same guarantee the React toggle relies on.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type BuiltInSerializerName, createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { get, writable } from 'svelte/store';

/** The URL query key holding the encoded filter state (matches `<FilterEngineUrlSync>`'s default). */
const URL_STATE_PARAM = 'f';

/** `localStorage` key persisting the chosen format across sessions (mirrors the React store). */
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

/** Read the persisted format on first load (defaults to human-readable; tolerant of storage denial). */
function readInitialFormat(): UrlFormat {
	if (typeof localStorage === 'undefined') {
		return 'human-readable';
	}
	try {
		const stored = localStorage.getItem(STORAGE_KEY);

		return isUrlFormat(stored) ? stored : 'human-readable';
	} catch {
		return 'human-readable';
	}
}

/** The app-wide shareable-URL serializer format (persisted to `localStorage`). */
export const urlFormat = writable<UrlFormat>(readInitialFormat());

/**
 * The `?f` value currently in the address bar, or `null` when there is none worth carrying.
 *
 * @remarks
 * Exists because **`history.replaceState` fires no event.** Nothing in this app — or in Vue,
 * Angular or vanilla, which drive the URL the same way — can observe the parameter arriving, so a
 * component that needs to react to filter state appearing in the URL has no source to react to.
 * React gets this for free from `useSearchParams`, because its sync goes through the router.
 *
 * The header Compare button is the first consumer: it must know both WHETHER there is state (to
 * decide whether it is inert) and WHAT that state is (to build its href). Reading
 * `window.location.search` when clicked would satisfy neither — writes are debounced by
 * {@link WRITE_DEBOUNCE_MS}, so a click inside that window would find nothing and silently send the
 * visitor to the comparison page with a preset instead of their own filters.
 *
 * Every function below that KNOWS the parameter's current value publishes it here, which is why
 * there is no module-load read of `window.location`: that would be an SSR hazard and a lie on the
 * server, where this module is imported but no URL exists.
 */
export const serializedFilterState = writable<string | null>(null);

urlFormat.subscribe((format) => {
	if (typeof localStorage === 'undefined') {
		return;
	}
	try {
		localStorage.setItem(STORAGE_KEY, format);
	} catch {
		// Storage unavailable/denied — the in-memory value still drives the session.
	}
});

/** Advance to the next format in the cycle and return it (so callers can re-encode into it). */
export function cycleUrlFormat(): UrlFormat {
	const index = CYCLE_ORDER.indexOf(get(urlFormat));
	const next = CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length];

	urlFormat.set(next);

	return next;
}

/**
 * Read + deserialize the `?f` param into a config on initial load. Returns `null` when the param is
 * absent, malformed, or in SSR — callers leave the engine state unchanged in that case.
 *
 * @returns The decoded config, or `null`.
 */
export function readConfigFromUrl(): FilterEngineConfig | null {
	if (typeof window === 'undefined') {
		return null;
	}
	const serialized = new URLSearchParams(window.location.search).get(URL_STATE_PARAM);

	if (serialized === null || serialized === '') {
		serializedFilterState.set(null);

		return null;
	}
	try {
		// `decode` auto-detects the tag regardless of the current format setting.
		const config = createTaggedSerializer(get(urlFormat)).decode(serialized);

		// Published only after a SUCCESSFUL decode, deliberately. A malformed `?f` is still a
		// parameter, and publishing it would let the Compare button offer to transport a state that
		// cannot be read at the other end — an inert button is the honest answer to a broken link.
		serializedFilterState.set(serialized);

		return config;
	} catch {
		serializedFilterState.set(null);

		return null;
	}
}

/**
 * Serialize a config into the `?f` param via native `history.replaceState` (no new history entry, so
 * filter changes don't pollute the back stack). No-op in SSR.
 *
 * @internal
 */
function writeConfigToUrl(config: FilterEngineConfig, format: UrlFormat): void {
	if (typeof window === 'undefined') {
		return;
	}
	const url = new URL(window.location.href);
	const serialized = createTaggedSerializer(format).encode(config);

	url.searchParams.set(URL_STATE_PARAM, serialized);
	window.history.replaceState(window.history.state, '', url);
	serializedFilterState.set(serialized);
}

/**
 * Re-encode the existing `?f` param into `nextFormat`, auto-detecting the old format's tag — so the
 * address bar updates the instant the user cycles the format, even with no engine change. No-op when
 * there's no param, in SSR, or when the current value isn't a tagged value we can re-encode.
 *
 * @param nextFormat - The format to re-encode the current param into.
 */
export function reEncodeUrlFormat(nextFormat: UrlFormat): void {
	if (typeof window === 'undefined') {
		return;
	}
	const url = new URL(window.location.href);
	const current = url.searchParams.get(URL_STATE_PARAM);

	if (current === null || current === '') {
		return;
	}
	const serializer = createTaggedSerializer(nextFormat);

	try {
		const reEncoded = serializer.encode(serializer.decode(current));

		url.searchParams.set(URL_STATE_PARAM, reEncoded);
		window.history.replaceState(window.history.state, '', url);
		serializedFilterState.set(reEncoded);
	} catch {
		// Current param isn't a tagged value we can re-encode — leave it as-is.
	}
}

/**
 * Start syncing engine state → URL: subscribe to the engine, debounce writes, and serialize
 * `exportConfig()` in the currently-selected format on each settle. Returns an unsubscribe. No-op in
 * SSR (returns a no-op teardown).
 *
 * @param engine - The signals engine whose `.core` is subscribed + exported.
 * @returns A teardown that clears the pending write + detaches the subscription.
 */
export function startEngineUrlSync<T>(engine: SignalsEngine<T>): () => void {
	if (typeof window === 'undefined') {
		return () => undefined;
	}
	// Reading the config differs by engine tier. The main-thread engine exports synchronously off
	// `.core`. The async (server / worker) engine's sync `.core` shim has NO sync `exportConfig` — it
	// throws `unsupported('exportConfig')` — so the config must be read from `asyncEngine.exportConfig()`
	// (async). Picking the reader up front keeps `/books` (no `asyncEngine`) behavior identical while
	// letting `/books-server` sync its URL at all.
	const { asyncEngine } = engine;
	const readConfig = async (): Promise<FilterEngineConfig> => {
		if (asyncEngine === undefined) {
			return engine.core.exportConfig();
		}
		const config = await asyncEngine.exportConfig();

		return config;
	};
	let timer: ReturnType<typeof setTimeout> | null = null;
	const off = engine.core.subscribe(() => {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			void readConfig().then((config) => {
				writeConfigToUrl(config, get(urlFormat));
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
