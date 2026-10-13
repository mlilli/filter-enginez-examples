/**
 * Unit tests for the framework-neutral 404 core (copy + toggle logic).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { NOT_FOUND_RESULT_COUNT, notFoundBody, toggleNotFoundChip } from './core.js';

describe('toggleNotFoundChip', () => {
	it('adds an unselected id and removes a selected one (symmetric difference)', () => {
		expect(toggleNotFoundChip([], 'fantasy')).toEqual(['fantasy']);
		expect(toggleNotFoundChip(['fantasy', 'mystery'], 'fantasy')).toEqual(['mystery']);
	});

	it('never changes the result count — it is always zero', () => {
		// The "joke" is load-bearing: no toggle can move the count off zero.
		expect(NOT_FOUND_RESULT_COUNT).toBe(0);
	});
});

describe('notFoundBody', () => {
	it('weaves in the offending path when known', () => {
		expect(notFoundBody('/foo/bar')).toContain('/foo/bar');
	});

	it('falls back to a generic line when the path is absent/empty', () => {
		expect(notFoundBody()).toContain('matched nothing');
		expect(notFoundBody(null)).toContain('matched nothing');
		expect(notFoundBody('')).toContain('matched nothing');
	});
});
