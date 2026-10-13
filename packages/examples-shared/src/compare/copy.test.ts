/**
 * Tests for the `/compare` copy that counts.
 *
 * @remarks
 * Its own file rather than more of `core.test.ts`, which sits near the 500-line cap.
 *
 * **What makes these worth asserting at all**, given they are four one-line template strings: the
 * failure they guard against is not a logic error but a NUMBER IN PROSE that stops being true when
 * the registry changes, with nothing in the copy itself edited — including in an accessible name.
 * So the assertions here are about the CONTRACT (the count tracks the registry; both arms of the
 * phrasing are exercised), not about the wording, which is free to change.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { VERTICALS } from '../verticals/verticals.js';
import {
	COMPARE_DATASETS,
	compareButtonTitle,
	compareEmptyHint,
	compareHeading,
	compareListLabel,
	verticalsServing,
} from './core.js';

/** The dataset served by exactly two verticals — the reason none of this can be a constant. */
const TWO_ROW_DATASET = 'wine-server';

/** A dataset served by all six. */
const SIX_ROW_DATASET = 'books';

describe('verticalsServing', () => {
	it('returns the six-vertical set for a browser dataset and the two-vertical set for the server one', () => {
		expect(verticalsServing(SIX_ROW_DATASET)).toHaveLength(VERTICALS.length);
		expect(verticalsServing(TWO_ROW_DATASET).map((descriptor) => descriptor.id)).toEqual([
			'sveltekit',
			'vanilla',
		]);
	});
});

describe('the copy that counts', () => {
	it.each([
		['compareButtonTitle', compareButtonTitle],
		['compareEmptyHint', compareEmptyHint],
		['compareHeading', compareHeading],
		['compareListLabel', compareListLabel],
	])('%s never says "six" for a two-vertical dataset', (_name, build) => {
		const copy = build(TWO_ROW_DATASET);

		// The hard-coded count, asserted as an ABSENCE. A regression here would be someone introducing
		// a constant, and the constant's exact wording is what to watch for.
		expect(copy).not.toContain('six');
		expect(copy).not.toContain('6');
	});

	it.each([
		['compareButtonTitle', compareButtonTitle],
		['compareEmptyHint', compareEmptyHint],
		['compareHeading', compareHeading],
		['compareListLabel', compareListLabel],
	])('%s is non-empty for every dataset', (_name, build) => {
		// Vacuity guard. Every assertion above is satisfied by the empty string, and a template literal
		// that lost its body would pass all of them — the same failure `hasComparableState` legislates
		// against on the URL side.
		for (const dataset of COMPARE_DATASETS) {
			expect(build(dataset).length, `${_name} was empty for ${dataset}`).toBeGreaterThan(10);
		}
	});

	it('says "both" for two and "all N" for six, rather than "all 2"', () => {
		// The one branch in this module. Both arms are reachable — three datasets are six-wide and
		// `wine-server` is two — so this is a real branch rather than a `v8 ignore`, and it is asserted
		// as such because an unreachable arm would only surface on the coverage gate, not in `pnpm test`.
		expect(compareButtonTitle(TWO_ROW_DATASET)).toContain('both');
		expect(compareButtonTitle(SIX_ROW_DATASET)).toContain(`all ${VERTICALS.length}`);
	});

	it('counts the rows the page will actually render, not the registry', () => {
		// The claim the whole module exists to make, phrased against `verticalsServing` rather than
		// against a literal: the number in the copy is the number of rows below it. A count taken from
		// `VERTICALS.length` would satisfy every other assertion here and still be wrong on the one
		// dataset that matters.
		for (const dataset of COMPARE_DATASETS) {
			expect(compareListLabel(dataset)).toBe(`The ${verticalsServing(dataset).length} demo apps`);
		}
	});
});
