/**
 * A React drawer spec must click facet chips through `clickFirstFacetChip`, never raw.
 *
 * @remarks
 * The specs that drive react-ui's off-canvas `<FilterDrawer />` (listed below) share a failure the
 * non-React specs cannot have: the panel dims to `.fe-filter-panel__body--busy` while the engine
 * recomputes, and that modifier sets `pointer-events: none`. On these panels `__scroller` and `__body` are the SAME element, so the
 * scroll container itself stops being a hit-test target — every chip inside it goes with it, the hit
 * falls through, and Playwright reports whatever sits at that viewport point. `clickFirstFacetChip`
 * waits that out and says so when it cannot.
 *
 * **A raw click can pass by coincidence.** A raw click preceded by `const before = await
 * settledCount(page)` — a line written to capture a count — gets that line's wait for free, and passes.
 * The same click in a test with no count to capture has no wait, and fails. A green suite full of the
 * first kind is measuring a coincidence.
 *
 * That is the shape this bans. A new spec is free to type the raw form, and it would pass on the day
 * it was written for exactly that accidental reason — then fail, months later, in whichever test
 * first has no count to read. The failure surfaces as `<section> intercepts pointer events`, naming
 * an element that is not the problem, ninety seconds after the click.
 *
 * **Scoped to the React drawer specs on purpose.** The non-React specs expand an inline collapse
 * with no dialog role, and `closeFilterPanel`'s docblock is explicit that only the React specs have
 * anything to dismiss. They also address chips outside a `.fe-filter-panel__body`, so `FACET_CHIP`
 * would not resolve there. Banning the raw form globally would be a rule this repo cannot keep.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_DIR = resolve(REPO_ROOT, 'tests/e2e');

/**
 * The marker for "this spec drives the off-canvas drawer".
 *
 * @remarks
 * Keyed on the drawer's ARIA role rather than on a filename list, so a sixth React drawer spec is
 * covered the moment it is written instead of the moment someone remembers to add it here.
 */
const DRAWER_MARKER = "getByRole('dialog'";

/** A chip click that goes straight to the locator instead of through the helper. */
const RAW_CHIP_CLICK = /locator\(\s*(?:TOGGLEABLE_CHIP|FACET_CHIP)\s*\)\s*\.first\(\)\s*\.click\(/gu;

/** Every spec under `tests/e2e`, as `[name, source]`. */
function e2eSpecs(): readonly (readonly [string, string])[] {
	return readdirSync(E2E_DIR)
		.filter((name) => name.endsWith('.spec.ts'))
		.map((name) => [name, readFileSync(resolve(E2E_DIR, name), 'utf8')] as const);
}

/** The subset of those specs that drive react-ui's off-canvas drawer. */
function reactDrawerSpecs(): readonly (readonly [string, string])[] {
	return e2eSpecs().filter(([, source]) => source.includes(DRAWER_MARKER));
}

describe('React drawer specs', () => {
	it('finds the spec directory and the drawer specs in it', () => {
		// Guards the guard, twice. A moved directory would make every assertion below vacuously green,
		// and so would a renamed drawer role — the second is the likelier of the two, because it would
		// be a deliberate change by someone with no reason to look at this file.
		expect(e2eSpecs().length).toBeGreaterThan(20);
		expect(reactDrawerSpecs().map(([name]) => name)).toEqual([
			'books-server.spec.ts',
			'books.spec.ts',
			// The header Compare button's spec: it has to APPLY a filter before the button has anything
			// to carry, so it drives the drawer like its siblings and is held to the same
			// `clickFirstFacetChip` rule by the two assertions below.
			'compare-button.spec.ts',
			// Sorts BEFORE `real-estate.spec.ts`, which is not obvious at a glance: `readdirSync` gives
			// code-unit order, and the two filenames first differ at their fourth character, where
			// `c` (99) beats `l` (108).
			// `examples-react-plain`'s wine spec. It is here for the reason this roster is keyed on the
			// drawer ROLE rather than on a filename pattern: the plain-React app renders the identical
			// react-ui `<FilterDrawer>`, so it inherits the same `--busy` race and the same rule.
			//
			// **It reaches the drawer through the shared suite rather than clicking chips itself**, so
			// the two assertions below pass over it trivially — `wineFlow.ts` owns the clicks and calls
			// `clickFirstFacetChip` for all six verticals. That is by design, not a gap:
			// the rule is satisfied by the specs having nothing to get wrong.
			'react-plain-wine.spec.ts',
			'real-estate.spec.ts',
			'url-state.spec.ts',
			'wine.spec.ts',
		]);
	});

	it('never clicks a facet chip without going through clickFirstFacetChip', () => {
		const offenders = reactDrawerSpecs().flatMap(([name, source]) =>
			[...source.matchAll(RAW_CHIP_CLICK)].map(() => name),
		);

		expect(
			offenders,
			'use `clickFirstFacetChip(page)` from ./filterFlow.js — a raw click races the panel’s `--busy` lock',
		).toEqual([]);
	});

	it('imports the helper in every drawer spec that clicks a chip', () => {
		// The ban above is satisfiable by deleting the click. This is the other half: a drawer spec that
		// exercises a facet must reach it through the one seam, so the wait cannot be re-implemented
		// locally and drift from the panel contract it encodes.
		const missing = reactDrawerSpecs()
			.filter(([, source]) => source.includes('clickFirstFacetChip('))
			.filter(([, source]) => !source.includes("from './filterFlow.js'"))
			.map(([name]) => name);

		expect(missing).toEqual([]);
	});
});
