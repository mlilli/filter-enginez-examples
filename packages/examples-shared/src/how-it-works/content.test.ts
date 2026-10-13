/**
 * Tests for `content.ts` — the how-it-works bands and the lab links that hang off three of them.
 *
 * @remarks
 * The page looks each demo link up by band id and renders nothing when the key matches no band. That
 * leniency is right for the page, but it makes a typo SILENT: the link simply never appears, and the
 * claim it backs with a running demonstration goes unbacked. This file makes a mistyped key fail here
 * instead, and pins the narrative's shape the static render and the figure registry both rely on.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { vertical } from '../verticals/verticals.js';
import {
	HOW_IT_WORKS_ACT_TWO,
	HOW_IT_WORKS_DEMO_LINKS,
	HOW_IT_WORKS_SECTIONS,
	LAB_ROUTE_PATH,
	LAB_VERTICAL_ID,
} from './content.js';

/** Every band id the content defines. */
const SECTION_IDS = new Set(HOW_IT_WORKS_SECTIONS.map((section) => section.id));

describe('HOW_IT_WORKS_SECTIONS', () => {
	it('holds eight bands with unique ids, four per act, the core act first', () => {
		expect(HOW_IT_WORKS_SECTIONS).toHaveLength(8);
		expect(SECTION_IDS.size).toBe(8);
		expect(HOW_IT_WORKS_SECTIONS.map((section) => section.group)).toEqual([
			'core',
			'core',
			'core',
			'core',
			'beyond',
			'beyond',
			'beyond',
			'beyond',
		]);
	});

	it('gives every band an anchor-safe id and non-empty copy', () => {
		for (const section of HOW_IT_WORKS_SECTIONS) {
			// The id is a fragment (`#roaring`) and an element id, so it must need no escaping anywhere.
			expect(section.id).toMatch(/^[a-z]+$/u);
			for (const text of [section.body, section.code, section.eyebrow, section.title, section.tocLabel]) {
				expect(text.trim().length, `${section.id} has an empty field`).toBeGreaterThan(0);
			}
		}
	});

	it('words the act-two divider', () => {
		expect(HOW_IT_WORKS_ACT_TWO.title).toBe('Beyond filtering');
		expect(HOW_IT_WORKS_ACT_TWO.lead.length).toBeGreaterThan(0);
	});
});

describe('HOW_IT_WORKS_DEMO_LINKS', () => {
	it('keys only bands that really exist, so no link silently fails to render', () => {
		for (const sectionId of Object.keys(HOW_IT_WORKS_DEMO_LINKS)) {
			expect(SECTION_IDS.has(sectionId), sectionId).toBe(true);
		}
	});

	it('links the three capabilities the lab actually runs, and no others', () => {
		// Named explicitly rather than counted: linking `roaring` or `bloom` would claim a running
		// demonstration the lab does not have, since neither has a pane.
		expect(Object.keys(HOW_IT_WORKS_DEMO_LINKS).sort()).toEqual(['bayesian', 'memoization', 'similarity']);
	});

	it('pins the lab route as a LITERAL, not against itself', () => {
		// Every link is built FROM the constant, so asserting `link.path === LAB_ROUTE_PATH` alone compares
		// the constant to itself and survives a rename. The literal makes a rename a deliberate act.
		expect(LAB_ROUTE_PATH).toBe('/lab');
		expect(LAB_VERTICAL_ID).toBe('react-plain');
	});

	it('points every link at the lab on a vertical that exists, with a label', () => {
		for (const link of Object.values(HOW_IT_WORKS_DEMO_LINKS)) {
			expect(link?.path).toBe(LAB_ROUTE_PATH);
			expect(() => vertical(link?.verticalId ?? LAB_VERTICAL_ID)).not.toThrow();
			expect(link?.verticalId).toBe(LAB_VERTICAL_ID);
			expect(link?.label.length).toBeGreaterThan(0);
		}
	});
});
