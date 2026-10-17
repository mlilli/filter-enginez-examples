/**
 * Coverage for the comparison core — origins (the verticals' and the landing site's), links, presets,
 * and the portability round-trip.
 *
 * @remarks
 * Everything on the `core.js` barrel except the header button's URL construction, which has its own
 * `target.test.ts` to keep this file under the 500-line cap.
 *
 * Of the suites below, two earn their keep beyond the obvious:
 *
 * - **Route existence** turns the registry's `routes` docblock ("Not aspirational — the comparison
 *   page links only to these") into something enforced. A vertical that dropped `/books` would otherwise produce
 *   a quietly five-row table; here it produces a failure that names it.
 * - **Preset loading** is the rot-guard for the decision to hand-author states. A renamed rule id
 *   yields an empty result set rather than an error at runtime, so the assertion is on the RESULT
 *   COUNT, not merely on `loadConfig` not throwing.
 *
 * @packageDocumentation
 */

import { createFilterEngine } from '@filter-enginez/core';
import { books } from '@filter-enginez/mock-data/books';
import { listings } from '@filter-enginez/mock-data/real-estate';
import { wines } from '@filter-enginez/mock-data/wine';
import { FULL_WINE_TIER_SIZE, generateWines } from '@filter-enginez/mock-data/wine/generator';
import { createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { describe, expect, it } from 'vitest';

import { HOW_IT_WORKS_PATH, SITE, type VerticalId, VERTICALS } from '../verticals/verticals.js';
import {
	allDemosUrl,
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	type CompareDataset,
	compareLinks,
	DATASET_ROUTES,
	deploymentLayout,
	findPreset,
	hasComparableState,
	howItWorksUrl,
	readCompareDataset,
	resolveCompareState,
	resolveSiteOrigin,
	resolveVerticalOrigin,
	siteHomeUrl,
	siteUrl,
	URL_STATE_PARAM,
} from './core.js';

/** A `?f=` value good enough to exercise link building, without depending on a preset. */
const SAMPLE_STATE = 'h~{"version":1,"rules":[]}';

/** Stand-in for `window.location` on a developer's machine. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:24611' };

/** Stand-in for the deployed site. */
const PROD_LOCATION = { hostname: 'vue.filterenginez.com', origin: 'https://vue.filterenginez.com' };

/** The corpus each dataset's presets are validated against. */
const CORPORA: Readonly<Record<CompareDataset, readonly unknown[]>> = {
	books: books,
	'real-estate': listings,
	// The 150,000-wine tier every browser `/wine` route generates — the exact records the six apps
	// filter, from the same seeded generator, so the gate needs no provisioned data.
	wine: generateWines(FULL_WINE_TIER_SIZE, undefined, 'full'),
	// The same records, and for once that is not an approximation: `examples-server` — which BOTH
	// server-tier routes reach, SvelteKit in-process and vanilla over HTTP — registers wine with
	// `sourceData: wines`, this very array. So the presets are validated against exactly the corpus
	// those two rows filter, rather than against a stand-in for it.
	'wine-server': wines,
};

/**
 * Which verticals serve each dataset — written out by hand, from the apps' actual routes.
 *
 * @remarks
 * 🔴 **The hand-writing is the whole value, and deriving this would silently destroy it.** The
 * assertion below exists to catch a vertical quietly dropping a route from its registry entry, which
 * shows up in a browser as a table one row shorter than it should be and nowhere else. Computing the
 * expectation from `VERTICALS.filter((d) => d.routes.includes(route))` — or from the
 * `verticalsServing` helper that wraps it — restates `compareLinks`' implementation, so the
 * dropped route would satisfy both sides and the guard would report green over the exact regression
 * it is for. An expectation is only an expectation while it comes from somewhere the code under test
 * does not read.
 *
 * **Ordered ids rather than a count**, for the reason `devServerPorts.test.ts` cross-checks owners
 * rather than membership: a count of `2` cannot see vanilla dropping `/wine-server` while Angular
 * gained it. The ordered list catches the drop, the addition, the swap, and a reordering of the
 * registry's presentation order, in one assertion.
 *
 * **`wine-server` being two is the designed state, not a gap.** It is the only entry here that is
 * not all six, and "fixing" it to six would add four links into 404s.
 */
const DATASET_ROSTERS: Readonly<Record<CompareDataset, readonly VerticalId[]>> = {
	books: ['react-rtk', 'react-plain', 'sveltekit', 'vue', 'angular', 'vanilla'],
	'real-estate': ['react-rtk', 'react-plain', 'sveltekit', 'vue', 'angular', 'vanilla'],
	wine: ['react-rtk', 'react-plain', 'sveltekit', 'vue', 'angular', 'vanilla'],
	// SvelteKit runs the isomorphic core in-process in its own server tier; vanilla reaches the same
	// core across a process boundary over a Vite `/api` proxy to `examples-server`. No other vertical
	// serves `/wine-server` — the four React / Vue / Angular apps have no server-filtered wine route.
	'wine-server': ['sveltekit', 'vanilla'],
};

describe('deploymentLayout', () => {
	it.each(['0.0.0.0', '127.0.0.1', '::1', 'localhost', 'app.localhost'])(
		'treats %s as a dev host',
		(hostname) => {
			expect(deploymentLayout({ hostname, origin: `http://${hostname}` })).toBe('dev');
		},
	);

	it('treats a deployed hostname as production', () => {
		expect(deploymentLayout(PROD_LOCATION)).toBe('production');
	});

	it('treats a LOCAL preview of a production build as dev, so its links stay on this machine', () => {
		// `vite preview` and `wrangler dev` serve the production bundle on a loopback host. Were the
		// layout a build-time constant, those links would leave for the deployed sites and the local
		// e2e run would be testing someone else's servers.
		expect(deploymentLayout({ hostname: 'localhost', origin: 'http://localhost:8787' })).toBe('dev');
	});
});

describe('resolveSiteOrigin and the landing-site URLs', () => {
	it('resolves the landing site from the page location, like a vertical', () => {
		expect(resolveSiteOrigin(DEV_LOCATION)).toBe(SITE.devOrigin);
		expect(resolveSiteOrigin(PROD_LOCATION)).toBe(SITE.productionOrigin);
		expect(resolveSiteOrigin(PROD_LOCATION, 'dev')).toBe(SITE.devOrigin);
	});

	it('puts the how-it-works page at the apex when deployed and on the local site server in development', () => {
		// Literals, not the constants restated: the deployed URL is what the sitemap, the canonical link
		// and every app's `_redirects` name, so a change here must be a deliberate one.
		expect(howItWorksUrl(PROD_LOCATION)).toBe('https://filterenginez.com/how-it-works');
		expect(howItWorksUrl(DEV_LOCATION)).toBe('http://127.0.0.1:24617/how-it-works');
		expect(howItWorksUrl(DEV_LOCATION, 'production')).toBe(`${SITE.productionOrigin}${HOW_IT_WORKS_PATH}`);
	});

	it('points every header’s logo at the home page, and "All demos" at its demo list', () => {
		// Literals again: `#demos` is the id of the landing page's demo section, which no type ties to
		// this string, so the deployed URL is pinned exactly.
		expect(siteHomeUrl(PROD_LOCATION)).toBe('https://filterenginez.com/');
		expect(siteHomeUrl(DEV_LOCATION)).toBe('http://127.0.0.1:24617/');
		expect(allDemosUrl(PROD_LOCATION)).toBe('https://filterenginez.com/#demos');
		expect(allDemosUrl(DEV_LOCATION)).toBe('http://127.0.0.1:24617/#demos');
		expect(allDemosUrl(DEV_LOCATION, 'production')).toBe('https://filterenginez.com/#demos');
		expect(siteHomeUrl(PROD_LOCATION, 'dev')).toBe(`${SITE.devOrigin}/`);
	});

	it('resolves any site path against the same origin', () => {
		expect(siteUrl('/compare', PROD_LOCATION)).toBe('https://filterenginez.com/compare');
		expect(siteUrl('/compare', PROD_LOCATION, 'dev')).toBe('http://127.0.0.1:24617/compare');
	});

	it('gives the site an origin no vertical uses', () => {
		for (const layout of ['dev', 'production'] as const) {
			const verticalOrigins = VERTICALS.map((descriptor) => resolveVerticalOrigin(descriptor.id, PROD_LOCATION, layout));

			expect(verticalOrigins).not.toContain(resolveSiteOrigin(PROD_LOCATION, layout));
		}
	});
});

describe('resolveVerticalOrigin', () => {
	it('returns the registry devOrigin in dev, for every vertical', () => {
		for (const descriptor of VERTICALS) {
			expect(resolveVerticalOrigin(descriptor.id, DEV_LOCATION, 'dev')).toBe(descriptor.devOrigin);
		}
	});

	it('returns the registry productionOrigin in production, for every vertical', () => {
		for (const descriptor of VERTICALS) {
			expect(resolveVerticalOrigin(descriptor.id, PROD_LOCATION, 'production')).toBe(descriptor.productionOrigin);
		}
	});

	it('sends a deployed page to the other verticals’ OWN subdomains, not its own host', () => {
		// The regression this pins: resolving relative to the CURRENT origin (a base-path layout) would
		// keep a visitor on `vue.filterenginez.com` for every row of the table.
		expect(resolveVerticalOrigin('vanilla', PROD_LOCATION)).toBe('https://vanilla.filterenginez.com');
		expect(resolveVerticalOrigin('sveltekit', PROD_LOCATION)).toBe('https://svelte.filterenginez.com');
	});

	it('gives every vertical a distinct origin under every layout', () => {
		for (const layout of ['dev', 'production'] as const) {
			const origins = VERTICALS.map((d) => resolveVerticalOrigin(d.id, PROD_LOCATION, layout));

			expect(new Set(origins).size, `${layout} collides`).toBe(VERTICALS.length);
		}
	});
});

describe('compareLinks', () => {
	it.each(COMPARE_DATASETS)('links exactly the verticals that serve %s, in order', (dataset) => {
		// The load-bearing assertion. `compareLinks` filters against each vertical's declared routes,
		// so a vertical that drops the dataset silently shortens the table instead of erroring — and
		// the expectation is the hand-written roster rather than that same filter re-run. See
		// DATASET_ROSTERS for why deriving it here would quietly cancel the guard.
		const links = compareLinks({ dataset, location: DEV_LOCATION, serialized: SAMPLE_STATE });

		expect(links.map((link) => link.vertical.id)).toEqual(DATASET_ROSTERS[dataset]);
		expect(links.every((link) => link.route === DATASET_ROUTES[dataset])).toBe(true);
	});

	it('rosters every dataset, and only wine-server is not all six', () => {
		// A vacuity guard on the table above, and a second reader of the shape. `it.each` over an
		// empty or partial map would pass by running fewer cases, so the map's own completeness is
		// asserted rather than assumed — the same failure mode devServerPorts.test.ts guards with its
		// unparseable-file check.
		expect(Object.keys(DATASET_ROSTERS).sort()).toEqual([...COMPARE_DATASETS].sort());
		expect(
			COMPARE_DATASETS.filter((dataset) => DATASET_ROSTERS[dataset].length !== VERTICALS.length),
		).toEqual(['wine-server']);
	});

	it('round-trips the state through the query string rather than concatenating it', () => {
		// `human-readable` is raw JSON — braces, quotes, commas — and `serializers.ts` deliberately
		// leaves it un-encoded so the transport encodes exactly once. Reading the param back out is
		// the only assertion that would catch a hand-built href, because the malformed URL still
		// LOOKS like a URL.
		const [first] = compareLinks({
			dataset: 'books',
			location: DEV_LOCATION,
			serialized: SAMPLE_STATE,
		});

		expect(first).toBeDefined();
		expect(new URL(first?.href ?? '').searchParams.get(URL_STATE_PARAM)).toBe(SAMPLE_STATE);
	});

	it('links every row to that vertical’s deployed subdomain when the page is deployed', () => {
		// No `layout` passed: this is the production call shape, detected from the host alone.
		const links = compareLinks({ dataset: 'books', location: PROD_LOCATION, serialized: SAMPLE_STATE });

		expect(links.map((link) => new URL(link.href).origin)).toEqual(
			links.map((link) => link.vertical.productionOrigin),
		);
		expect(links.map((link) => new URL(link.href).pathname)).toEqual(links.map(() => '/books'));
	});

	// There is deliberately no "preserves the registry presentation order" case comparing
	// `compareLinks('books').map(id)` against `VERTICALS.map(id)`: that expectation is derived from
	// the registry the function under test reads, so a reordered registry would move both sides and
	// pass. The roster assertion above already catches a reorder, across all four datasets.
});

describe('hasComparableState', () => {
	it.each([
		['an absent param', null],
		['an empty string', ''],
	])('rejects %s', (_label, serialized) => {
		expect(hasComparableState(serialized)).toBe(false);
	});

	it('accepts a serialized state', () => {
		expect(hasComparableState(SAMPLE_STATE)).toBe(true);
	});

	it('accepts a whitespace-only value rather than trimming it', () => {
		// Deliberate, and pinned for the same reason `readCompareDataset` pins its casing: this
		// predicate is consulted by `resolveCompareState` and by the Compare button in five separate
		// framework idioms, and the two must agree exactly. A shell that "helpfully" trimmed would
		// disable a button the page would have honored, or vice versa — a disagreement no single-shell
		// test could see.
		expect(hasComparableState(' ')).toBe(true);
	});
});

describe('readCompareDataset', () => {
	// The narrowing the page and every Compare button share. It lives in `compare-core` because the
	// alternative is a restatement of one query contract on each side, and a side that disagreed would
	// not fail loudly: the page's toggles would silently snap back to the default on every click.
	it.each(COMPARE_DATASETS)('passes %s through unchanged', (dataset) => {
		expect(readCompareDataset(dataset)).toBe(dataset);
	});

	it.each([
		['an absent param', null],
		['an empty string', ''],
		// Deliberately implausible as a dataset id: a negative case naming a value that might become a
		// real dataset would expire the day it did.
		['an unknown dataset', 'whiskey'],
		['a renamed-away id', 'realestate'],
		// A dataset id is compared with `===`, so nothing here is case-insensitive or trimmed. Pinning
		// that is the point: a reader tempted to "help" by lower-casing would diverge from the writers
		// in a way only a cross-vertical test could see.
		['different casing', 'Books'],
		[' a padded value', ' books'],
	])('falls back to the first dataset for %s', (_label, raw) => {
		expect(readCompareDataset(raw)).toBe(COMPARE_DATASETS[0]);
	});

	it('takes its fallback from the toggle order rather than a literal', () => {
		// The guard on the reason `COMPARE_DATASETS` is typed non-empty: reorder the toggle and the
		// default must follow it, or the page opens on one dataset while highlighting another.
		expect(readCompareDataset(null)).toBe(COMPARE_DATASETS[0]);
		expect(DATASET_ROUTES[readCompareDataset(null)]).toBeDefined();
	});
});

describe('resolveCompareState', () => {
	/** A tagged value in the readable format, standing in for one a visitor arrived with. */
	const INBOUND = 'h~{"version":1,"rules":[]}';

	it('returns an inbound ?f= BYTE-FOR-BYTE, in every format', () => {
		// The invariant the whole page rests on, and the reason this lives in the shared core rather than
		// in the page: a page that decoded and re-encoded would still render six working links, and
		// would quietly be demonstrating that an EQUIVALENT state travels rather than the visitor's own.
		// That is a violation that looks exactly like success, so it is asserted against every format
		// the reader might have selected — including the two the inbound value is NOT written in.
		for (const format of ['compact', 'human-readable', 'json-base64'] as const) {
			const state = resolveCompareState({
				dataset: 'books',
				format,
				inboundState: INBOUND,
				presetId: null,
			});

			expect(state.serialized, `format ${format} re-encoded the visitor's state`).toBe(INBOUND);
			expect(state.sourceLabel).toBe('from your link');
		}
	});

	it('ignores a preset id when the visitor brought their own state', () => {
		const state = resolveCompareState({
			dataset: 'books',
			format: 'human-readable',
			inboundState: INBOUND,
			presetId: COMPARE_PRESETS.books[1]?.id ?? '',
		});

		expect(state.serialized).toBe(INBOUND);
	});

	it.each([
		['null', null],
		['an empty string', ''],
	])('treats %s as a cold visit and falls back to the first preset', (_label, inboundState) => {
		// The empty case is the one worth pinning: `?f=` present but blank is what a trimmed or
		// half-copied link produces, and treating it as "state" would transport nothing at all.
		const state = resolveCompareState({ dataset: 'books', format: 'human-readable', inboundState, presetId: null });

		expect(state.sourceLabel).toBe(`preset · ${COMPARE_PRESETS.books[0].label}`);
		expect(state.serialized).not.toBe('');
	});

	it.each(COMPARE_DATASETS)('encodes the named %s preset, round-tripping through the serializer', (dataset) => {
		const chosen = COMPARE_PRESETS[dataset][1];

		expect(chosen).toBeDefined();

		const state = resolveCompareState({
			dataset,
			format: 'human-readable',
			inboundState: null,
			presetId: chosen?.id ?? '',
		});

		expect(state.sourceLabel).toBe(`preset · ${chosen?.label}`);
		// Decoded rather than string-compared: the assertion is that the STATE survives, which is what
		// the six links carry, not that the encoder emits a particular byte sequence.
		expect(createTaggedSerializer('human-readable').decode(state.serialized)).toEqual(chosen?.config);
	});

	it('falls back to the first preset for an unknown or stale id rather than throwing', () => {
		const state = resolveCompareState({
			dataset: 'books',
			format: 'human-readable',
			inboundState: null,
			presetId: 'a-preset-that-was-renamed',
		});

		expect(state.sourceLabel).toBe(`preset · ${COMPARE_PRESETS.books[0].label}`);
	});

	it('honors the requested format, and the formats differ', () => {
		const asked = (format: 'compact' | 'human-readable' | 'json-base64'): string =>
			resolveCompareState({ dataset: 'books', format, inboundState: null, presetId: null }).serialized;
		const encoded = [asked('compact'), asked('human-readable'), asked('json-base64')];

		// Three distinct encodings of one state. Equality here would mean the format argument was being
		// dropped and the page silently served one format — which no other assertion would notice,
		// because all three decode back to the same config.
		expect(new Set(encoded).size).toBe(3);
		for (const serialized of encoded) {
			expect(createTaggedSerializer('human-readable').decode(serialized)).toEqual(
				COMPARE_PRESETS.books[0].config,
			);
		}
	});
});

describe('presets', () => {
	it.each(COMPARE_DATASETS)('offers at least two %s presets with unique ids', (dataset) => {
		const presets = COMPARE_PRESETS[dataset];
		const ids = presets.map((preset) => preset.id);

		expect(presets.length).toBeGreaterThanOrEqual(2);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it.each(COMPARE_DATASETS)('loads every %s preset into a real engine, narrowing but not to zero', (dataset) => {
		const sourceData = CORPORA[dataset];

		for (const preset of COMPARE_PRESETS[dataset]) {
			const engine = createFilterEngine({ sourceData });

			engine.loadConfig(preset.config);

			const matched = engine.getResults().length;

			// Non-empty is the rot-guard: a renamed rule id or field produces a rule that matches
			// nothing, which throws nowhere and would ship a preset that looks broken to a visitor.
			expect(matched, `${dataset}/${preset.id} matched nothing`).toBeGreaterThan(0);
			// And it must actually FILTER — a preset matching the whole corpus demonstrates nothing.
			expect(matched, `${dataset}/${preset.id} did not narrow`).toBeLessThan(sourceData.length);
		}
	});

	it('finds a preset by id, and returns undefined for a stale one', () => {
		expect(findPreset('books', 'modern-fiction')?.label).toBe('Modern fiction');
		expect(findPreset('books', 'no-such-preset')).toBeUndefined();
	});
});

describe('portability — the claim the page exists to make', () => {
	it.each(['human-readable', 'compact', 'json-base64'] as const)(
		'decodes a %s-encoded preset with a serializer that was never told the format',
		(format) => {
			// This is the mechanism the comparison page demonstrates: every vertical wraps `createTaggedSerializer`,
			// whose decode sniffs the `h~` / `c~` / `b~` prefix. So a link built by the Angular app, in
			// whichever format that visitor had selected, opens correctly in the framework-less one.
			// `[0]` is non-nullable because the preset lists are typed non-empty, so no `toBeDefined()`
			// guard or `?? { rules: [], version: 1 }` fallback is needed — and such a fallback would let
			// this assertion pass against an EMPTY config.
			const preset = COMPARE_PRESETS.books[0];
			const encoded = createTaggedSerializer(format).encode(preset.config);

			// Decoded by a DIFFERENT serializer instance, configured for a DIFFERENT format.
			expect(createTaggedSerializer('compact').decode(encoded)).toEqual(preset.config);
		},
	);
});
