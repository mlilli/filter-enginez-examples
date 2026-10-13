/**
 * Tests for the brand loaders barrel — asserts the three canonical loaders are re-exported.
 */

import { describe, expect, it } from 'vitest';

import * as loaders from './index.js';

describe('brand loaders barrel', () => {
	it('re-exports the three canonical loaders', () => {
		expect(typeof loaders.SynapticOrbit).toBe('function');
		expect(typeof loaders.NeuralCluster).toBe('function');
		expect(typeof loaders.BrainSynapse).toBe('function');
	});
});
