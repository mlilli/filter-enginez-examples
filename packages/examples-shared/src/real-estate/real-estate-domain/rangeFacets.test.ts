/**
 * Tests for the shared real-estate range-facet table.
 *
 * @remarks
 * This module exists so every vertical shares one table: separate spellings of a display convention
 * are how one vertical's Lot size comes to read `1.50 ac` while another's reads `1.5 ac`, over one
 * corpus, in a demo whose entire purpose is the side-by-side comparison. These tests make that
 * executable: they pin the exact output
 * of every formatter, so a well-meaning tidy-up of `toFixed(2)` fails here rather than in a
 * screenshot nobody takes.
 *
 * The round trip is the other half. Every readout is editable, so `parse(format(x))` must return `x`
 * for every facet that declares a parser — a formatter that adds a separator the parser cannot strip
 * turns a slider into a control that silently rejects its own displayed value.
 */

import { describe, expect, it } from 'vitest';

import { REAL_ESTATE_SLIDER_FIELD_IDS, SLIDER_CLAMPS } from './filterConfig.js';
import { parseNumeric, RANGE_FACETS } from './rangeFacets.js';

describe('parseNumeric', () => {
	it('strips currency, separators and unit suffixes', () => {
		// `Number.parseFloat` alone stops at the first non-numeric character, so it reads this as 1.
		expect(parseNumeric('$1,250,000')).toBe(1_250_000);
		expect(parseNumeric('2,400 sqft')).toBe(2400);
		expect(parseNumeric('3 bd')).toBe(3);
		expect(parseNumeric('1.25 ac')).toBe(1.25);
	});

	it('returns NaN for text carrying no digits, which is what the slider rejects on', () => {
		expect(parseNumeric('')).toBeNaN();
		expect(parseNumeric('sqft')).toBeNaN();
	});
});

describe('RANGE_FACETS', () => {
	it('covers every slider field exactly once', () => {
		// The table and `REAL_ESTATE_SLIDER_FIELD_IDS` are two lists that must agree: the ids index the
		// shared clamps, steps and getters, and a facet present in one but not the other renders a
		// slider with no baseline or a baseline with no slider.
		expect(RANGE_FACETS.map((facet) => facet.ruleId).sort()).toEqual(
			[...REAL_ESTATE_SLIDER_FIELD_IDS].sort(),
		);
	});

	it('renders in the same order the shared id list declares', () => {
		// Panel render order. Divergence here is invisible to every other assertion and shows up as two
		// verticals listing their sliders differently.
		expect(RANGE_FACETS.map((facet) => facet.ruleId)).toEqual(REAL_ESTATE_SLIDER_FIELD_IDS);
	});

	it('gives every facet a label and a distinct slider label', () => {
		for (const facet of RANGE_FACETS) {
			expect(facet.label.length).toBeGreaterThan(0);
			expect(facet.sliderLabel.length).toBeGreaterThan(0);
		}

		expect(new Set(RANGE_FACETS.map((facet) => facet.sliderLabel)).size).toBe(RANGE_FACETS.length);
	});

	it.each([
		['price', 1_250_000, '$1,250,000'],
		['square-feet', 2400, '2,400 sqft'],
		['bedrooms', 3, '3 bd'],
		['bathrooms', 2, '2 ba'],
		['year-built', 1987, '1987'],
		['lot-size', 1.5, '1.50 ac'],
	])('formats %s exactly', (ruleId, value, expected) => {
		const facet = RANGE_FACETS.find((candidate) => candidate.ruleId === ruleId);

		expect(facet?.format(value)).toBe(expected);
	});

	it('round-trips every formatted value back through its parser', () => {
		// `parse(format(x)) === x` for every facet that declares a parser. Year-built deliberately has
		// none — a four-digit year carries no separators, so the slider's default `parseFloat` is
		// already correct — and it is asserted to still round-trip through that default.
		for (const facet of RANGE_FACETS) {
			const { max, min } = SLIDER_CLAMPS[facet.ruleId];
			const midpoint = facet.ruleId === 'lot-size' ? 1.5 : Math.round((min + max) / 2);
			const parse = facet.parse ?? Number.parseFloat;

			expect(parse(facet.format(midpoint))).toBe(midpoint);
		}
	});

	it('omits a parser only for year-built', () => {
		// Pins the one documented exception, so a future facet that needs a stripper cannot acquire the
		// exemption by omission.
		const withoutParser = RANGE_FACETS.filter((facet) => facet.parse === undefined);

		expect(withoutParser.map((facet) => facet.ruleId)).toEqual(['year-built']);
	});
});
