/**
 * Unit tests for `booksServerParams` — the no-JS URL-param ↔ `FilterEngineConfig` mapping + the genre
 * vocabulary that backs the progressive-enhancement `<form>`.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { buildConfigFromParams, genreVocabulary, NO_JS_RULE_IDS, parseParams } from './booksServerParams.js';

/** Build a `URLSearchParams` from tuples (so repeated + whitespace keys are easy to express). */
function params(entries: readonly [string, string][]): URLSearchParams {
	return new URLSearchParams(entries.map((entry) => [...entry]));
}

describe('parseParams', () => {
	it('dedupes, trims, and drops empty genres', () => {
		const applied = parseParams(params([['genre', 'fantasy'], ['genre', ' fantasy '], ['genre', 'mystery'], ['genre', '  ']]));

		expect(applied.genres).toEqual(['fantasy', 'mystery']);
	});

	it('accepts a positive minRating and clamps to the 0–5 ceiling', () => {
		expect(parseParams(params([['minRating', '4']])).minRating).toBe(4);
		expect(parseParams(params([['minRating', '9']])).minRating).toBe(5);
	});

	it('rejects a zero / negative / non-numeric minRating as null', () => {
		expect(parseParams(params([['minRating', '0']])).minRating).toBeNull();
		expect(parseParams(params([['minRating', '-2']])).minRating).toBeNull();
		expect(parseParams(params([['minRating', 'abc']])).minRating).toBeNull();
		expect(parseParams(params([])).minRating).toBeNull();
	});

	it('trims the search query (empty → empty string)', () => {
		expect(parseParams(params([['q', '  dragons  ']])).search).toBe('dragons');
		expect(parseParams(params([])).search).toBe('');
	});
});

describe('buildConfigFromParams', () => {
	it('produces a neutral (empty) config when nothing is selected', () => {
		const config = buildConfigFromParams({ genres: [], minRating: null, search: '' });

		expect(config).toEqual({ rules: [], version: 1 });
	});

	it('maps each selection to the same rule id the interactive panel uses', () => {
		const config = buildConfigFromParams({ genres: ['fantasy'], minRating: 4, search: 'dragons' });

		expect(config.rules.map((entry) => entry.id)).toEqual([
			NO_JS_RULE_IDS.genre,
			NO_JS_RULE_IDS.minRating,
			NO_JS_RULE_IDS.search,
		]);
	});

	it('serializes rules against the correct fields', () => {
		const config = buildConfigFromParams({ genres: ['fantasy', 'mystery'], minRating: 4.5, search: 'quest' });
		const byId = new Map(config.rules.map((entry) => [entry.id, entry.rule as { field: string }]));

		expect(byId.get(NO_JS_RULE_IDS.genre)?.field).toBe('genre');
		expect(byId.get(NO_JS_RULE_IDS.minRating)?.field).toBe('averageRating');
		expect(byId.get(NO_JS_RULE_IDS.search)?.field).toBe('description');
	});
});

describe('genreVocabulary', () => {
	it('returns the corpus genres, distinct and sorted', () => {
		const genres = genreVocabulary('books');

		expect(genres.length).toBeGreaterThan(1);
		expect(genres).toContain('fantasy');
		expect([...genres]).toEqual([...genres].sort((a, b) => a.localeCompare(b)));
		expect(new Set(genres).size).toBe(genres.length);
	});
});
