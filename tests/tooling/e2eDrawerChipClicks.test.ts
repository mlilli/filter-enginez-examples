/**
 * A facet-chip click in the e2e suite goes through `clickFirstFacetChip`, never raw.
 *
 * @remarks
 * Every app's filter panel dims its body while the engine recomputes (`fe-filter-panel__body--busy`,
 * or `fe-books-panel__body--busy` in the books panels outside React), and that modifier sets
 * `pointer-events: none`. Where `__scroller` and `__body` are the SAME element the scroll container
 * itself stops being a hit-test target — every chip inside it goes with it, the hit falls through, and
 * Playwright reports whatever sits at that viewport point. `clickFirstFacetChip` waits that out and
 * says so when it cannot.
 *
 * **A raw click can pass by coincidence.** A raw click preceded by `const before = await
 * settledCount(page)` — a line written to capture a count — gets that line's wait for free, and passes.
 * The same click in a test with no count to capture has no wait, and fails. A green suite full of the
 * first kind is measuring a coincidence.
 *
 * That is the shape this bans, in two scopes:
 *
 *   1. **`FACET_CHIP` is never clicked raw, anywhere.** It is the body-scoped chip selector that exists
 *      for the helper, so a raw click on it is the helper's wait re-implemented as nothing.
 *   2. **A file that clicks through the helper clicks every chip through it.** Mixing the two in one
 *      file is where the coincidence hides: the helper's wait before one click covers a raw click
 *      after it, until someone reorders the cases.
 *
 * The roster is derived — every e2e source that calls the helper — so the shared flow modules and a
 * new spec are covered the moment they use it. Older single-app specs that click `TOGGLEABLE_CHIP`
 * directly, and never the helper, are outside scope 2 by construction; scope 1 still holds for them.
 * `filterFlow.ts` itself is excluded: it defines the helper and quotes the raw form in its docblock.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_DIR = resolve(REPO_ROOT, 'tests/e2e');

/** The module that defines the helper, and the one source exempt from the rules below. */
const HELPER_MODULE = 'filterFlow.ts';

/** A call of the helper. */
const HELPER_CALL = 'clickFirstFacetChip(';

/** A raw click on the body-scoped facet chip. */
const RAW_FACET_CHIP_CLICK = /locator\(\s*FACET_CHIP\s*\)\s*\.first\(\)\s*\.click\(/gu;

/** A raw click on either chip selector. */
const RAW_CHIP_CLICK = /locator\(\s*(?:TOGGLEABLE_CHIP|FACET_CHIP)\s*\)\s*\.first\(\)\s*\.click\(/gu;

/**
 * The shared flow modules that drive chips for every app. Named so the guard fails if one stops
 * calling the helper or moves, rather than quietly shrinking its own roster.
 */
const SHARED_FLOWS = ['booksParity.ts', 'realEstateParity.ts', 'wineFlow.ts', 'wineParity.ts', 'winePresetTakeover.ts'];

/** Every TypeScript source under `tests/e2e` except the helper's own module, as `[name, source]`. */
function e2eSources(): readonly (readonly [string, string])[] {
	return readdirSync(E2E_DIR)
		.filter((name) => name.endsWith('.ts') && name !== HELPER_MODULE)
		.map((name) => [name, readFileSync(resolve(E2E_DIR, name), 'utf8')] as const);
}

/** The sources that click chips through the helper. */
function helperCallers(): readonly (readonly [string, string])[] {
	return e2eSources().filter(([, source]) => source.includes(HELPER_CALL));
}

describe('e2e facet-chip clicks', () => {
	it('finds the e2e sources, and the shared flows among the helper\'s callers', () => {
		// Guards the guard: a moved directory, or a flow that stopped calling the helper, would make
		// every assertion below vacuously green.
		expect(e2eSources().length).toBeGreaterThan(20);
		expect(helperCallers().map(([name]) => name)).toEqual(expect.arrayContaining(SHARED_FLOWS));
	});

	it('never clicks FACET_CHIP raw', () => {
		const offenders = e2eSources().flatMap(([name, source]) => [...source.matchAll(RAW_FACET_CHIP_CLICK)].map(() => name));

		expect(offenders, 'use `clickFirstFacetChip(page)` from ./filterFlow.js — a raw click races the panel’s `--busy` lock').toEqual([]);
	});

	it('never mixes a raw chip click into a file that clicks through the helper', () => {
		const offenders = helperCallers().flatMap(([name, source]) => [...source.matchAll(RAW_CHIP_CLICK)].map(() => name));

		expect(offenders, 'click every chip in this file through `clickFirstFacetChip(page, chips)`').toEqual([]);
	});

	it('imports the helper from the one seam in every file that calls it', () => {
		// The bans above are satisfiable by deleting the click. This is the other half: a file that
		// exercises a facet reaches it through the one seam, so the wait cannot be re-implemented
		// locally and drift from the panel contract it encodes.
		const missing = helperCallers()
			.filter(([, source]) => !source.includes("from './filterFlow.js'"))
			.map(([name]) => name);

		expect(missing).toEqual([]);
	});
});
