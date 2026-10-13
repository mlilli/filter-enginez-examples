/**
 * `booksServerParams` — translate the `/books-server` route's URL search params into a
 * `FilterEngineConfig` for server-side (no-JS) filtering, and expose the genre vocabulary the no-JS
 * `<form>` renders.
 *
 * @remarks
 * Two request shapes reach the `+page.server.ts` `load`:
 *
 *   1. **JS-on** — the booted client engine writes the full serialized filter state to `?f=<tagged>`
 *      (via the shared `@filter-enginez/url-state-router` tagged serializer). `load` decodes that
 *      verbatim for a faithful SSR first paint. Handled in `+page.server.ts`, not here.
 *   2. **JS-off** — the progressive-enhancement `<form method="GET">` submits plain, human-legible
 *      params (`?genre=fantasy&genre=mystery&minRating=4&q=dragons`). {@link buildConfigFromParams}
 *      maps those to the SAME rule ids/fields the interactive Svelte panel uses (`genre` / `rating` /
 *      `text-search`), so the server produces a coherent, shareable filtered result with zero client
 *      JavaScript — the truest form of progressive enhancement for a *query* (idempotent, GET,
 *      bookmarkable), which is why this path is a GET form rather than a POST action.
 *
 * Server-only (`$lib/server/`): it builds configs with the core rule factories, and reads the corpus
 * for the genre vocabulary — neither should ship to the client.
 *
 * @packageDocumentation
 */

import { type FilterEngineConfig, inSet, range, type SerializedRule, text } from '@filter-enginez/core';

import { loadDatasetCorpus } from './datasetFilterService.js';

/** The rule ids the no-JS form drives — kept identical to the interactive panel for coherence. */
export const NO_JS_RULE_IDS = { genre: 'genre', minRating: 'rating', search: 'text-search' } as const;

/** The maximum value of the `averageRating` field (0–5 scale) — the upper bound of the min-rating rule. */
const RATING_CEILING = 5;

/** The parsed, normalized selections behind {@link buildConfigFromParams} (echoed back to the form). */
export interface AppliedParams {
	/** Selected genres (deduped, in corpus-vocabulary order). */
	readonly genres: readonly string[];
	/** Minimum average rating, or `null` when unset. */
	readonly minRating: number | null;
	/** Free-text description query, or `''` when unset. */
	readonly search: string;
}

/** Parse + normalize the no-JS form params from a `URLSearchParams`. */
export function parseParams(params: URLSearchParams): AppliedParams {
	const genres = [...new Set(params.getAll('genre').map((value) => value.trim()).filter((value) => value !== ''))];
	const rawRating = Number.parseFloat(params.get('minRating') ?? '');
	const minRating = Number.isFinite(rawRating) && rawRating > 0 ? Math.min(rawRating, RATING_CEILING) : null;
	const search = (params.get('q') ?? '').trim();

	return { genres, minRating, search };
}

/**
 * Build a serialized `FilterEngineConfig` from the no-JS form params.
 *
 * @param applied - The parsed selections (from {@link parseParams}).
 * @returns A config whose rules are serialized entries, ready for `applyConfigQuery`. Empty selections
 *   yield an empty (neutral) config — the server returns the full corpus.
 */
export function buildConfigFromParams(applied: AppliedParams): FilterEngineConfig {
	const rules: { id: string; rule: SerializedRule }[] = [];

	if (applied.genres.length > 0) {
		rules.push({ id: NO_JS_RULE_IDS.genre, rule: inSet<string>('genre', applied.genres).serialize() });
	}
	if (applied.minRating !== null) {
		rules.push({ id: NO_JS_RULE_IDS.minRating, rule: range('averageRating', { max: RATING_CEILING, min: applied.minRating }).serialize() });
	}
	if (applied.search !== '') {
		rules.push({ id: NO_JS_RULE_IDS.search, rule: text('description', { caseSensitive: false, mode: 'substring', query: applied.search }).serialize() });
	}

	return { rules, version: 1 };
}

/** The distinct genre vocabulary of a dataset's corpus, sorted — the no-JS form's checkbox options. */
export function genreVocabulary(dataset: string): readonly string[] {
	const distinct = new Set<string>();

	for (const record of loadDatasetCorpus(dataset)) {
		const genre = (record as { readonly genre?: unknown }).genre;

		if (typeof genre === 'string') {
			distinct.add(genre);
		}
	}

	return [...distinct].sort((a, b) => a.localeCompare(b));
}
