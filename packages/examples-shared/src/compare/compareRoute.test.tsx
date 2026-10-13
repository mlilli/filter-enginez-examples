/**
 * Test for the shared `/compare` route object.
 *
 * @remarks
 * Mirrors `notFoundRoute.test.tsx` rather than `docsRoutes.test.ts`, because comparing the element's
 * TYPE catches a mis-wired component where a truthiness check does not.
 *
 * **The constraint that matters most here is not assertable from this file.** `/compare` must be
 * spread into each app's route array BEFORE `/:datasetId`, or the dataset resolver claims the path
 * first and answers with its unknown-dataset 404 — and this route object would still be perfectly
 * correct while that happened. Same shape as the 404 route's ordering requirement: it belongs to the
 * app's route array, and an e2e click-through is where it surfaces.
 *
 * `ComparePage` itself is not covered here. It is PascalCase, so `vitest.config.ts` excludes it as a
 * pure presentational component, e2e-covered like the rest of the six verticals' UI. Every decision
 * the page makes lives in `compare-core` (`origins.ts`, `links.ts`, `presets.ts`), which is unit-
 * tested in `core.test.ts` — that split is why the exclusion is honest rather than a coverage dodge.
 */

import { describe, expect, it } from 'vitest';

import { ComparePage } from './ComparePage.js';
import { compareRoute } from './compareRoute.js';

describe('compareRoute', () => {
	it('mounts at /compare', () => {
		expect(compareRoute.path).toBe('/compare');
	});

	it('renders the shared ComparePage', () => {
		// Compared by element type rather than by rendering: this module's job is the WIRING, and the
		// page's own behavior is covered by compare-core's unit tests plus the e2e.
		expect((compareRoute.element as React.ReactElement).type).toBe(ComparePage);
	});

	it('declares no children — dataset and preset are query params, not sub-routes', () => {
		// Flat by design, so a chosen comparison is a shareable URL rather than component state
		// nobody can link to. A child route appearing here would mean that decision got reversed.
		expect(compareRoute.children).toBeUndefined();
	});
});
