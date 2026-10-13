/**
 * Tests for the config-driven rule-type → control registry.
 *
 * @remarks
 * **These assert on the returned React ELEMENT, not on rendered DOM.** The registry's job is to map a
 * serialized rule to the right control with the right DERIVED props — the label, the slider step, the
 * chip vocabulary, the Fuse keys. Rendering would pull in the `BookFilterSections` components (Radix,
 * ResizeObserver shims, pointer-capture), and would then be testing THEM: they are PascalCase
 * presentational components, excluded from coverage and driven end-to-end by all six verticals.
 *
 * So the seam is the element tree. Callback props (`format`, `parse`, `formatLabel`) are invoked
 * directly, which exercises the module-private helpers behind them without a DOM at all.
 *
 * What is protected: every derived prop here is something the JSON config does NOT declare. Get the
 * derivation wrong and the generic panel renders a control that looks right and behaves subtly wrong
 * — a slider stepping by 1 where it should step by 0.1, or a fuzzy search silently ignoring an
 * array-valued field.
 */

import type { SerializedRule } from '@filter-enginez/core';
import type React from 'react';

import { describe, expect, it } from 'vitest';

import { defaultControlRegistry, deriveStep, humanizeRuleId } from './controlRegistry.js';
import { type CorpusVocabulary } from './vocabularies.js';

/** A vocabulary stub whose answers each test can dictate. */
function stubVocabulary(overrides: Partial<CorpusVocabulary> = {}): CorpusVocabulary {
	return {
		distinctStrings: () => [],
		isArrayField: () => false,
		numericBounds: (_field, fallback) => fallback,
		numericValueStep: () => 0,
		...overrides,
	};
}

/**
 * Render one config entry through the registry.
 *
 * @param type - The `SerializedRule.type` key.
 * @param entry - Partial serialized rule (merged with sensible defaults).
 * @param vocab - Corpus vocabulary stub.
 * @returns The produced element, typed loosely so props can be inspected.
 */
function renderControl(
	type: string,
	entry: Partial<SerializedRule> = {},
	vocab: CorpusVocabulary = stubVocabulary(),
): React.ReactElement<Record<string, unknown>> {
	const renderer = defaultControlRegistry.get(type);

	if (renderer === undefined) {
		throw new Error(`No renderer registered for ${type}`);
	}
	const element = renderer({
		entry: { config: {}, field: 'genre', type, ...entry },
		field: 'genre',
		label: 'Genre',
		ruleId: 'genre',
		vocab,
	});

	if (element === null) {
		throw new Error(`Renderer for ${type} returned null`);
	}

	return element as React.ReactElement<Record<string, unknown>>;
}

describe('humanizeRuleId', () => {
	it.each([
		['page-count', 'Page count'],
		['genre', 'Genre'],
		['publication-year', 'Publication year'],
	])('sentence-cases %s', (ruleId, expected) => {
		// Only the FIRST word is capitalized — "Page count", not "Page Count". Labels come from the
		// config's own ids, so this is the whole label table.
		expect(humanizeRuleId(ruleId)).toBe(expected);
	});

	it.each([
		['isbn-format', 'ISBN format'],
		['api-source', 'API source'],
		['url-slug', 'URL slug'],
		['sql-dialect', 'SQL dialect'],
	])('upper-cases the known acronym in %s', (ruleId, expected) => {
		expect(humanizeRuleId(ruleId)).toBe(expected);
	});

	it('upper-cases an acronym even in first position', () => {
		// The acronym check runs BEFORE the first-word check, so "Isbn" never appears.
		expect(humanizeRuleId('isbn')).toBe('ISBN');
	});

	it('leaves an unknown mid-word acronym-looking token alone', () => {
		expect(humanizeRuleId('book-xyz')).toBe('Book xyz');
	});

	it('handles a single word and an empty id without throwing', () => {
		expect(humanizeRuleId('rating')).toBe('Rating');
		expect(humanizeRuleId('')).toBe('');
	});
});

describe('deriveStep', () => {
	it.each([
		['a rating span of 5', 0, 5, 0.1],
		['a span of exactly 10', 0, 10, 0.1],
		['a year span of 125', 1900, 2025, 1],
		['a span of exactly 1000', 0, 1000, 1],
		['a page-count span of 1500', 0, 1500, 10],
	])('steps %s by the readable granularity', (_label, min, max, expected) => {
		// Both boundaries are pinned because they are `<=`: a span of exactly 10 still steps by 0.1,
		// and exactly 1000 still steps by 1. Off by one either way and a slider's granularity changes
		// for a whole class of fields.
		expect(deriveStep(min, max)).toBe(expected);
	});

	it('treats a zero-width span as fine-grained', () => {
		expect(deriveStep(5, 5)).toBe(0.1);
	});
});

describe('registry coverage', () => {
	it('registers exactly the rule types the books config declares', () => {
		// An unregistered type renders NO control — the rule still filters, but silently and with no UI
		// to clear it. Asserting the exact set makes an accidental removal fail here rather than in a
		// panel someone happens to open.
		expect([...defaultControlRegistry.keys()].sort()).toEqual([
			'BooleanRule',
			'ExistsRule',
			'FuzzySearchRule',
			'InSetRule',
			'RangeRule',
			'RegexRule',
			'TextSearchRule',
		]);
	});
});

describe('InSetRule control', () => {
	it('feeds the corpus vocabulary in as chip options', () => {
		const element = renderControl('InSetRule', {}, stubVocabulary({ distinctStrings: () => ['fantasy', 'graphic-novel']}));

		expect(element.props['options']).toEqual(['fantasy', 'graphic-novel']);
	});

	it('renders kebab-case vocabulary values as spaced words', () => {
		// `graphic-novel` is a real books genre. A chip reading "graphic-novel" is a leaked data format.
		const format = renderControl('InSetRule').props['formatLabel'] as (value: string) => string;

		expect(format('graphic-novel')).toBe('graphic novel');
		expect(format('fantasy')).toBe('fantasy');
	});
});

describe('RangeRule control', () => {
	it('derives its step from the declared bounds and pads the baseline with it', () => {
		const seen: { fallback: unknown; step?: number }[] = [];
		const element = renderControl(
			'RangeRule',
			{ config: { max: 1500, min: 0 }},
			stubVocabulary({
				numericBounds: (_field, fallback, step) => {
					seen.push({ fallback, step });

					return fallback;
				},
			}),
		);

		// The slider and the predictive-disable bundle must pad by the SAME step, or the bundle's
		// available-range shading lands off the slider's own grid.
		expect(element.props['step']).toBe(10);
		expect(seen[0]?.step).toBe(10);
		expect(seen[0]?.fallback).toEqual({ max: 1500, min: 0 });
	});

	it('formats fractional steps to one decimal and whole steps to none', () => {
		const fine = renderControl('RangeRule', { config: { max: 5, min: 0 }}).props['format'] as (value: number) => string;
		const coarse = renderControl('RangeRule', { config: { max: 1500, min: 0 }}).props['format'] as (value: number) => string;

		expect(fine(4.25)).toBe('4.3');
		expect(coarse(432.7)).toBe('433');
	});

	it('parses an edited value, tolerating stray characters', () => {
		// The slider's value box is editable, so users paste "1,200 pp" and similar.
		const parse = renderControl('RangeRule', { config: { max: 1500, min: 0 }}).props['parse'] as (raw: string) => number;

		expect(parse('432')).toBe(432);
		expect(parse('1,200 pp')).toBe(1200);
		expect(parse('4.5★')).toBe(4.5);
		expect(parse('-12')).toBe(-12);
	});

	it('labels the slider for assistive tech', () => {
		expect(renderControl('RangeRule', { config: { max: 5, min: 0 }}).props['ariaLabel']).toBe('Genre range');
	});
});

describe('FuzzySearchRule control', () => {
	it('routes an array-valued field through Fuse multi-key mode', () => {
		// The config never declares that `authors` is `string[]` — only the corpus knows. Without the
		// keys, Fuse matches against a stringified array and the search quietly stops working well.
		const element = renderControl('FuzzySearchRule', {}, stubVocabulary({ isArrayField: () => true }));

		expect(element.props['keys']).toEqual(['genre']);
	});

	it('omits keys entirely for a scalar field', () => {
		expect(renderControl('FuzzySearchRule').props).not.toHaveProperty('keys');
	});

	it('honors a declared threshold and defaults when absent', () => {
		expect(renderControl('FuzzySearchRule', { config: { threshold: 0.2 }}).props['threshold']).toBe(0.2);
		expect(renderControl('FuzzySearchRule', { config: {}}).props['threshold']).toBe(0.4);
	});
});

describe('text-ish controls', () => {
	it('lower-cases the label inside the TextSearchRule placeholder but not the aria-label', () => {
		const element = renderControl('TextSearchRule');

		expect(element.props['placeholder']).toBe('Search genre…');
		expect(element.props['ariaLabel']).toBe('Search Genre');
	});

	it('marks the FuzzySearchRule placeholder as typo-tolerant', () => {
		expect(renderControl('FuzzySearchRule').props['placeholder']).toBe('Search genre (typo-tolerant)…');
	});

	it('gives RegexRule its own placeholder + aria-label', () => {
		const element = renderControl('RegexRule');

		expect(element.props['placeholder']).toBe('a regular expression…');
		expect(element.props['ariaLabel']).toBe('Filter Genre by regular expression');
	});
});

describe('flag controls', () => {
	it.each(['BooleanRule', 'ExistsRule'])('%s passes through ruleId, field and label', (type) => {
		expect(renderControl(type).props).toMatchObject({ field: 'genre', label: 'Genre', ruleId: 'genre' });
	});
});
