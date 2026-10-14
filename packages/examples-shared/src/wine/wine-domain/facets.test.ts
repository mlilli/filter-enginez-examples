/**
 * Tests for `deriveWineFacets` — the pure half of the wine boot.
 *
 * @remarks
 * This is the one part of wine's boot that CAN be tested without a worker, and the part where being
 * wrong is quietest. Every failure mode here presents as a plausible-looking panel:
 *
 *   - Baselines taken from `FALLBACK_BOUNDS` instead of the corpus make everything beyond them
 *     unreachable, and the slider looks completely normal while doing it.
 *   - A vocabulary derived from the 10k default tier rather than the worker's 150k is missing entries,
 *     and a missing chip reads as "the corpus has none of those".
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

// A test may import the dataset barrel: it never ships. The module under test may not (see its docblock).
import { buildOriginTree, type Wine, type WineOrigin } from '@filter-enginez/mock-data/wine';
import { FULL_WINE_TIER_SIZE, generateWines } from '@filter-enginez/mock-data/wine/generator';
import { deriveBaselineBounds, type PickerTreeNode } from '@filter-enginez/react-ui/bounds';
import { describe, expect, it } from 'vitest';

import {
	buildOriginTreeFromOriginIds,
	buildWineOriginTree,
	deriveWineFacets,
	ORIGIN_TREE_ROOT_ID,
	rankWineVarietals,
} from './facets.js';
import {
	FALLBACK_BOUNDS,
	SLIDER_FIELD_GETTERS,
	type SliderFieldId,
	VARIETAL_CHIP_LIMIT,
	visibleVarietalChips,
	WINE_SLIDER_TEXT,
} from './filterConfig.js';

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
 * That is the point of the fixture: a $5,000 bottle and an 1890 vintage are both beyond
 * `FALLBACK_BOUNDS`, so a derivation that quietly used the placeholder instead of the data would fail
 * rather than merely look different.
 */
const FIXTURE_WINES: readonly Wine[] = [
	makeWine({ color: 'red', id: 'w0', points: 96, priceUsd: 5000, varietal: 'Syrah', vintage: 1890 }),
	makeWine({ body: 'light', color: 'white', id: 'w1', priceUsd: 8, sweetness: 'sweet', vintage: 2021 }),
	makeWine({ color: 'rosé', id: 'w2', points: 82, priceUsd: 15, varietal: 'Grenache', vintage: 2010 }),
];

describe('deriveWineFacets', () => {
	it('derives slider baselines from the corpus, not from the placeholder', () => {
		const { baselines } = deriveWineFacets(FIXTURE_WINES);

		// The corpus reaches $5,000; the placeholder stops short. A baseline that stopped there would
		// make every expensive bottle unreachable the moment someone touched the slider.
		expect(baselines.price.max).toBeGreaterThanOrEqual(5000);
		expect(baselines.price.max).toBeGreaterThan(FALLBACK_BOUNDS.price.max);
		expect(baselines.price.min).toBeLessThanOrEqual(8);
	});

	it('reaches a vintage outside the placeholder window', () => {
		const { baselines } = deriveWineFacets(FIXTURE_WINES);

		expect(baselines.vintage.min).toBeLessThanOrEqual(1890);
		expect(baselines.vintage.min).toBeLessThan(FALLBACK_BOUNDS.vintage.min);
	});

	it('collects each vocabulary from the corpus, distinct', () => {
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

	it('ranks varietals by wine count, not alphabetically', () => {
		const corpus = [
			makeWine({ id: 'a', varietal: 'Abouriou' }),
			makeWine({ id: 'b', varietal: 'Pinot Noir' }),
			makeWine({ id: 'c', varietal: 'Pinot Noir' }),
		];

		expect(deriveWineFacets(corpus).vocabularies.varietal).toEqual(['Pinot Noir', 'Abouriou']);
		expect(rankWineVarietals(corpus)).toEqual(['Pinot Noir', 'Abouriou']);
	});

	it('lists the origin with the most wines first', () => {
		const corpus = [
			makeWine({ id: 'a', origin: { country: 'Argentina', province: 'Mendoza Province', region: '', subregion: '' }, originId: 'Argentina|Mendoza Province' }),
			makeWine({ id: 'b', origin: { country: 'US', province: 'Oregon', region: '', subregion: '' }, originId: 'US|Oregon' }),
			makeWine({ id: 'c', origin: { country: 'US', province: 'Oregon', region: '', subregion: '' }, originId: 'US|Oregon' }),
		];

		expect(buildWineOriginTree(corpus).children?.map((node) => node.id)).toEqual(['US', 'Argentina']);
	});

	it('matches wines whose origin stops above a leaf when their region is selected', () => {
		// Real wine data mixes wines with and without a subregion under one region. A spec holding only
		// leaves would leave the subregion-less wines unmatched by the region, the state and the country.
		const corpus = [
			makeWine({ id: 'a', origin: { country: 'US', province: 'Oregon', region: 'Willamette Valley', subregion: '' }, originId: 'US|Oregon|Willamette Valley' }),
			makeWine({ id: 'b', origin: { country: 'US', province: 'Oregon', region: 'Willamette Valley', subregion: 'Dundee Hills' }, originId: 'US|Oregon|Willamette Valley|Dundee Hills' }),
		];
		const { originSpecs } = deriveWineFacets(corpus);

		for (const node of ['US', 'US|Oregon', 'US|Oregon|Willamette Valley']) {
			const spec = originSpecs.find((candidate) => candidate.value === node);

			expect(spec?.leafIds).toContain('US|Oregon|Willamette Valley');
			expect(spec?.leafIds).toContain('US|Oregon|Willamette Valley|Dundee Hills');
		}
	});
});

/** The 150,000-wine tier, generated once for the suites that need all of it. */
let fullTierCache: undefined | readonly Wine[];

/**
 * The 150,000-wine tier the deployed pages generate in their worker.
 *
 * @returns The tier, generated on first use and reused after.
 */
function fullTier(): readonly Wine[] {
	fullTierCache ??= generateWines(FULL_WINE_TIER_SIZE, undefined, 'full');

	return fullTierCache;
}

/** A tree node reduced to what identifies it, with every level's children sorted by id. */
interface ComparableNode {
	readonly id: string;
	readonly children: readonly ComparableNode[];
	readonly label: string;
}

/**
 * Reduce a tree to a form two builders can be compared in, whatever order each lists children in.
 *
 * @param nodes - One level of the tree.
 * @returns The level, sorted by id, each node with its sorted children.
 */
function comparableLevel(nodes: readonly { readonly id: string; readonly children?: readonly unknown[]; readonly label?: string }[]): readonly ComparableNode[] {
	return nodes
		.map((node) => ({
			children: comparableLevel((node.children ?? []) as Parameters<typeof comparableLevel>[0]),
			id: node.id,
			label: node.label ?? '',
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

describe('buildOriginTreeFromOriginIds', () => {
	it('builds the same nodes as the dataset’s own buildOriginTree over the 150,000-wine tier', () => {
		const corpus = fullTier();
		const ours = buildOriginTreeFromOriginIds(corpus.map((wine) => wine.originId));
		const theirs = buildOriginTree(corpus);

		expect(ours.id).toBe(theirs.id);
		// Non-vacuous: the tier has dozens of countries, each with a subtree.
		expect(theirs.children.length).toBeGreaterThan(10);
		expect(comparableLevel(ours.children ?? [])).toEqual(comparableLevel(theirs.children));
	});

	it('makes every prefix of an origin id a node, labeled by its own level, shared between wines', () => {
		const tree = buildOriginTreeFromOriginIds(['US|Oregon|Willamette Valley', 'US|Oregon', 'US|California']);

		expect(tree).toEqual<PickerTreeNode>({
			children: [
				{
					children: [
						{ children: [{ id: 'US|Oregon|Willamette Valley', label: 'Willamette Valley' }], id: 'US|Oregon', label: 'Oregon' },
						{ id: 'US|California', label: 'California' },
					],
					id: 'US',
					label: 'US',
				},
			],
			id: ORIGIN_TREE_ROOT_ID,
			label: 'Origin',
		});
	});

	it('adds no node for an empty origin id, and keeps an empty root’s children', () => {
		expect(buildOriginTreeFromOriginIds([]).children).toEqual([]);
		expect(buildOriginTreeFromOriginIds(['']).children).toEqual([]);
	});
});

describe('FALLBACK_BOUNDS', () => {
	it('are the extents of the 150,000-wine tier, so the deployed sliders do not jump on boot', () => {
		// The guard on the hand-written numbers: regenerate the tier, derive each slider's baseline the
		// way the panels do, and compare. A generator change that moves an extent fails here.
		const fields: readonly SliderFieldId[] = ['abv', 'points', 'price', 'vintage'];

		for (const field of fields) {
			expect(deriveBaselineBounds(fullTier().map(SLIDER_FIELD_GETTERS[field]), FALLBACK_BOUNDS[field], 0), field).toEqual(
				FALLBACK_BOUNDS[field],
			);
		}
	});
});

describe('visibleVarietalChips', () => {
	const ranked = Array.from({ length: VARIETAL_CHIP_LIMIT + 5 }, (_unused, index) => `grape-${String(index)}`);

	it('shows the most-reviewed varietals up to the limit', () => {
		expect(visibleVarietalChips(ranked, [])).toEqual(ranked.slice(0, VARIETAL_CHIP_LIMIT));
	});

	it('keeps a selected varietal from beyond the limit', () => {
		const rare = ranked.at(-1) ?? '';

		expect(visibleVarietalChips(ranked, [rare])).toEqual([...ranked.slice(0, VARIETAL_CHIP_LIMIT), rare]);
	});
});

describe('WINE_SLIDER_TEXT', () => {
	it.each([
		['price', 1250, '$1,250'],
		['abv', 13.5, '13.5%'],
		['points', 92, '92'],
		['vintage', 2025, 'NV'],
	] as const)('formats %s %s as %s and parses it back', (field, value, text) => {
		expect(WINE_SLIDER_TEXT[field].format(value)).toBe(text);
		expect(WINE_SLIDER_TEXT[field].parse(text)).toBe(value);
	});

	it('reads text that is not a number as NaN, which the sliders revert', () => {
		expect(WINE_SLIDER_TEXT.price.parse('cheap')).toBeNaN();
	});
});

