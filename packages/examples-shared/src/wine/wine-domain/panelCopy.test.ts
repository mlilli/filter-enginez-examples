/**
 * Tests for the wine panel's shared copy and the choices behind its controls.
 *
 * @packageDocumentation
 */

import { FuzzySearchRule, RangeRule } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { COLOR_ORDER } from './filterConfig.js';
import { orderedPresentOptions, WINE_SEARCHES, wineRangeRule, wineSearchRule } from './panelCopy.js';

const PRICE_TRACK = { max: 3242, min: 4 };

describe('wineRangeRule', () => {
	it('opens the price maximum when the top thumb is at the top of the track', () => {
		// "$60 and up": a bottle can always cost more than the dearest one loaded.
		const rule = wineRangeRule('price', { max: PRICE_TRACK.max, min: 60 }, PRICE_TRACK) as RangeRule;

		expect(rule).toBeInstanceOf(RangeRule);
		expect(rule.field).toBe('priceUsd');
		expect(rule.config).toEqual({ max: Number.POSITIVE_INFINITY, min: 60 });
	});

	it('keeps a finite price maximum below the top', () => {
		expect((wineRangeRule('price', { max: 80, min: 60 }, PRICE_TRACK) as RangeRule).config.max).toBe(80);
	});

	it('keeps the top of a closed slider finite', () => {
		const rule = wineRangeRule('points', { max: 100, min: 90 }, { max: 100, min: 80 }) as RangeRule;

		expect(rule.field).toBe('points');
		expect(rule.config).toEqual({ max: 100, min: 90 });
	});
});

describe('wineSearchRule', () => {
	it('searches the tasting notes across both fields', () => {
		const rule = wineSearchRule('notes', 'oak') as FuzzySearchRule;

		expect(rule).toBeInstanceOf(FuzzySearchRule);
		expect(rule.config).toMatchObject({ keys: ['description', 'tastingNotes'], query: 'oak', threshold: WINE_SEARCHES.notes.threshold });
	});

	it('searches the winery name alone', () => {
		const rule = wineSearchRule('winery', 'caruso') as FuzzySearchRule;

		expect(rule.config).toMatchObject({ query: 'caruso', threshold: WINE_SEARCHES.winery.threshold });
		expect(rule.config.keys).toBeUndefined();
	});
});

describe('orderedPresentOptions', () => {
	it('keeps the hand-set order and drops values the corpus lacks', () => {
		expect(orderedPresentOptions(COLOR_ORDER, ['white', 'dessert', 'red'])).toEqual(['red', 'white', 'dessert']);
	});
});
