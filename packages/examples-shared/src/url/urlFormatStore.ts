/**
 * `urlFormatStore` — the app-wide shareable-URL serializer format, shared by the `DatasetRoute`'s
 * `<FilterEngineUrlSync>` serializer and the `<UrlFormatToggle>` button, persisted to `localStorage`.
 *
 * @remarks
 * A tiny module-singleton pub/sub (the same shape as the engine-busy tracker) so both the route (which
 * builds the tagged serializer for the chosen format) and the toggle button re-render together on a
 * change, without threading a context through every shell. Browser-only. The three formats mirror
 * `url-state-router`'s `BuiltInSerializerName`; kept as a local type so this module needs no
 * `url-state-router` dependency.
 *
 * @packageDocumentation
 */

import { useSyncExternalStore } from 'react';

/** The three shareable-URL serializer formats (mirrors url-state-router's `BuiltInSerializerName`). */
export type UrlFormat = 'compact' | 'human-readable' | 'json-base64';

/** Short button labels per format. */
export const URL_FORMAT_LABELS: Record<UrlFormat, string> = {
	compact: 'Compact',
	'human-readable': 'Readable',
	'json-base64': 'Base64',
};

/**
 * Toggle cycle: readable → compact → base64 → readable.
 *
 * @remarks
 * A successor MAP rather than an ordered array + modulo index. The array form needed
 * `CYCLE_ORDER[(index + 1) % length] ?? 'human-readable'`, whose fallback could never run — the
 * modulo is always in range — leaving a permanently uncoverable branch that existed only to satisfy
 * `noUncheckedIndexedAccess`. Indexing a `Record` keyed by a finite union yields a non-optional
 * value, so the impossible case disappears rather than being ignored. It also states the cycle
 * directly instead of implying it from position.
 */
const NEXT_FORMAT: Record<UrlFormat, UrlFormat> = {
	compact: 'json-base64',
	'human-readable': 'compact',
	'json-base64': 'human-readable',
};

const STORAGE_KEY = 'fe:url-format';
const listeners = new Set<() => void>();

/** Narrow an arbitrary stored string to a valid {@link UrlFormat}. */
function isUrlFormat(value: string | null): value is UrlFormat {
	return value === 'compact' || value === 'human-readable' || value === 'json-base64';
}

/** Read the persisted format on first load (defaults to human-readable; tolerant of storage denial). */
function readInitialFormat(): UrlFormat {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);

		return isUrlFormat(stored) ? stored : 'human-readable';
	} catch {
		return 'human-readable';
	}
}

let currentFormat: UrlFormat = readInitialFormat();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): UrlFormat {
	return currentFormat;
}

/** Set the URL format (persists + notifies subscribers). No-op if unchanged. */
export function setUrlFormat(format: UrlFormat): void {
	if (format === currentFormat) {
		return;
	}
	currentFormat = format;
	try {
		localStorage.setItem(STORAGE_KEY, format);
	} catch {
		// Storage unavailable/denied — the in-memory value still drives the session.
	}
	for (const listener of listeners) {
		listener();
	}
}

/** Advance to the next format in the cycle and return it (so callers can re-encode into it). */
export function cycleUrlFormat(): UrlFormat {
	const next = NEXT_FORMAT[currentFormat];

	setUrlFormat(next);

	return next;
}

/** Subscribe to the current URL format (re-renders the caller on toggle). */
export function useUrlFormat(): UrlFormat {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
