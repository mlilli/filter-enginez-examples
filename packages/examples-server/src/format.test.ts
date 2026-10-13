/**
 * Unit tests for the pure output-formatting helpers.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { type ApplyConfigResult } from './applyConfig.js';
import { formatRecordLine, formatReport, formatSummary, pickPreviewFields } from './format.js';

const RESULT: ApplyConfigResult = {
	appliedRuleIds: ['genre', 'publication-year'],
	datasetLabel: 'Books',
	matched: 1234,
	results: [{ genre: 'Fantasy', publicationYear: 2019, title: 'A Book' }],
	total: 10_000,
	truncated: true,
};

describe('pickPreviewFields', () => {
	it('skips undefined as well as null, and skips non-primitive values', () => {
		// Three separate skip paths, one record: `null`, `undefined`, and values that
		// are objects/arrays. A record preview that printed "[object Object]" for a nested field would
		// be worse than omitting it, which is exactly what these guards are for.
		const fields = pickPreviewFields(
			{ arr: [1, 2], nested: { deep: true }, nil: null, ok: 'yes', undef: undefined },
			10,
		);

		expect(fields).toEqual([['ok', 'yes']]);
	});

	it('returns primitive, non-null fields up to the max', () => {
		const fields = pickPreviewFields({ a: 'x', b: 2, c: true, d: 'y', e: null }, 3);

		expect(fields).toEqual([['a', 'x'], ['b', '2'], ['c', 'true']]);
	});

	it('returns an empty list for non-objects', () => {
		expect(pickPreviewFields(42)).toEqual([]);
		expect(pickPreviewFields(null)).toEqual([]);
	});
});

describe('formatRecordLine', () => {
	it('joins key=value pairs in insertion order', () => {
		expect(formatRecordLine({ points: 92, title: 'X' }, 2)).toBe('points=92  title=X');
	});
});

describe('formatSummary', () => {
	it('summarizes counts + rules with thousands separators', () => {
		expect(formatSummary(RESULT)).toBe('Books · 1,234 of 10,000 matched · rules: genre, publication-year');
	});

	it('shows (none) when no rules applied', () => {
		expect(formatSummary({ ...RESULT, appliedRuleIds: []})).toContain('rules: (none)');
	});
});

describe('formatReport', () => {
	it('includes the summary, a numbered record, and a truncation note', () => {
		const report = formatReport(RESULT);

		expect(report).toContain('Books · 1,234 of 10,000 matched');
		expect(report).toContain('1. genre=Fantasy');
		expect(report).toContain('title=A Book');
		expect(report).toContain('1,233 more');
	});

	it('notes when nothing matched', () => {
		expect(formatReport({ ...RESULT, matched: 0, results: [], truncated: false })).toContain('(no matching records)');
	});

	it('omits the "N more" line when the result set is complete', () => {
		// The untested half of the truncation branch. Telling someone "… 0 more" after showing them
		// everything would be worse than saying nothing.
		const report = formatReport({ ...RESULT, matched: 1, truncated: false });

		expect(report).toContain('title=A Book');
		expect(report).not.toContain('more');
	});
});
