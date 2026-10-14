/**
 * Shareable-URL state for the Angular app — **every route, not one dataset**.
 *
 * @remarks
 * A near-verbatim port of the Vue/Svelte `urlState.ts` — the only substantive change is that the
 * selected format is an Angular `signal` rather than a Vue `ref`. The logic underneath is
 * framework-neutral and deliberately kept identical so a link produced by any vertical opens in any
 * other.
 *
 * ### Why this is not `books-url-state.ts`
 *
 * Nothing in it is books-specific: it reads a `FilterEngineConfig` off whichever engine it is handed
 * and writes it to `?f`. Copying it per dataset would produce a second module-scope {@link urlFormat}
 * signal and a second writer of the same `localStorage` key — two sources of truth for one
 * preference, disagreeing the moment you navigate between routes. One module, one signal, one key.
 *
 * ### Tagged serialization
 *
 * Values are `<tag>~<payload>` and `decode` auto-detects the tag, so switching the display format
 * never invalidates a link someone already copied. Three encodings are offered — readable, compact,
 * base64 — because seeing the same filter state in all three is the clearest way to show that URL
 * state is a *serialization* concern, not a storage one.
 *
 * The serializer is imported from `@filter-enginez/url-state-router/serializers` specifically: the
 * package root drags in `react-router`, which has no business in an Angular bundle.
 *
 * ### Why `replaceState`
 *
 * Every filter commit rewrites the URL. Using `pushState` would make the back button walk you through
 * every chip you ever toggled; `replaceState` keeps the address bar current without polluting history.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig } from '@filter-enginez/core';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { signal } from '@angular/core';
import {
	type BuiltInSerializerName,
	createTaggedSerializer,
} from '@filter-enginez/url-state-router/serializers';

/** Query-string key holding the serialized filter state. Matches the router package's default. */
const URL_STATE_PARAM = 'f';

/** Where the chosen format persists between visits. */
const STORAGE_KEY = 'fe:url-format';

/** Coalesce a burst of commits (a slider drag) into one URL write. */
const WRITE_DEBOUNCE_MS = 150;

/** Cycle order for the toggle button. */
const CYCLE_ORDER: readonly UrlFormat[] = ['human-readable', 'compact', 'json-base64'];

/** The three built-in encodings. */
export type UrlFormat = BuiltInSerializerName;

/** Button labels for each format. */
export const URL_FORMAT_LABELS: Record<UrlFormat, string> = {
	compact: 'Compact',
	'human-readable': 'Readable',
	'json-base64': 'Base64',
};

/**
 * Narrow an unknown stored string to a {@link UrlFormat}.
 *
 * @param value - Candidate from storage.
 * @returns Whether it names a real format.
 */
function isUrlFormat(value: string | null): value is UrlFormat {
	return value === 'compact' || value === 'human-readable' || value === 'json-base64';
}

/**
 * Read the persisted format, defaulting to the readable one.
 *
 * @remarks
 * Both the presence check and the `try` are load-bearing: `localStorage` is absent under SSR and
 * *throws on access* in a browser with site data blocked, which is a real configuration and not worth
 * crashing the route over.
 *
 * @returns The stored format, or `human-readable`.
 */
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

/** Persist the chosen format, ignoring storage denial. */
function persistFormat(format: UrlFormat): void {
	if (typeof localStorage === 'undefined') {
		return;
	}

	try {
		localStorage.setItem(STORAGE_KEY, format);
	} catch {
		// Storage denied — the choice simply won't survive a reload.
	}
}

/** The currently selected encoding. Module-level so the toggle and the sync loop agree. */
export const urlFormat = signal<UrlFormat>(readInitialFormat());

/**
 * The value this module last put in `?f`, or `null` when there is none.
 *
 * @remarks
 * **Nothing here can observe the address bar, which is why this exists.** Every write below goes
 * through `history.replaceState`, and that fires no event — not `popstate`, not anything. So a
 * consumer wanting to know the current filter state has no DOM to watch; the writer has to publish
 * it. SvelteKit, Vue and vanilla each have the same store in their own primitive, for the same
 * reason. React alone needs none, because its sync writes through the router.
 *
 * The header Compare button is its consumer, and it needs both WHETHER there is state (to
 * decide whether it is inert) and WHAT it is (to build its href). Reading `window.location.search`
 * on click would satisfy neither: writes are debounced by {@link WRITE_DEBOUNCE_MS}, so a click
 * inside that window finds nothing and sends the visitor to the comparison page with a preset
 * instead of their own filters — no error anywhere, and a page that looks entirely correct.
 *
 * **A `signal`, not a `BehaviorSubject`.** This app reads engine state through `toSignal(...)`
 * everywhere; a component consuming a raw subject would be the only one of its kind, and would need
 * its own subscription lifecycle in a codebase that has deliberately stopped writing them.
 *
 * Initialized to `null` rather than from `window.location`: this module is imported for its side
 * effects at module load, and reading the URL there would bake in whatever the first import happened
 * to see. {@link readConfigFromUrl} publishes the inbound value at hydration, which is both later and
 * correct.
 */
export const serializedFilterState = signal<string | null>(null);

/**
 * Advance to the next encoding.
 *
 * @returns The newly selected format.
 */
export function cycleUrlFormat(): UrlFormat {
	const index = CYCLE_ORDER.indexOf(urlFormat());
	const next = CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length] ?? 'human-readable';

	urlFormat.set(next);
	persistFormat(next);

	return next;
}

/**
 * Decode filter state from the current URL, if any.
 *
 * @returns The config, or `null` when absent or unparseable.
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
		const config = createTaggedSerializer(urlFormat()).decode(serialized);

		// Published only after a SUCCESSFUL decode, deliberately. A malformed `?f` is still a
		// parameter, and publishing it would let the Compare button offer to transport a state that
		// cannot be read at the other end. An inert button is the honest answer to a broken link.
		serializedFilterState.set(serialized);

		return config;
	} catch {
		serializedFilterState.set(null);

		return null;
	}
}

/** Write a config into the address bar under the current format. */
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
 * Re-encode the URL's existing state into a different format, in place.
 *
 * @remarks
 * Decode-then-encode rather than regenerate, so the round-trip is visibly lossless — the whole point
 * of the toggle. A payload that doesn't parse is left untouched.
 *
 * @param nextFormat - The format to re-encode into.
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
		// Not a tagged value — leave the URL alone rather than clobbering someone's link.
	}
}

/**
 * Mirror engine state into the URL for as long as the returned teardown is uncalled.
 *
 * @remarks
 * The `asyncEngine` branch matters even though `/books` never takes it: an async engine's synchronous
 * `.core` shim throws on `exportConfig`, so the reader has to be chosen up front rather than per
 * emission. Keeping the branch here is what will let the server-backed and worker tiers reuse this
 * module unchanged.
 *
 * @param engine - The booted engine to observe.
 * @returns Teardown that cancels any pending write and unsubscribes.
 */
export function startEngineUrlSync<T>(engine: RxJsEngine<T>): () => void {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	const { asyncEngine } = engine;
	const readConfig = async (): Promise<FilterEngineConfig> =>
		asyncEngine === undefined ? engine.core.exportConfig() : asyncEngine.exportConfig();

	let timer: ReturnType<typeof setTimeout> | null = null;

	const off = engine.core.subscribe(() => {
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			void readConfig().then((config) => {
				writeConfigToUrl(config, urlFormat());
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
