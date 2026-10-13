/**
 * Unit tests for `wineServerParams` — the no-JS URL-param ↔ `FilterEngineConfig` mapping + the color
 * vocabulary that backs the progressive-enhancement `<form>` on `/wine-server`.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { buildConfigFromParams, colorVocabulary, NO_JS_RULE_IDS, parseParams } from './wineServerParams.js';

/** Build a `URLSearchParams` from tuples (so repeated + whitespace keys are easy to express). */
function params(entries: readonly [string, string][]): URLSearchParams {
	return new URLSearchParams(entries.map((entry) => [...entry]));
}

describe('parseParams', () => {
	it('dedupes, trims, and drops empty colors', () => {
		const applied = parseParams(params([['color', 'Red'], ['color', ' Red '], ['color', 'White'], ['color', '  ']]));

		expect(applied.colors).toEqual(['Red', 'White']);
	});

	it('accepts a minPoints above the scale floor and clamps to the 100 ceiling', () => {
		expect(parseParams(params([['minPoints', '90']])).minPoints).toBe(90);
		expect(parseParams(params([['minPoints', '120']])).minPoints).toBe(100);
	});

	it('treats a minPoints at/below the 80 floor (or non-numeric) as null', () => {
		// `minPoints=80` is the whole corpus, so it is not a real filter — treated as unset.
		expect(parseParams(params([['minPoints', '80']])).minPoints).toBeNull();
		expect(parseParams(params([['minPoints', '50']])).minPoints).toBeNull();
		expect(parseParams(params([['minPoints', 'abc']])).minPoints).toBeNull();
		expect(parseParams(params([])).minPoints).toBeNull();
	});

	it('trims the search query (empty → empty string)', () => {
		expect(parseParams(params([['q', '  blackberry  ']])).search).toBe('blackberry');
		expect(parseParams(params([])).search).toBe('');
	});
});

describe('buildConfigFromParams', () => {
	it('produces a neutral (empty) config when nothing is selected', () => {
		const config = buildConfigFromParams({ colors: [], minPoints: null, search: '' });

		expect(config).toEqual({ rules: [], version: 1 });
	});

	it('maps each selection to the same rule id the interactive panel uses', () => {
		const config = buildConfigFromParams({ colors: ['Red'], minPoints: 90, search: 'oak' });

		expect(config.rules.map((entry) => entry.id)).toEqual([
			NO_JS_RULE_IDS.color,
			NO_JS_RULE_IDS.minPoints,
			NO_JS_RULE_IDS.search,
		]);
	});

	it('serializes rules against the correct fields', () => {
		const config = buildConfigFromParams({ colors: ['Red', 'White'], minPoints: 92, search: 'cherry' });
		const byId = new Map(config.rules.map((entry) => [entry.id, entry.rule as { field: string }]));

		expect(byId.get(NO_JS_RULE_IDS.color)?.field).toBe('color');
		expect(byId.get(NO_JS_RULE_IDS.minPoints)?.field).toBe('points');
		expect(byId.get(NO_JS_RULE_IDS.search)?.field).toBe('description');
	});
});

describe('colorVocabulary', () => {
	it('returns the corpus colors, distinct and sorted', () => {
		const colors = colorVocabulary('wine');

		expect(colors.length).toBeGreaterThan(1);
		expect([...colors]).toEqual([...colors].sort((a, b) => a.localeCompare(b)));
		expect(new Set(colors).size).toBe(colors.length);
	});
});
