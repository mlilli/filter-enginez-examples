/**
 * Tests for reading a link's distance rule in the form every real-estate app commits.
 *
 * @remarks
 * A link is untrusted input, so the rewrite is pinned case by case: which rule it touches (only a
 * `GeoProximityRule` under the `geo-proximity` id whose field is the `"<function>"` placeholder), what
 * it changes (the field, to `coords`, and nothing else), and that everything else passes through as is.
 *
 * @packageDocumentation
 */

import type { FilterEngineConfig, SerializedRule } from '@filter-enginez/core';

import { describe, expect, it, vi } from 'vitest';

import { GEO_RADIUS_FIELD, GEO_RADIUS_RULE_ID, normalizeGeoRadiusRule, withNormalizedGeoRadiusRule } from './geoRadiusLinks.js';

/** A circle as a link carries it: 15 miles around central Denver. */
const CIRCLE = { center: { lat: 39.7392, lng: -104.9903 }, radiusKm: 24.14 };

/**
 * A distance rule over the given field.
 *
 * @param field - The serialized field.
 * @returns The serialized rule.
 */
function geoRule(field: string): SerializedRule {
	return { config: CIRCLE, field, type: 'GeoProximityRule' };
}

/**
 * A config holding one rule under the distance id.
 *
 * @param rule - The serialized rule.
 * @returns The config.
 */
function geoConfig(rule: SerializedRule): FilterEngineConfig {
	return { rules: [{ id: GEO_RADIUS_RULE_ID, rule }], version: 1 };
}

describe('normalizeGeoRadiusRule', () => {
	it('gives a distance rule that travelled over a function field the coords field, and changes nothing else', () => {
		expect(GEO_RADIUS_FIELD).toBe('coords');
		expect(normalizeGeoRadiusRule(geoConfig(geoRule('<function>')))).toEqual(geoConfig(geoRule('coords')));
	});

	it('passes the committed rule, over coords, through unchanged', () => {
		const rule = geoRule('coords');

		expect(normalizeGeoRadiusRule(geoConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it('passes a distance rule over any other named field through unchanged', () => {
		// A named field is a real field; only the placeholder carries no information to keep.
		const rule = geoRule('coordinates');

		expect(normalizeGeoRadiusRule(geoConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it('passes a rule of another type under the distance id through unchanged', () => {
		const rule: SerializedRule = { config: { set: ['x']}, field: '<function>', type: 'InSetRule' };

		expect(normalizeGeoRadiusRule(geoConfig(rule)).rules[0]?.rule).toBe(rule);
	});

	it('leaves a function-field rule under any other id untouched', () => {
		const config: FilterEngineConfig = {
			rules: [{ id: 'elsewhere', rule: geoRule('<function>') }],
			version: 1,
		};

		expect(normalizeGeoRadiusRule(config)).toBe(config);
	});

	it('leaves every other rule in a config with a distance rule untouched', () => {
		const status: SerializedRule = { config: { set: ['active']}, field: 'status', type: 'InSetRule' };
		// A geo rule over a function field under another id is not the distance filter: the id is what
		// says which field the placeholder stood for, so it stays as the link carried it.
		const elsewhere = geoRule('<function>');
		const normalized = normalizeGeoRadiusRule({
			rules: [
				{ id: 'status', rule: status },
				{ id: GEO_RADIUS_RULE_ID, rule: geoRule('<function>') },
				{ id: 'elsewhere', rule: elsewhere },
			],
			version: 1,
		});

		expect(normalized.rules[0]).toEqual({ id: 'status', rule: status });
		expect(normalized.rules[0]?.rule).toBe(status);
		expect(normalized.rules[1]?.rule).toEqual(geoRule('coords'));
		expect(normalized.rules[2]?.rule).toBe(elsewhere);
	});
});

describe('withNormalizedGeoRadiusRule', () => {
	it('normalizes on decode, delegates encode and keeps the serializer name', () => {
		const decoded = geoConfig(geoRule('<function>'));
		const inner = {
			decode: vi.fn(() => decoded),
			encode: vi.fn(() => 'encoded'),
			name: 'compact' as const,
		};
		const wrapped = withNormalizedGeoRadiusRule(inner);

		expect(wrapped.decode('anything')).toEqual(geoConfig(geoRule('coords')));
		expect(inner.decode).toHaveBeenCalledWith('anything');
		expect(wrapped.encode(decoded)).toBe('encoded');
		expect(inner.encode).toHaveBeenCalledWith(decoded);
		expect(wrapped.name).toBe('compact');
	});
});
