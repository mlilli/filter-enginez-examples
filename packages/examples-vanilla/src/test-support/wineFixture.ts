/**
 * `test-support/wineFixture` — the one `Wine`-row factory this package's wine suites share.
 *
 * @remarks
 * ### Why this exists
 *
 * `wine/view.test.ts`, `pages/winePage.test.ts` and `wine/choiceSections.test.ts` all build `Wine`
 * rows. The objection to sharing one row is that the suites differ in their DATA rather than their
 * logic, and that each suite's assertions are pinned to its own defaults: a single shared row would
 * couple three suites' expectations to one line, so tuning a price for one suite would silently move
 * another's result count.
 *
 * **That objection is answered by what gets shared, not by declining to share.** The duplicated
 * LOGIC is `{ ...defaults, ...overrides }` plus the boundary cast, and it has one home here. The
 * DATA stays with whoever asserts on it: {@link createWineMaker} takes a suite's complete defaults
 * and layers nothing underneath them, so no suite inherits a field it did not write.
 *
 * The exception is the canonical row below, which `view.test.ts` and `choiceSections.test.ts` share
 * **byte for byte**, down to the tasting notes — one data set, not two that happen to agree — and
 * {@link makeWine} is it. `winePage.test.ts` keeps its own (a fuller body, a
 * different varietal, no `tier`, and a 92-point score its assertions read) and reaches it through
 * {@link createWineMaker}.
 *
 * ### The cast is `as unknown as Wine`, deliberately widened
 *
 * A fixture row is a stand-in rather than a real record — it carries whatever fields the panel under
 * test touches and nothing else — so the assertion has to survive a row that is legitimately
 * incomplete. A plain `as Wine` compiles only by accident of which fields a suite happens to omit;
 * the double form says what is actually going on at the boundary.
 *
 * ### Coverage note
 *
 * Everything under `test-support/` is a whole-file coverage exclusion (`vitest.coverage.config.ts`).
 *
 * (Written without the leading glob on purpose — a doc comment containing that pattern ends at its
 * own `*` + `/`, and the remainder parses as code. It reports as `ReferenceError: test is not
 * defined` in three unrelated suites.)
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

/** A fixture row's overrides — an `id` is always required, everything else is optional. */
export type WineOverrides = { readonly id: string } & Partial<Wine>;

/** Builds one fixture row from its overrides. */
export type WineMaker = (overrides: WineOverrides) => Wine;

/**
 * The row `wine/view.test.ts` and `wine/choiceSections.test.ts` both wrote, verbatim.
 *
 * @remarks
 * An Etna red at 90 points and $30. Changing anything here moves both of those suites, which is
 * correct — they were already one row written twice. A suite that needs different numbers should
 * build its own maker with {@link createWineMaker} rather than widen this one.
 */
export const CANONICAL_WINE_FIELDS: Partial<Wine> = {
	abv: 13.5,
	body: 'medium',
	color: 'red',
	description: 'Cherry and oak on the nose, with a long finish.',
	designation: 'Estate',
	labelImage: '',
	name: 'A test wine',
	origin: { country: 'Italy', province: 'Sicily', region: 'Etna', subregion: '' },
	originId: 'Italy|Sicily|Etna',
	points: 90,
	priceUsd: 30,
	sweetness: 'dry',
	tastingNotes: ['cherry', 'oak'],
	tier: 'default',
	varietal: 'Nerello Mascalese',
	vintage: 2018,
	winery: 'Nicosia',
};

/**
 * Build a row factory over one suite's own complete defaults.
 *
 * @remarks
 * Nothing is layered beneath `defaults` — what a suite passes is the whole row, minus overrides.
 * That is the property that keeps three suites' expectations independent of each other.
 *
 * @param defaults - Every field this suite's rows carry when not overridden.
 * @returns A maker that merges overrides over those defaults.
 */
export function createWineMaker(defaults: Partial<Wine>): WineMaker {
	return (overrides) => ({ ...defaults, ...overrides }) as unknown as Wine;
}

/**
 * Build a row from {@link CANONICAL_WINE_FIELDS}.
 *
 * @param overrides - The fields this row varies.
 * @returns The row, cast at the boundary — a mini corpus stands in for a full `Wine`.
 */
export const makeWine: WineMaker = createWineMaker(CANONICAL_WINE_FIELDS);
