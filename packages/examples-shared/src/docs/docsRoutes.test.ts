/**
 * Test for the shared `/docs` route subtree — importing it materializes the route config.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { docsRoute } from './docsRoutes.js';

describe('docsRoute', () => {
	it('defines the /docs layout route with its five children', () => {
		expect(docsRoute.path).toBe('/docs');
		expect(docsRoute.element).toBeTruthy();
		expect(docsRoute.children).toHaveLength(5);
	});
});
