/**
 * Tests for the wine bundle query and its wine-specific readers.
 *
 * @remarks
 * `buildWineBundleQuery` decides which wine facets get predictive-disable data at all, and a facet it
 * omits does not error — it silently renders all-enabled while every other facet keeps working. So the
 * shape of the query is asserted field by field rather than as a snapshot, because a snapshot would
 * happily record a wrong-but-stable answer.
 *
 * The origin group is the part worth the most attention. It is the only `inSetOfSets` facet in the
 * repo: each tree node is simulated against the FULL set of leaf ids selecting it would activate. A
 * branch whose spec carried only its own id would match no wine — wines carry leaf ids — so every
 * country and region would read as permanently unavailable while the leaves underneath them worked
 * fine. That is a disabled-in-the-wrong-direction failure, the kind a user never recovers from,
 * because they simply never click.
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { PickerTreeNode } from '@filter-enginez/react-ui/bounds';

import { describe, expect, it } from 'vitest';

import { buildOriginNodeSpecs, buildWineBundleQuery, deriveOriginSelection, wineFieldMeta, wineSliderHistogram } from './bundle.js';
import { FALLBACK_BOUNDS, wineSliderScale } from './filterConfig.js';

const VOCABULARIES = {
	body: ['full', 'light'],
	color: ['red', 'white'],
	sweetness: ['dry'],
	varietal: ['Merlot'],
};

const ORIGIN_SPECS = [
	{ depth: 0, label: 'Italy', leafIds: ['IT-PIE', 'IT-VEN'], value: 'IT' },
	{ depth: 1, label: 'Piedmont', leafIds: ['IT-PIE'], value: 'IT-PIE' },
];

/** A two-country tree with one nested subregion, mirroring the real picker's shape. */
const TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'IT-PIE', label: 'Piedmont' },
				{ children: [{ id: 'IT-VEN-VAL', label: 'Valpolicella' }], id: 'IT-VEN', label: 'Veneto' },
			],
			id: 'IT',
			label: 'Italy',
		},
		{ children: [{ id: 'FR-BOR', label: 'Bordeaux' }], id: 'FR', label: 'France' },
	],
	id: 'origin',
	label: 'Origin',
};

describe('buildWineBundleQuery', () => {
	const query = buildWineBundleQuery(FALLBACK_BOUNDS, VOCABULARIES, ORIGIN_SPECS);

	it('queries all four flat chip groups plus origin', () => {
		expect(query.chipGroups.map((group) => group.ruleId)).toEqual([
			'color',
			'body',
			'sweetness',
			'varietal',
			'origin',
		]);
	});

	it('carries each group\'s own vocabulary as its candidates', () => {
		// Crossing two facets' vocabularies would produce chips that exist, for values the control
		// cannot select — plausible on screen and inert on click.
		const byRule = new Map(query.chipGroups.map((group) => [group.ruleId, group.candidates]));

		expect(byRule.get('color')).toEqual(VOCABULARIES.color);
		expect(byRule.get('body')).toEqual(VOCABULARIES.body);
		expect(byRule.get('varietal')).toEqual(VOCABULARIES.varietal);
	});

	it('queries origin as inSetOfSets and everything else as inSet', () => {
		// The distinction the tree depends on. `inSet` over a branch node would ask "does any wine have
		// originId === 'IT'", which no wine does — they carry leaf ids — so Italy would always disable.
		const origin = query.chipGroups.find((group) => group.ruleId === 'origin');

		expect(origin?.kind).toBe('inSetOfSets');
		expect(query.chipGroups.filter((group) => group.ruleId !== 'origin').every((group) => group.kind === 'inSet')).toBe(true);
	});

	it('queries all four slider fields with their real field keys', () => {
		// `price` maps to `priceUsd` — the rule id and the corpus field disagree, and a query naming the
		// rule id would return an empty histogram for a field that is fully populated.
		expect(query.fields.map((field) => [field.ruleId, field.fieldKey])).toEqual([
			['price', 'priceUsd'],
			['points', 'points'],
			['abv', 'abv'],
			['vintage', 'vintage'],
		]);
	});

	it('derives each field its own bucket count from its baseline and value grid', () => {
		// Asserted as LITERALS, deliberately. The predecessor of this test compared each count to the
		// `FIELD_BUCKET_COUNTS` entry the query was built from, which passes for any table at all.
		//
		// These are the four counts over FALLBACK_BOUNDS (the 150,000-wine tier's extents):
		//   price   [4, 3242] at $1 → log-scaled: one fine bucket per whole dollar, 3,239
		//   points  [80, 100] at 1  → 21, one bar per point
		//   abv     [5.5, 22] at 0.1 → 166 positions, capped at 84
		//   vintage [1911, 2025] at 1 → log-scaled: one fine bucket per year, 115
		const byRule = new Map(query.fields.map((field) => [field.ruleId, field.bucketCount]));

		expect(byRule.get('price')).toBe(3239);
		expect(byRule.get('points')).toBe(21);
		expect(byRule.get('abv')).toBe(84);
		expect(byRule.get('vintage')).toBe(115);
	});

	it('passes a linear field\'s baseline through as its extents', () => {
		const abv = query.fields.find((field) => field.ruleId === 'abv');

		expect(abv?.baselineMin).toBe(FALLBACK_BOUNDS.abv.min);
		expect(abv?.baselineMax).toBe(FALLBACK_BOUNDS.abv.max);
	});

	it('centers a log-scaled field\'s fine buckets on its value grid', () => {
		// Half a step beyond each end, so every whole-dollar price sits mid-bucket.
		const price = query.fields.find((field) => field.ruleId === 'price');

		expect(price?.baselineMin).toBe(FALLBACK_BOUNDS.price.min - 0.5);
		expect(price?.baselineMax).toBe(FALLBACK_BOUNDS.price.max + 0.5);
	});

	it('gives points one bucket per integer over its 80-100 baseline', () => {
		// Not arbitrary: 21 buckets over [80, 100] is exactly one per point. Any other count straddles
		// integers and renders a comb of uneven bars for a field whose values are all whole numbers.
		// Kept as its own test, and expressed against the bounds rather than as `21`, because this is
		// the property — not the number — that must survive a change to either.
		const points = query.fields.find((field) => field.ruleId === 'points');

		expect(points?.bucketCount).toBe(FALLBACK_BOUNDS.points.max - FALLBACK_BOUNDS.points.min + 1);
	});
});

describe('buildOriginNodeSpecs', () => {
	it('rolls every descendant id up to its ancestors, with the node\'s own id first', () => {
		// THE assertion. Italy's spec must carry its leaves — and its own id and the intermediate ones,
		// which wines whose origin stops above a leaf carry.
		const specs = buildOriginNodeSpecs(TREE);
		const italy = specs.find((spec) => spec.value === 'IT');

		expect(italy?.leafIds).toEqual(['IT', 'IT-PIE', 'IT-VEN', 'IT-VEN-VAL']);
	});

	it('emits parents BEFORE their descendants', () => {
		// Pre-order, and it is user-visible: the non-React verticals render this array as a flat
		// indented list, so post-order would draw every leaf above its own country — not a hierarchy
		// anyone can read. React renders a real tree component and would not notice either way.
		const values = buildOriginNodeSpecs(TREE).map((spec) => spec.value);

		expect(values.indexOf('IT')).toBeLessThan(values.indexOf('IT-PIE'));
		expect(values.indexOf('IT-VEN')).toBeLessThan(values.indexOf('IT-VEN-VAL'));
	});

	it('carries depth and a per-node label, not the whole path', () => {
		// A flat renderer needs both: depth to indent without re-walking, and the node's OWN label —
		// echoing the full id would render `France|Bordeaux|Left Bank|Pauillac` on every row.
		const specs = buildOriginNodeSpecs(TREE);

		expect(specs.find((spec) => spec.value === 'IT')).toMatchObject({ depth: 0, label: 'Italy' });
		expect(specs.find((spec) => spec.value === 'IT-VEN-VAL')).toMatchObject({ depth: 2, label: 'Valpolicella' });
	});

	it('treats a leaf as its own single-member set', () => {
		const specs = buildOriginNodeSpecs(TREE);

		expect(specs.find((spec) => spec.value === 'IT-PIE')?.leafIds).toEqual(['IT-PIE']);
	});

	it('emits a spec for every node below the root, branches included', () => {
		// IT, IT-PIE, IT-VEN, IT-VEN-VAL, FR, FR-BOR — six. The root itself is not queried.
		expect(buildOriginNodeSpecs(TREE)).toHaveLength(6);
		expect(buildOriginNodeSpecs(TREE).some((spec) => spec.value === 'origin')).toBe(false);
	});

	it('carries a mid-level branch its own subtree only', () => {
		expect(buildOriginNodeSpecs(TREE).find((spec) => spec.value === 'IT-VEN')?.leafIds).toEqual(['IT-VEN', 'IT-VEN-VAL']);
	});

	it('returns nothing for a childless root', () => {
		expect(buildOriginNodeSpecs({ id: 'origin', label: 'Origin' })).toEqual([]);
	});

	it('treats an empty children array as a leaf', () => {
		// `children: []` and `children: undefined` both mean "no subtree". Handling only the undefined
		// case would push a branch spec with an empty leaf set, which matches nothing and disables it.
		const specs = buildOriginNodeSpecs({ children: [{ children: [], id: 'IT', label: 'Italy' }], id: 'origin', label: 'Origin' });

		expect(specs).toEqual([{ depth: 0, label: 'Italy', leafIds: ['IT'], value: 'IT' }]);
	});
});

/**
 * A bundle carrying one origin group and one price field.
 *
 * @param overrides - Partial bundle to merge over the defaults.
 * @returns A `FilterBundle`-shaped stub.
 */
function makeBundle(overrides: Partial<FilterBundle> = {}): FilterBundle {
	return {
		chipGroups: [{
			candidates: [
				{ projectedCount: 4, value: 'IT', wouldBeEmpty: false },
				{ projectedCount: 0, value: 'FR', wouldBeEmpty: true },
			],
			ruleId: 'origin',
		}],
		fields: [{ bounds: { max: 90, min: 12 }, fieldKey: 'priceUsd', histogram: { bucketEdges: [], counts: []}, ruleId: 'price' }],
		resultCount: 4,
		resultIndices: new Uint32Array([0]),
		...overrides,
	} as unknown as FilterBundle;
}

describe('wineFieldMeta', () => {
	it('returns the whole field metadata, histogram included', () => {
		// Distinct from the shared `fieldBounds` reader on purpose: wine draws the distribution inside
		// the track, so bounds alone would leave every slider with an empty histogram.
		expect(wineFieldMeta(makeBundle(), 'price')?.histogram).toBeDefined();
	});

	it.each([
		['the bundle has not arrived', null],
		['the field was not queried', makeBundle()],
	])('returns null when %s', (label, bundle) => {
		expect(wineFieldMeta(bundle, label === 'the field was not queried' ? 'abv' : 'price')).toBeNull();
	});
});

describe('deriveOriginSelection', () => {
	/** The specs the real picker produces for {@link TREE} — pre-order, parents before children. */
	const SPECS = buildOriginNodeSpecs(TREE);

	/**
	 * The leaf-id sets the panel would commit for a node selection.
	 *
	 * @remarks
	 * Deliberately reuses the panel's own projection rather than hand-writing the sets: the point of
	 * the inverse is that it undoes what the commit does, and a hand-written fixture could agree with
	 * the inverse while both disagree with the panel.
	 *
	 * @param values - The selected node values.
	 * @returns One leaf-id array per selected node.
	 */
	function commitFor(values: readonly string[]): readonly (readonly string[])[] {
		return SPECS.filter((spec) => values.includes(spec.value)).map((spec) => spec.leafIds);
	}

	it('round-trips a branch selection back to the branch', () => {
		expect(deriveOriginSelection(commitFor(['IT']), SPECS)).toEqual(['IT']);
	});

	it('round-trips a leaf selection back to the leaf', () => {
		expect(deriveOriginSelection(commitFor(['IT-PIE']), SPECS)).toEqual(['IT-PIE']);
	});

	it('round-trips a multi-node selection', () => {
		expect(deriveOriginSelection(commitFor(['IT-PIE', 'FR']), SPECS)).toEqual(['IT-PIE', 'FR']);
	});

	it('keeps a branch with a single child distinct from that child', () => {
		// `FR` has exactly one leaf beneath it. Because a branch's set carries its own id too, `FR` and
		// `FR-BOR` commit different sets, and each reads back as itself — a country selection never
		// renders one level too deep, which would make the next click de-cascade from the wrong node.
		expect(leafSetsAreIdentical(SPECS, 'FR', 'FR-BOR')).toBe(false);
		expect(deriveOriginSelection(commitFor(['FR']), SPECS)).toEqual(['FR']);
		expect(deriveOriginSelection(commitFor(['FR-BOR']), SPECS)).toEqual(['FR-BOR']);
	});

	it('resolves a set two specs share to the shallowest node', () => {
		// Built specs never share a set, but a hand-written list can. First match in pre-order wins,
		// which is the shallowest node — the picker's compact model holds the highest selected node.
		const shared = [
			{ depth: 0, label: 'France', leafIds: ['FR-BOR'], value: 'FR' },
			{ depth: 1, label: 'Bordeaux', leafIds: ['FR-BOR'], value: 'FR-BOR' },
		];

		expect(deriveOriginSelection([['FR-BOR']], shared)).toEqual(['FR']);
	});

	it('is order-independent within a committed set', () => {
		// Nothing preserves member order through JSON and the rule registry.
		const reversed = commitFor(['IT']).map((set) => [...set].reverse());

		expect(deriveOriginSelection(reversed, SPECS)).toEqual(['IT']);
	});

	it('returns nothing before the specs exist', () => {
		// The boot-order hazard. `originSpecs` is empty until the corpus lands, and a seed running early
		// would read a real committed selection as "nothing selected" — then the first click would write
		// a one-node set and silently drop the rest.
		expect(deriveOriginSelection(commitFor(['IT']), [])).toEqual([]);
	});

	it('skips a committed set no spec matches, keeping the ones that do', () => {
		// A hand-written JSON config can name ids this corpus does not contain. The honest rendering is
		// the nodes that exist, not a throw and not an empty picker.
		const mixed = [['NOT-A-REAL-LEAF'], ...commitFor(['IT-PIE'])];

		expect(deriveOriginSelection(mixed, SPECS)).toEqual(['IT-PIE']);
	});

	it('reads an empty rule as an empty selection', () => {
		expect(deriveOriginSelection([], SPECS)).toEqual([]);
	});
});

/**
 * Whether two specs project to the same leaf-id set — i.e. whether the commit is ambiguous between
 * them.
 *
 * @param specs - The flattened specs.
 * @param first - One node value.
 * @param second - The other.
 * @returns `true` when both carry the same leaves.
 */
function leafSetsAreIdentical(
	specs: readonly { readonly leafIds: readonly string[]; readonly value: string }[],
	first: string,
	second: string,
): boolean {
	const key = (value: string): string =>
		[...(specs.find((spec) => spec.value === value)?.leafIds ?? [])].sort().join(' ');

	return key(first) === key(second) && key(first) !== '';
}

/* `bundleHistogramToBuckets`, `chipProjectedCounts` and `chipDisabledSet` are tested in
 * `filter-bundle/bundleReaders.test.ts`, where they live. Nothing about them is wine's: the bundle
 * carries a histogram for every queried field, and the chip readers take the rule id as an argument,
 * which those suites exercise with a second group. */

describe('wineSliderHistogram', () => {
	/**
	 * A bundle whose price and points fields carry the given histograms.
	 *
	 * @param price - The price field's fine histogram.
	 * @param points - The points field's histogram.
	 * @returns A `FilterBundle`-shaped stub.
	 */
	function bundleWith(
		price: FilterBundle['fields'][number]['histogram'],
		points: FilterBundle['fields'][number]['histogram'],
	): FilterBundle {
		return {
			chipGroups: [],
			fields: [
				{ bounds: { max: 100, min: 4 }, fieldKey: 'priceUsd', histogram: price, ruleId: 'price' },
				{ bounds: { max: 100, min: 80 }, fieldKey: 'points', histogram: points, ruleId: 'points' },
			],
		} as unknown as FilterBundle;
	}

	const PRICE_BASELINE = { max: 103, min: 4 };

	/** One fine bucket per whole dollar from $4 to $103, each holding one wine. */
	const FINE_PRICE = {
		bucketEdges: Float64Array.from({ length: 101 }, (_unused, index) => 3.5 + index),
		counts: Uint32Array.from({ length: 100 }, () => 1),
	};

	const POINTS = { bucketEdges: Float64Array.from([80, 90, 100]), counts: Uint32Array.from([3, 5]) };

	it('slices a log-scaled field into equal track slices, losing no wine', () => {
		const bars = wineSliderHistogram(bundleWith(FINE_PRICE, POINTS), 'price', PRICE_BASELINE, 4, 103) ?? [];
		const scale = wineSliderScale('price', PRICE_BASELINE);

		expect(bars.length).toBeGreaterThan(1);
		expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(100);
		expect(scale.toFraction(bars[1]?.bucketMin ?? 0)).toBeCloseTo(1 / bars.length, 9);
		// The dense end gets more bars than its share of the value range.
		expect(bars.filter((bar) => bar.bucketMax <= 30).length).toBeGreaterThan(bars.length / 3);
	});

	it('passes a linear field through unchanged', () => {
		const bars = wineSliderHistogram(bundleWith(FINE_PRICE, POINTS), 'points', { max: 100, min: 80 }, 80, 100);

		expect(bars?.map((bar) => bar.count)).toEqual([3, 5]);
	});

	it('reports no overlay before the bundle arrives', () => {
		expect(wineSliderHistogram(null, 'price', PRICE_BASELINE, 4, 103)).toBeUndefined();
	});
});
