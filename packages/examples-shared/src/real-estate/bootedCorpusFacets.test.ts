/**
 * The real-estate facets every vertical derives from its BOOTED corpus equal the ones derived from the
 * statically imported dataset, value for value.
 *
 * @remarks
 * The location tree and the metro centroids are built from whatever records the engine holds
 * (`engine.core.getSourceData()`, or the records a page handed the engine), so that no page module
 * has to import the dataset itself — the barrel generates 10,000 listings when it is evaluated, and
 * the pages load it on demand. That only keeps behavior identical if the booted corpus derives
 * EXACTLY what the dataset does, in both ways a page can boot:
 *
 * - the bundled fallback, a dynamic `import()` of the same dataset module (tests have no
 *   `/api/real-estate`, so {@link bootRealEstateCore} takes this path here);
 * - the streamed default tier, which arrives as JSON pages from MSW or the API. A JSON round trip
 *   stands in for it: it is the only thing the stream does to a record.
 *
 * "Exactly" is literal. `findMetroLabel` names a geo center by exact coordinate equality, so a
 * centroid one ulp off would turn "≤ 15 mi of Greater Denver" into a pair of decimals in one app and
 * not another. And the tree is carried inside the location rule, so the same selection must encode
 * to the same `?f=` link — the comparison page hands one link to all six apps.
 *
 * @packageDocumentation
 */

import type { BuiltInSerializerName } from '@filter-enginez/url-state-router/serializers';

import { createFilterEngine, geo, hierarchical } from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { describe, expect, it } from 'vitest';

import { createLinkSerializer } from '../url/linkSerializer.js';
import { bootRealEstateCore } from './bootRealEstateCore.js';
import { buildListingLocationTree, buildLocationNodeSpecs, extractListingCoords, extractListingLocationId } from './real-estate-domain/extractors.js';
import { deriveMetroCenters, findMetroLabel } from './real-estate-domain/metroCenters.js';

/** Every format a link can be written in. */
const FORMATS: readonly BuiltInSerializerName[] = ['compact', 'human-readable', 'json-base64'];

/** The reference values: derived straight from the statically imported dataset. */
const eagerTree = buildListingLocationTree(listings);
const eagerMetroCenters = deriveMetroCenters(listings);

/**
 * The corpus a page boots from, by each route a page can take.
 *
 * @returns The two booted corpora, labeled.
 */
async function bootedCorpora(): Promise<readonly (readonly [string, readonly Listing[]])[]> {
	const { core } = await bootRealEstateCore();

	return [
		['the booted engine’s source data', core.getSourceData()],
		['the streamed default tier (a JSON round trip)', JSON.parse(JSON.stringify(listings)) as readonly Listing[]],
	];
}

describe('the reference values are not vacuous', () => {
	it('derive a populated tree and one centroid per metro', () => {
		expect(listings.length).toBeGreaterThan(1000);
		expect((eagerTree.children ?? []).length).toBeGreaterThan(1);
		expect(eagerMetroCenters.length).toBeGreaterThan(1);
	});
});

describe('facets derived from the booted corpus', () => {
	it('come from the same records, in the same order, as the dataset', async () => {
		const { core } = await bootRealEstateCore();

		// Order matters: the centroids are floating-point sums, and a different order could round
		// differently.
		expect(core.getSourceData()).toEqual(listings);
	});

	it('build the same location tree and the same predictive-disable candidates', async () => {
		for (const [, corpus] of await bootedCorpora()) {
			const tree = buildListingLocationTree(corpus);

			expect(tree).toEqual(eagerTree);
			expect(buildLocationNodeSpecs(tree)).toEqual(buildLocationNodeSpecs(eagerTree));
		}
	});

	it('derive bit-identical metro centroids, so every centroid keeps its name', async () => {
		for (const [, corpus] of await bootedCorpora()) {
			const metroCenters = deriveMetroCenters(corpus);

			expect(metroCenters).toEqual(eagerMetroCenters);
			for (const { center, label } of eagerMetroCenters) {
				expect(findMetroLabel(metroCenters, center)).toBe(label);
			}
		}
	});

	it.each(FORMATS)('encode a location and distance selection to the same %s link', async (format) => {
		const serializer = createLinkSerializer(format);
		const [state] = eagerTree.children ?? [];
		const [metro] = eagerMetroCenters;

		// Non-vacuous: there is a state to select and a metro to center on.
		expect(state).toBeDefined();
		expect(metro).toBeDefined();

		/**
		 * Commit a state selection and a 15-mile radius around the first metro, the way the panel's
		 * sections do, and encode the engine's state.
		 *
		 * @param corpus - The records the engine holds and the facets derive from.
		 * @returns The `?f=` value and the indices of the listings that pass.
		 */
		function commitAndEncode(corpus: readonly Listing[]): { readonly link: string; readonly passing: readonly number[] } {
			const engine = createFilterEngine<Listing>({ sourceData: corpus });
			const center = deriveMetroCenters(corpus)[0]?.center ?? { lat: 0, lng: 0 };

			engine.addRule(
				'location',
				hierarchical(extractListingLocationId, { selected: [state?.id ?? ''], tree: buildListingLocationTree(corpus) }),
			);
			engine.addRule('geo-proximity', geo(extractListingCoords, { center, radiusKm: 24.14 }));

			return { link: serializer.encode(engine.exportConfig()), passing: [...engine.getResultIndices()]};
		}

		const eager = commitAndEncode(listings);

		for (const [, corpus] of await bootedCorpora()) {
			expect(commitAndEncode(corpus)).toEqual(eager);
		}
	});
});
