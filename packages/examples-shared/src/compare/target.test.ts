/**
 * Coverage for the header Compare button's URL construction.
 *
 * @remarks
 * Kept apart from `core.test.ts`, which tests the rest of the `core.js` barrel — origins, links,
 * presets, state — so both files stay well under the 500-line cap. `hasComparableState` is tested
 * there, beside the other `links.ts` exports it belongs to.
 *
 * The two assertions that earn their keep are the layout ones. A root-relative `/compare` passes
 * every dev-hosted check and 404s in production, because the `paths` layout serves each vertical
 * under `${origin}/${id}` — a failure whose entire tell is which layout you tested under.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { vertical, VERTICALS } from '../verticals/verticals.js';
import {
	COMPARE_DATASETS,
	COMPARE_ROUTE,
	compareTargetHref,
	DATASET_PARAM,
	readCompareDataset,
	URL_STATE_PARAM,
} from './core.js';

/** A `?f=` value good enough to exercise link building, without depending on a preset. */
const SAMPLE_STATE = 'h~{"version":1,"rules":[]}';

/** Stand-in for `window.location` on a developer's machine. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5174' };

/** Stand-in for the deployed site. */
const PROD_LOCATION = { hostname: 'filterenginez.innov8.io', origin: 'https://filterenginez.innov8.io' };

describe('compareTargetHref', () => {
	it('points every vertical at its OWN /compare, not another app’s', () => {
		// The header button is the one link in the slice that must NOT travel between verticals. If it
		// resolved someone else's origin the visitor would silently change apps on the way to a page
		// whose whole subject is which app they are in.
		for (const descriptor of VERTICALS) {
			const url = new URL(
				compareTargetHref({
					currentVerticalId: descriptor.id,
					dataset: 'books',
					layout: 'dev',
					location: DEV_LOCATION,
					serialized: SAMPLE_STATE,
				}),
			);

			expect(url.origin).toBe(new URL(descriptor.devOrigin).origin);
			expect(url.pathname).toBe(COMPARE_ROUTE);
		}
	});

	it('lands on a route the vertical actually serves', () => {
		// `compareTargetHref` deliberately carries no runtime guard for this — it would be a branch no
		// test could reach, and an unreachable branch fails the coverage gate. The registry-level fact
		// is asserted here instead, so a vertical that drops /compare fails loudly rather than shipping
		// a button into a 404.
		for (const descriptor of VERTICALS) {
			expect(descriptor.routes, `${descriptor.id} serves no ${COMPARE_ROUTE}`).toContain(COMPARE_ROUTE);
		}
	});

	it('carries the state through the query string rather than concatenating it', () => {
		// Same hazard `compareLinks` guards: the readable format is un-encoded JSON, so a hand-built
		// href is malformed for exactly the format a human is most likely to be reading.
		const href = compareTargetHref({
			currentVerticalId: 'react-rtk',
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
			currentVerticalId: 'vue',
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
		// one here would hand `/compare` the very value `hasComparableState` exists to reject.
		const url = new URL(
			compareTargetHref({
				currentVerticalId: 'angular',
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
				currentVerticalId: 'sveltekit',
				dataset: 'real-estate',
				layout: 'dev',
				location: DEV_LOCATION,
				serialized: SAMPLE_STATE,
			}),
		);

		expect(search.indexOf(DATASET_PARAM)).toBeLessThan(search.indexOf(`${URL_STATE_PARAM}=`));
	});

	it('stays inside the vertical’s base path under the paths layout', () => {
		// The bug this test exists for: a root-relative `/compare` works in dev and 404s in production,
		// because each app is served under `${origin}/${id}` there. Dev-only verification would have
		// reported that as green.
		const href = compareTargetHref({
			currentVerticalId: 'vanilla',
			dataset: 'books',
			layout: 'paths',
			location: PROD_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(new URL(href).pathname).toBe(`/vanilla${COMPARE_ROUTE}`);
	});

	it('uses the vertical’s own subdomain under the subdomains layout', () => {
		const href = compareTargetHref({
			currentVerticalId: 'vanilla',
			dataset: 'books',
			layout: 'subdomains',
			location: PROD_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(href.startsWith('https://fe-vanilla.innov8.io/compare')).toBe(true);
	});

	it('detects the layout when none is supplied', () => {
		// The production callers omit `layout`; every other case here passes one explicitly, so without
		// this the default parameter is never exercised.
		const href = compareTargetHref({
			currentVerticalId: 'react-plain',
			dataset: 'books',
			location: DEV_LOCATION,
			serialized: null,
		});

		expect(new URL(href).origin).toBe(new URL(vertical('react-plain').devOrigin).origin);
	});
});
