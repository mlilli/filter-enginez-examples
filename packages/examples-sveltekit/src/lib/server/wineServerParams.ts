/**
 * `wineServerParams` — translate the `/wine-server` route's URL search params into a
 * `FilterEngineConfig` for server-side (no-JS) filtering, and expose the color vocabulary the no-JS
 * `<form>` renders.
 *
 * @remarks
 * The wine twin of `booksServerParams`, and the same two request shapes reach the `+page.server.ts`
 * `load`:
 *
 *   1. **JS-on** — the booted client engine writes the full serialized filter state to `?f=<tagged>`
 *      (via the shared `@filter-enginez/url-state-router` tagged serializer). `load` decodes that
 *      verbatim for a faithful SSR first paint. Handled in `+page.server.ts`, not here.
 *   2. **JS-off** — the progressive-enhancement `<form method="GET">` submits plain, human-legible
 *      params (`?color=Red&color=White&minPoints=90&q=blackberry`). {@link buildConfigFromParams} maps
 *      those to rule ids/fields the interactive Svelte panel also uses (`color` / `points` /
 *      `notes`), so the server produces a coherent, shareable filtered result with zero
 *      client JavaScript — the truest form of progressive enhancement for a *query* (idempotent, GET,
 *      bookmarkable), which is why this is a GET form rather than a POST action.
 *
 * A deliberate SUBSET of the 14 interactive facets, matching how the books no-JS form exposes three of
 * its facets: color (the most-reached chip), a minimum score, and a tasting-notes text search. The
 * no-JS form is a progressive-enhancement floor, not a second full panel; the moment JS boots, the
 * live `<WineView>` with every facet replaces it.
 *
 * The tasting-notes search uses a plain case-insensitive SUBSTRING match, not the interactive panel's
 * fuzzy rule: a no-JS query must be deterministic and self-explanatory (a bookmarkable `?q=oak` should
 * mean exactly "contains oak"), and substring is the honest server-side equivalent.
 *
 * Server-only (`$lib/server/`): it builds configs with the core rule factories and reads the corpus
 * for the color vocabulary — neither should ship to the client.
 *
 * @packageDocumentation
 */

import { type FilterEngineConfig, inSet, range, type SerializedRule, text } from '@filter-enginez/core';

import { loadDatasetCorpus } from './datasetFilterService.js';

/** The rule ids the no-JS form drives — kept identical to the interactive panel for coherence. */
export const NO_JS_RULE_IDS = { color: 'color', minPoints: 'points', search: 'notes' } as const;

/** The upper bound of the points scale (Wine Enthusiast 80-100) — the ceiling of the min-points rule. */
const POINTS_CEILING = 100;
/** The lower bound of the points scale — a `minPoints` below this is treated as unset (neutral). */
const POINTS_FLOOR = 80;

/** The parsed, normalized selections behind {@link buildConfigFromParams} (echoed back to the form). */
export interface AppliedParams {
	/** Selected colors (deduped, in corpus-vocabulary order). */
	readonly colors: readonly string[];
	/** Minimum points, or `null` when unset. */
	readonly minPoints: number | null;
	/** Free-text tasting-notes query, or `''` when unset. */
	readonly search: string;
}

/** Parse + normalize the no-JS form params from a `URLSearchParams`. */
export function parseParams(params: URLSearchParams): AppliedParams {
	const colors = [...new Set(params.getAll('color').map((value) => value.trim()).filter((value) => value !== ''))];
	const rawPoints = Number.parseFloat(params.get('minPoints') ?? '');
	// Only a value strictly above the scale floor narrows anything — `minPoints=80` is the whole corpus,
	// so it is treated as unset to keep the neutral URL clean.
	const minPoints = Number.isFinite(rawPoints) && rawPoints > POINTS_FLOOR
		? Math.min(rawPoints, POINTS_CEILING)
		: null;
	const search = (params.get('q') ?? '').trim();

	return { colors, minPoints, search };
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

	if (applied.colors.length > 0) {
		rules.push({ id: NO_JS_RULE_IDS.color, rule: inSet<string>('color', applied.colors).serialize() });
	}
	if (applied.minPoints !== null) {
		rules.push({ id: NO_JS_RULE_IDS.minPoints, rule: range('points', { max: POINTS_CEILING, min: applied.minPoints }).serialize() });
	}
	if (applied.search !== '') {
		rules.push({ id: NO_JS_RULE_IDS.search, rule: text('description', { caseSensitive: false, mode: 'substring', query: applied.search }).serialize() });
	}

	return { rules, version: 1 };
}

/** The distinct color vocabulary of a dataset's corpus, sorted — the no-JS form's checkbox options. */
export function colorVocabulary(dataset: string): readonly string[] {
	const distinct = new Set<string>();

	for (const record of loadDatasetCorpus(dataset)) {
		const color = (record as { readonly color?: unknown }).color;

		if (typeof color === 'string') {
			distinct.add(color);
		}
	}

	return [...distinct].sort((a, b) => a.localeCompare(b));
}
