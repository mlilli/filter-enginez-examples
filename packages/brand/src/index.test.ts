/**
 * Tests for the `@filter-enginez/brand` main barrel — asserts every component is re-exported.
 */

import { describe, expect, it } from 'vitest';

import * as brand from './index.js';

describe('@filter-enginez/brand barrel', () => {
	it('re-exports the mark, wordmark, and all three loaders', () => {
		expect(typeof brand.Mark).toBe('function');
		expect(typeof brand.Wordmark).toBe('function');
		expect(typeof brand.SynapticOrbit).toBe('function');
		expect(typeof brand.NeuralCluster).toBe('function');
		expect(typeof brand.BrainSynapse).toBe('function');
	});
});
