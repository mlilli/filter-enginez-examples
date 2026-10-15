/**
 * Coverage for the header Compare button's URL construction.
 *
 * @remarks
 * Kept apart from `core.test.ts`, which tests the rest of the `core.js` barrel — origins, links,
 * presets, state — so both files stay well under the 500-line cap. `hasComparableState` is tested
 * there, beside the other `links.ts` exports it belongs to.
 *
 * The assertions that earn their keep are the layout ones. A link built for the wrong layout passes
 * every dev-hosted check and sends a deployed visitor to a loopback port (or the reverse) — a failure
 * whose entire tell is which layout you tested under.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { COMPARE_PATH, SITE } from '../verticals/verticals.js';
import {
	COMPARE_DATASETS,
	compareTargetHref,
	DATASET_PARAM,
	readCompareDataset,
	URL_STATE_PARAM,
} from './core.js';

/** A `?f=` value good enough to exercise link building, without depending on a preset. */
const SAMPLE_STATE = 'h~{"version":1,"rules":[]}';

/** Stand-in for `window.location` on a developer's machine. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5191' };

/** Stand-in for the deployed site. */
const PROD_LOCATION = { hostname: 'react.filterenginez.com', origin: 'https://react.filterenginez.com' };

describe('compareTargetHref', () => {
	it('points at the one comparison page on the landing site, from every app', () => {
		// The page left the apps for the apex, and the button follows it: a root-relative `/compare`
		// would stay on the app's own host, where that address is only a redirect.
		const url = new URL(
			compareTargetHref({ dataset: 'books', location: PROD_LOCATION, serialized: SAMPLE_STATE }),
		);

		expect(url.origin).toBe('https://filterenginez.com');
		expect(url.pathname).toBe(COMPARE_PATH);
	});

	it('carries the state through the query string rather than concatenating it', () => {
		// Same hazard `compareLinks` guards: the readable format is un-encoded JSON, so a hand-built
		// href is malformed for exactly the format a human is most likely to be reading.
		const href = compareTargetHref({
			dataset: 'books',
			layout: 'dev',
			location: DEV_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(new URL(href).searchParams.get(URL_STATE_PARAM)).toBe(SAMPLE_STATE);
	});

	it.each(COMPARE_DATASETS)('names %s in a form readCompareDataset reads back', (dataset) => {
		// The round-trip that makes the button and the page agree. Both ends go through the shared
		// param name and the shared narrowing, so a rename cannot land on one side only.
		const href = compareTargetHref({
			dataset,
			layout: 'dev',
			location: DEV_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(readCompareDataset(new URL(href).searchParams.get(DATASET_PARAM))).toBe(dataset);
	});

	it.each([
		['null', null],
		['an empty string', ''],
	])('omits the state param entirely for %s', (_label, serialized) => {
		// Not `?f=` with nothing after it: an empty param is what a trimmed link produces, and emitting
		// one here would hand the page the very value `hasComparableState` exists to reject.
		const url = new URL(
			compareTargetHref({
				dataset: 'books',
				layout: 'dev',
				location: DEV_LOCATION,
				serialized,
			}),
		);

		expect(url.searchParams.has(URL_STATE_PARAM)).toBe(false);
		expect(url.searchParams.get(DATASET_PARAM)).toBe('books');
	});

	it('puts the dataset before the state, so the address bar reads front-first', () => {
		const { search } = new URL(
			compareTargetHref({
				dataset: 'real-estate',
				layout: 'dev',
				location: DEV_LOCATION,
				serialized: SAMPLE_STATE,
			}),
		);

		expect(search.indexOf(DATASET_PARAM)).toBeLessThan(search.indexOf(`${URL_STATE_PARAM}=`));
	});

	it('uses the deployed apex in production', () => {
		const href = compareTargetHref({
			dataset: 'books',
			layout: 'production',
			location: DEV_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(href.startsWith(`https://filterenginez.com${COMPARE_PATH}?`)).toBe(true);
	});

	it('detects the layout when none is supplied, and reaches the local site server in development', () => {
		// The production callers omit `layout`; the cases above mostly pass one explicitly, so without
		// this the default parameter's dev arm is never exercised.
		const href = compareTargetHref({ dataset: 'books', location: DEV_LOCATION, serialized: null });

		expect(new URL(href).origin).toBe(SITE.devOrigin);
		expect(new URL(href).pathname).toBe(COMPARE_PATH);
	});
});
