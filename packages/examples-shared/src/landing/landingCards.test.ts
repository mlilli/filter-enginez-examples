/**
 * Tests for the derived landing roster.
 *
 * @remarks
 * The failure these guard against is not a wrong card — it is a MISSING one, on a page nobody
 * re-reads, for a route that works perfectly when typed, which no other gate in the repo can see.
 *
 * So these assert the derivation against `VERTICALS` rather than against literals: a card list
 * written out here would need the same hand-editing the app modules did, and would go stale in the
 * same commit.
 */

import { describe, expect, it } from 'vitest';

import { vertical, type VerticalId, VERTICALS } from '../verticals/verticals.js';
import { landingCards } from './landingCards.js';

describe('landingCards', () => {
	it('gives every vertical a card for every dataset route it serves', () => {
		// The assertion that catches a missing card. Non-dataset routes are excluded by
		// subtraction rather than by name, so a new `/compare`-like route added to the catalog's ignore
		// list cannot quietly satisfy this.
		for (const { id, routes } of VERTICALS) {
			const hrefs = landingCards(id).map((card) => card.href);
			const datasetRoutes = routes.filter((route) => !['/compare', '/docs'].includes(route));

			expect([...hrefs].sort(), `${id} landing cards`).toEqual([...datasetRoutes].sort());
		}
	});

	it('presents the datasets in the same order in every vertical', () => {
		// The hub is one page rendered in six stacks. If two verticals order the shared datasets
		// differently, the differences a visitor notices stop being the ones the demo is about.
		//
		// Asserted PAIRWISE rather than against one vertical's list, because no vertical serves every
		// dataset — SvelteKit alone has `/wine-server`, the React apps alone have `/books-config` — so
		// any single reference would silently skip whatever it happens to lack.
		const orderOf = (id: VerticalId): string[] => landingCards(id).map((card) => card.id);

		for (const left of VERTICALS) {
			for (const right of VERTICALS) {
				const leftIds = orderOf(left.id);
				const rightIds = orderOf(right.id);

				expect(
					leftIds.filter((id) => rightIds.includes(id)),
					`${left.id} vs ${right.id} card order`,
				).toEqual(rightIds.filter((id) => leftIds.includes(id)));
			}
		}
	});

	it('carries copy for each card rather than a placeholder', () => {
		for (const card of landingCards('sveltekit')) {
			expect(card.blurb.length).toBeGreaterThan(40);
			expect(card.label).not.toBe('');
			expect(card.recordNoun).not.toBe('');
		}
	});

	it('throws on a route it has neither copy nor an exclusion for', () => {
		// Skipping the unknown route would hide it quietly, at runtime, on a page nobody re-reads.
		// This is the branch that makes adding a dataset route impossible to get
		// half-done.
		// Mutated in place and restored, deliberately. `verticals.ts` resolves ids through a Map built
		// once at module load, so replacing the ARRAY entry would leave `vertical()` — and therefore
		// `landingCards` — reading the original descriptor and this test passing for the wrong reason.
		const routes = vertical('vanilla').routes as string[];

		routes.push('/whiskey');

		try {
			expect(() => landingCards('vanilla')).toThrow(/whiskey/u);
		} finally {
			routes.pop();
		}
	});
});
