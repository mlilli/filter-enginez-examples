/**
 * Tests for `labAboutLinks.ts` — the `/about` → `/lab` cross-links this app supplies.
 *
 * @remarks
 * `<AboutPage>` looks each link up by section id and renders nothing when the key matches no
 * section. That leniency is right for the page — failing a whole documentation route over a mistyped
 * key would be worse than the typo — but it means a typo is otherwise SILENT: the link simply never
 * appears, on a page nobody re-reads, and the `/about` claim it backs with a running demonstration
 * goes unbacked. This file makes a mistyped key fail here instead.
 *
 * @packageDocumentation
 */

import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
import { describe, expect, it } from 'vitest';

import { LAB_ABOUT_LINKS, LAB_ROUTE_PATH } from './labAboutLinks.js';

/** Every section id the shared About content actually defines. */
const SECTION_IDS = new Set(ABOUT_SECTIONS.map((section) => section.id));

describe('LAB_ABOUT_LINKS', () => {
	it('keys only sections that really exist, so no link silently fails to render', () => {
		for (const sectionId of Object.keys(LAB_ABOUT_LINKS)) {
			expect(SECTION_IDS.has(sectionId)).toBe(true);
		}
	});

	it('is not vacuous — there are links, and the section catalog is not empty either', () => {
		// The loop above passes over an empty object, and `SECTION_IDS.has` over an empty catalog
		// would fail rather than pass — but an empty LAB_ABOUT_LINKS would make the whole slice a
		// no-op while every assertion stayed green. Ask what the suite does when its INPUT disappears.
		expect(Object.keys(LAB_ABOUT_LINKS).length).toBe(3);
		expect(SECTION_IDS.size).toBeGreaterThan(3);
	});

	it('links the three capabilities the lab actually runs, and no others', () => {
		// Naming them explicitly rather than counting: linking `roaring` or `bloom` would claim a
		// running demonstration the lab does not have, since neither has a pane.
		expect(Object.keys(LAB_ABOUT_LINKS).sort()).toEqual(['bayesian', 'memoization', 'similarity']);
	});

	it('pins the route path as a LITERAL, not against itself', () => {
		// Added after mutant D2 SURVIVED. The case below asserts `link.to === LAB_ROUTE_PATH`, which
		// is true by construction — the links are built FROM that constant, so changing it changes
		// both sides and the assertion compares the constant to itself. Renaming the route to
		// `/laboratory` would have sailed through while `App.tsx`'s router, which reads the same
		// constant, quietly started serving a different URL from the one every doc and e2e spec names.
		//
		// The literal is what makes a rename a deliberate act: it forces the person doing it to
		// change this line too.
		expect(LAB_ROUTE_PATH).toBe('/lab');
	});

	it('points every link at the lab route, from the one place that path is written', () => {
		for (const link of Object.values(LAB_ABOUT_LINKS)) {
			expect(link.to).toBe(LAB_ROUTE_PATH);
			expect(link.label.length).toBeGreaterThan(0);
		}
	});
});
