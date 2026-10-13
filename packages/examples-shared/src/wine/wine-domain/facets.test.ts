/**
 * Tests for `deriveWineFacets` — the pure half of the wine boot.
 *
 * @remarks
 * This is the one part of wine's boot that CAN be tested without a worker, and the part where being
 * wrong is quietest. Every failure mode here presents as a plausible-looking panel:
 *
 *   - Baselines taken from `FALLBACK_BOUNDS` instead of the corpus make everything above ~$400
 *     unreachable, and the slider looks completely normal while doing it.
 *   - A vocabulary derived from the bundled 10k rather than the worker's 130k is missing entries, and
 *     a missing chip reads as "the corpus has none of those".
 *
 * So the assertions are about the corpus's real extremes reaching the outputs, not about the shape of
 * the returned object.
 *
 * **Tested here, beside the code.** The shared derivation is what all four non-React wine verticals
 * call, so the test belongs in this package — `ng test` is a separate runner, so a copy in
 * `examples-angular` would leave this package's own coverage reporting the file as untested.
 *
 * @packageDocumentation
 */

import type { Wine, WineOrigin } from '@filter-enginez/mock-data/wine';

import { describe, expect, it } from 'vitest';

import { deriveWineFacets } from './facets.js';
import { FALLBACK_BOUNDS } from './filterConfig.js';

/**
 * Build one fixture wine, defaulting every field the facets do not read.
 *
 * @remarks
 * Structurally complete and NOT cast — the first draft of this fixture used
 * `as unknown as Wine` with a flat `country` / `province`, which typechecked and then threw inside
 * `buildOriginTree`, because `origin` is a nested object. A cast that silences the compiler on a
 * fixture silences the one check that would have caught the shape.
 *
 * @param overrides - The fields a test cares about.
 * @returns A structurally complete `Wine`.
 */
function makeWine(overrides: Partial<Wine> & Pick<Wine, 'id'>): Wine {
	const origin: WineOrigin = {
		country: 'Portugal',
		province: 'Douro',
		region: 'Douro',
		subregion: '',
	};

	return {
		abv: 13.5,
		body: 'medium',
		color: 'red',
		description: 'a quiet wine about nothing much',
		designation: '',
		labelImage: 'label.jpg',
		lastUpdated: '2026-01-01T00:00:00.000Z',
		name: `Wine ${overrides.id}`,
		origin,
		originId: 'Portugal|Douro|Douro',
		points: 90,
		priceUsd: 25,
		sweetness: 'dry',
		tastingNotes: [],
		tier: 'default',
		varietal: 'Touriga Nacional',
		vintage: 2015,
		winery: 'Fixture Estate',
		...overrides,
	};
}

/**
 * A corpus whose extremes sit deliberately OUTSIDE the pre-boot placeholder bounds.
 *
 * @remarks
 * That is the point of the fixture: a $900 bottle and a 1998 vintage are both beyond
 * `FALLBACK_BOUNDS`, so a derivation that quietly used the placeholder instead of the data would fail
 * rather than merely look different.
 */
const FIXTURE_WINES: readonly Wine[] = [
	makeWine({ color: 'red', id: 'w0', points: 96, priceUsd: 900, varietal: 'Syrah', vintage: 1998 }),
	makeWine({ body: 'light', color: 'white', id: 'w1', priceUsd: 8, sweetness: 'sweet', vintage: 2021 }),
	makeWine({ color: 'rosé', id: 'w2', points: 82, priceUsd: 15, varietal: 'Grenache', vintage: 2010 }),
];

describe('deriveWineFacets', () => {
	it('derives slider baselines from the corpus, not from the placeholder', () => {
		const { baselines } = deriveWineFacets(FIXTURE_WINES);

		// The corpus reaches $900; the placeholder stops well short. A baseline that stopped there would
		// make every expensive bottle unreachable the moment someone touched the slider.
		expect(baselines.price.max).toBeGreaterThanOrEqual(900);
		expect(baselines.price.max).toBeGreaterThan(FALLBACK_BOUNDS.price.max);
		expect(baselines.price.min).toBeLessThanOrEqual(8);
	});

	it('reaches a vintage outside the placeholder window', () => {
		const { baselines } = deriveWineFacets(FIXTURE_WINES);

		expect(baselines.vintage.min).toBeLessThanOrEqual(1998);
		expect(baselines.vintage.min).toBeLessThan(FALLBACK_BOUNDS.vintage.min);
	});

	it('collects each vocabulary from the corpus, sorted and distinct', () => {
		const { vocabularies } = deriveWineFacets(FIXTURE_WINES);

		expect([...vocabularies.color].sort()).toEqual(['red', 'rosé', 'white'].sort());
		expect(vocabularies.varietal).toContain('Syrah');
		expect(vocabularies.varietal).toContain('Grenache');
		// Three wines, two of them sharing the default body — the vocabulary is distinct values.
		expect(vocabularies.body).toEqual([...new Set(vocabularies.body)]);
	});

	it('returns an origin tree and specs that agree with each other', () => {
		const { originSpecs, originTree } = deriveWineFacets(FIXTURE_WINES);

		expect(originTree).not.toBeNull();
		expect(originSpecs.length).toBeGreaterThan(0);
		// Every spec must carry at least one leaf id, or selecting that node would commit an empty set —
		// which is not a neutral rule, it is a rule matching nothing.
		for (const spec of originSpecs) {
			expect(spec.leafIds.length).toBeGreaterThan(0);
		}
	});

	it('survives an empty corpus rather than throwing', () => {
		// Reachable on a failed or partial boot. Falling back to the placeholder is right HERE — it is
		// the only answer available — which is exactly why it must not be the answer when data exists.
		const facets = deriveWineFacets([]);

		expect(facets.vocabularies.color).toEqual([]);
		expect(facets.baselines.price).toEqual(FALLBACK_BOUNDS.price);
	});
});
