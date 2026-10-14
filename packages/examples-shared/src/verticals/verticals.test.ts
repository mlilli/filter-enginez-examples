/**
 * Tests for the vertical registry.
 *
 * @remarks
 * This module is DATA, so most of it cannot be wrong in a way a unit test would catch — a wrong
 * blurb is a wrong blurb. What these cases pin is the part that can silently rot: the registry
 * claiming a route or an origin that the repo does not actually have. The comparison page renders
 * links from `routes`, so an entry that lies produces a 404 in a page whose entire purpose is showing
 * that the six agree.
 *
 * The dev ORIGINS are pinned elsewhere, in `tests/tooling/devServerPorts.test.ts`, and the production
 * hosts in `tests/tooling/cloudflareDeploy.test.ts` (against each app's `wrangler.jsonc`), deliberately
 * so: those checks need to read files off disk, and this package is browser-only —
 * its tsconfig has no `node` types, so `node:fs` does not resolve here. The tooling project reads
 * this file as TEXT rather than importing it, which also keeps its no-workspace-imports boundary.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	COMPARE_PATH,
	DEMOS_SECTION_ID,
	HOW_IT_WORKS_PATH,
	SITE,
	stackLabel,
	vertical,
	type VerticalId,
	VERTICALS,
	verticalSubtitle,
} from './verticals.js';

describe('VERTICALS', () => {
	it('has exactly the six demo applications, with unique ids', () => {
		const ids = VERTICALS.map((entry) => entry.id);

		expect(ids).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
	});

	it('gives every vertical a unique dev origin', () => {
		// Two entries on one port is the bug `devServerPorts.test.ts` exists for, arriving from the
		// other direction: here it would make two rows of the comparison page link to the same app.
		const origins = VERTICALS.map((entry) => entry.devOrigin);

		expect(new Set(origins).size).toBe(origins.length);
	});

	it('gives every vertical its own HTTPS subdomain of filterenginez.com, as a bare origin', () => {
		// Each app is a separate site, so two entries on one host would make two rows of the comparison
		// page open the same app. "Bare origin" is the part a typo breaks quietly: a trailing slash or a
		// path here doubles up with the route the comparison page appends (`…com//books`), and
		// `new URL(...).origin` round-trips only a value with neither.
		const origins = VERTICALS.map((entry) => entry.productionOrigin);

		expect(new Set(origins).size).toBe(origins.length);
		for (const origin of origins) {
			expect(origin, origin).toMatch(/^https:\/\/[a-z][a-z-]*\.filterenginez\.com$/u);
			expect(new URL(origin).origin).toBe(origin);
		}
	});

	it('lists /books everywhere', () => {
		// The one route every vertical has. The comparison page uses books as its default dataset for
		// exactly this reason, so if one vertical ever drops it, that page loses its subject.
		for (const entry of VERTICALS) {
			expect(entry.routes, `${entry.id} should serve /books`).toContain('/books');
		}
	});

	it('lists no /compare: the comparison is one page on the landing site, not a route per app', () => {
		for (const entry of VERTICALS) {
			expect(entry.routes, entry.id).not.toContain(COMPARE_PATH);
		}
	});

	it('lists no /about: "How the engine works" is one page on the landing site, not a route per app', () => {
		for (const entry of VERTICALS) {
			expect(entry.routes, entry.id).not.toContain('/about');
		}
	});

	it('places the landing site at the apex and on its own dev port', () => {
		expect(SITE.productionOrigin).toBe('https://filterenginez.com');
		expect(SITE.devOrigin).toMatch(/^http:\/\/127\.0\.0\.1:\d{4,5}$/u);
		expect(VERTICALS.map((entry) => entry.devOrigin)).not.toContain(SITE.devOrigin);
		expect(HOW_IT_WORKS_PATH).toBe('/how-it-works');
		expect(COMPARE_PATH).toBe('/compare');
		expect(DEMOS_SECTION_ID).toBe('demos');
	});

	it('starts every route with a slash and lists none twice', () => {
		for (const entry of VERTICALS) {
			expect(new Set(entry.routes).size, `${entry.id} repeats a route`).toBe(entry.routes.length);
			for (const route of entry.routes) {
				expect(route.startsWith('/'), `${entry.id}: ${route}`).toBe(true);
			}
		}
	});

	it('gives the framework-less vertical a null binding, and every other one a real package', () => {
		// The `surface: 'none'` / `binding: null` pair is the honest encoding of "there is nothing
		// between this app and the engine". A placeholder string here would put a package name in the
		// comparison table for a vertical whose entire point is not having one.
		for (const entry of VERTICALS) {
			if (entry.surface === 'none') {
				expect(entry.binding).toBeNull();
			} else {
				expect(entry.binding).toMatch(/^@filter-enginez\//u);
			}
		}
	});
});

describe('vertical', () => {
	it('returns the descriptor for each id', () => {
		expect(vertical('angular').framework).toBe('Angular 22');
		expect(vertical('vanilla').binding).toBeNull();
	});

	it('throws on an unknown id rather than returning undefined', () => {
		// A typo should be loud. Returning undefined would render an empty subtitle, which reads as a
		// styling bug and gets chased in the wrong file.
		expect(() => vertical('preact' as VerticalId)).toThrow(/Unknown vertical id/u);
	});
});

describe('stackLabel', () => {
	it('is the bare name with no tier', () => {
		expect(stackLabel('react-rtk')).toBe('React RTK');
	});

	it('parenthesizes the tier when a route differs from its vertical default', () => {
		expect(stackLabel('react-rtk', 'server')).toBe('React RTK (server)');
		expect(stackLabel('vanilla', 'bare-core')).toBe('Vanilla (bare core)');
		expect(stackLabel('sveltekit', 'worker')).toBe('SvelteKit (worker)');
		expect(stackLabel('react-plain', 'config')).toBe('React plain (JSON config)');
	});

	it('labels BOTH halves of the vanilla pair, not just the unusual one', () => {
		// `/books-raw` is only legible as a contrast. Labelling it `(bare core)` while `/books` stays a
		// bare `Vanilla` leaves the suffix pointing at nothing, and a visitor on `/books` has no way to
		// tell they are looking at the other half of the comparison.
		expect(stackLabel('vanilla', 'signals')).toBe('Vanilla (signals)');
		expect(stackLabel('vanilla', 'bare-core')).toBe('Vanilla (bare core)');
	});
});

describe('verticalSubtitle', () => {
	it('joins the dataset and the stack with the chrome separator', () => {
		expect(verticalSubtitle('Books', 'vue')).toBe('Books · Vue');
		expect(verticalSubtitle('Wine', 'sveltekit', 'server')).toBe('Wine · SvelteKit (server)');
	});
});
