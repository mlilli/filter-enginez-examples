/**
 * Test for the shared 404 catch-all route object.
 *
 * @remarks
 * Both React apps spread this in as the FINAL entry of their route array. Its two properties are
 * the whole contract, and the ordering requirement it depends on cannot be asserted from here — an
 * app that spreads it early would swallow every route declared after it, and this route object would
 * still be perfectly correct. That failure belongs to the app's route array, and the e2e specs are
 * where it surfaces.
 *
 * What IS assertable here: the path is the react-router splat and the element is the shared page. A
 * typo in either produces an app with no 404 at all — an unmatched path renders a blank shell with no
 * error, which looks like a loading state that never finishes.
 */

import { describe, expect, it } from 'vitest';

import { NotFoundPage } from './NotFoundPage.js';
import { notFoundRoute } from './notFoundRoute.js';

describe('notFoundRoute', () => {
	it('matches on the react-router splat', () => {
		expect(notFoundRoute.path).toBe('*');
	});

	it('renders the shared NotFoundPage', () => {
		// Compared by element type rather than by rendering: this module's job is the WIRING, and the
		// page's own behavior is covered by its component tests.
		expect((notFoundRoute.element as React.ReactElement).type).toBe(NotFoundPage);
	});
});
