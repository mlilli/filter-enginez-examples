/**
 * One origin selection, and one location selection, one `?f=` value each, in every app.
 *
 * @remarks
 * The comparison page hands one `?f=` to all six apps, so an origin selection (wine) or a location
 * selection (real estate) has to encode to the identical value whichever app made it, and decode to the
 * identical state in whichever app opens it. Every app's origin section writes through
 * `writeOriginSelection` / `commitOriginSelection`, every app's location section through
 * `buildListingLocationRule` / `writeLocationSelection`, and every app's URL layer reads and writes
 * through {@link createLinkSerializer}; `tests/tooling/winePanelFacetParity.test.ts` and
 * `tests/tooling/realEstateLocationParity.test.ts` hold the six to that statically. This suite pins what
 * those shared paths produce, against a real engine:
 *
 * - the exact `?f=` a selection encodes to, in each format;
 * - that it decodes back to the exported state, which filters the same records once loaded;
 * - that a link carrying the same selection as the engine's tree rule (`HierarchicalRule`) decodes to
 *   that same state, re-encodes to that same `?f=`, and filters the same records.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngineConfig, hierarchical } from '@filter-enginez/core';
import { type BuiltInSerializerName, createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { describe, expect, it } from 'vitest';

import { buildListingLocationTree, buildLocationNodeSpecs } from '../real-estate/real-estate-domain/extractors.js';
import { writeLocationSelection } from '../real-estate/real-estate-domain/locationRule.js';
import { buildOriginNodeSpecs } from '../wine/wine-domain/bundle.js';
import { buildWineOriginTree } from '../wine/wine-domain/facets.js';
import { writeOriginSelection } from '../wine/wine-domain/originRule.js';
import { createLinkSerializer } from './linkSerializer.js';

/** Every format a link can be written in. */
const FORMATS: readonly BuiltInSerializerName[] = ['compact', 'human-readable', 'json-base64'];

/** The origin ids of the fixture corpus, at every depth a wine's origin can stop at. */
const ORIGIN_IDS: readonly string[] = [
	'US|Oregon|Willamette Valley|Dundee Hills',
	'US|Oregon|Willamette Valley',
	'US|Oregon|Willamette Valley',
	'US|California|Napa Valley',
	'US|California|Napa Valley',
	'US|California|Napa Valley',
	'France|Bordeaux|Pauillac',
	'France|Burgundy',
	'Italy|Tuscany',
];

/**
 * The fixture corpus: one wine per origin id. Only `originId` is read by anything under test.
 *
 * @returns The wines.
 */
function corpus(): readonly Wine[] {
	return ORIGIN_IDS.map((originId, index) => ({ id: `w${String(index)}`, originId }) as unknown as Wine);
}

/** The selection under test: a whole country, plus one state of another. */
const SELECTION: readonly string[] = ['US|Oregon', 'France'];

/** What {@link SELECTION} encodes to in the human-readable format. */
const PINNED_HUMAN_READABLE
	= 'h~{"version":1,"rules":[{"id":"origin","rule":{"config":{"set":['
		+ '["US|Oregon","US|Oregon|Willamette Valley","US|Oregon|Willamette Valley|Dundee Hills"],'
		+ '["France","France|Bordeaux","France|Bordeaux|Pauillac","France|Burgundy"]'
		+ ']},"field":"originId","type":"InSetofSetsRule"}}]}';

/**
 * Commit {@link SELECTION} the way every app's origin section does, and export the engine's state.
 *
 * @returns The exported config, and the indices of the wines it passes.
 */
function commitThroughTheSharedPath(): { readonly config: FilterEngineConfig; readonly passing: readonly number[] } {
	const wines = corpus();
	const engine = createFilterEngine({ sourceData: wines });

	writeOriginSelection(engine, SELECTION, buildOriginNodeSpecs(buildWineOriginTree(wines)));

	return { config: engine.exportConfig(), passing: [...engine.getResultIndices()]};
}

describe('an origin selection in a ?f= link', () => {
	it('encodes to this exact value, whichever app committed it', () => {
		const { config } = commitThroughTheSharedPath();

		// Pinned literally: a change to the rule type, the set order or the serialization changes the
		// links every app writes, and has to be made here, on purpose.
		expect(createLinkSerializer('human-readable').encode(config)).toBe(PINNED_HUMAN_READABLE);
	});

	it.each(FORMATS)('decodes back to the committed state from the %s format', (format) => {
		const { config } = commitThroughTheSharedPath();
		const serializer = createLinkSerializer(format);

		expect(serializer.decode(serializer.encode(config))).toEqual(config);
	});

	it.each(FORMATS)('reads a %s link carrying the same selection as the engine’s tree rule into that same state', (format) => {
		const wines = corpus();
		const { config, passing } = commitThroughTheSharedPath();
		const treeRuleEngine = createFilterEngine({ sourceData: wines });

		treeRuleEngine.addRule('origin', hierarchical('originId', { selected: [...SELECTION], tree: buildWineOriginTree(wines) }));

		const treeRuleLink = createTaggedSerializer(format).encode(treeRuleEngine.exportConfig());
		const decoded = createLinkSerializer(format).decode(treeRuleLink);

		expect(decoded).toEqual(config);
		expect(createLinkSerializer('human-readable').encode(decoded)).toBe(PINNED_HUMAN_READABLE);
		// And it filters the same wines the tree rule did, once loaded.
		const reloaded = createFilterEngine({ sourceData: wines });

		reloaded.loadConfig(decoded);
		expect([...reloaded.getResultIndices()]).toEqual([...treeRuleEngine.getResultIndices()]);
		expect([...reloaded.getResultIndices()]).toEqual(passing);
		// Non-vacuous: the selection narrows the corpus without emptying it.
		expect(passing.length).toBeGreaterThan(0);
		expect(passing.length).toBeLessThan(wines.length);
	});
});

/** The location paths of the real-estate fixture corpus: `state/metro/neighborhood`, as `Listing.locationId`. */
const LOCATION_IDS: readonly string[] = [
	'CA/San Francisco Bay Area/Mission',
	'CA/San Francisco Bay Area/Sunset',
	'CO/Greater Denver/Highland',
	'CO/Greater Denver/LoDo',
	'WA/Greater Seattle/Ballard',
];

/**
 * The real-estate fixture corpus: one listing per location path. Only the location fields are read.
 *
 * @returns The listings.
 */
function listingCorpus(): readonly Listing[] {
	return LOCATION_IDS.map((locationId, index) => {
		const [state, metroArea, neighborhood] = locationId.split('/');

		return { id: `l${String(index)}`, locationId, metroArea, neighborhood, state } as unknown as Listing;
	});
}

/** The location selection under test: a whole state with a single metro, plus one neighborhood of another. */
const LOCATION_SELECTION: readonly string[] = ['state:CA', 'neighborhood:CO/Greater Denver/LoDo'];

/** What {@link LOCATION_SELECTION} encodes to in the human-readable format. */
const PINNED_LOCATION_HUMAN_READABLE
	= 'h~{"version":1,"rules":[{"id":"location","rule":{"config":{"set":['
		+ '["CA","CA/San Francisco Bay Area","CA/San Francisco Bay Area/Mission","CA/San Francisco Bay Area/Sunset"],'
		+ '["CO/Greater Denver/LoDo"]'
		+ ']},"field":"locationId","type":"InSetofSetsRule"}}]}';

/**
 * Commit {@link LOCATION_SELECTION} the way every app's location section does, and export the state.
 *
 * @returns The exported config, and the indices of the listings it passes.
 */
function commitLocationThroughTheSharedPath(): { readonly config: FilterEngineConfig; readonly passing: readonly number[] } {
	const listings = listingCorpus();
	const engine = createFilterEngine({ sourceData: listings });

	writeLocationSelection(engine, LOCATION_SELECTION, buildLocationNodeSpecs(buildListingLocationTree(listings)));

	return { config: engine.exportConfig(), passing: [...engine.getResultIndices()]};
}

/**
 * Load a decoded config into a fresh engine over the fixture listings.
 *
 * @param config - The decoded config.
 * @returns The indices of the listings it passes.
 */
function passingAfterLoading(config: FilterEngineConfig): readonly number[] {
	const reloaded = createFilterEngine({ sourceData: listingCorpus() });

	reloaded.loadConfig(config);

	return [...reloaded.getResultIndices()];
}

describe('a location selection in a ?f= link', () => {
	it('encodes to this exact value, whichever app committed it', () => {
		const { config, passing } = commitLocationThroughTheSharedPath();

		expect(createLinkSerializer('human-readable').encode(config)).toBe(PINNED_LOCATION_HUMAN_READABLE);
		// Non-vacuous: CA's two listings plus LoDo, out of five.
		expect(passing).toEqual([0, 1, 3]);
	});

	it.each(FORMATS)('decodes from the %s format back to a state that filters the same listings', (format) => {
		const { config, passing } = commitLocationThroughTheSharedPath();
		const serializer = createLinkSerializer(format);
		const decoded = serializer.decode(serializer.encode(config));

		expect(decoded).toEqual(config);
		// The round trip a page reload or a shared link takes. A rule over a function field decodes into a
		// rule that tests nothing and passes no listing; this one has to pass the same three.
		expect(passingAfterLoading(decoded)).toEqual(passing);
	});

	it.each(FORMATS)('reads a %s link carrying the same selection as the engine’s tree rule into that same state', (format) => {
		const listings = listingCorpus();
		const { config, passing } = commitLocationThroughTheSharedPath();
		const treeRuleEngine = createFilterEngine({ sourceData: listings });

		// The tree rule over a function field: how a link carries location when its field was an
		// extractor from `Listing` to a tree id. It travels as `"field":"<function>"`.
		treeRuleEngine.addRule('location', hierarchical((item: unknown) => `neighborhood:${(item as Listing).locationId}`, {
			selected: [...LOCATION_SELECTION],
			tree: buildListingLocationTree(listings),
		}));

		const treeRuleConfig = treeRuleEngine.exportConfig();

		expect(treeRuleConfig.rules[0]?.rule.field).toBe('<function>');

		const treeRuleLink = createTaggedSerializer(format).encode(treeRuleConfig);
		const decoded = createLinkSerializer(format).decode(treeRuleLink);

		expect(decoded).toEqual(config);
		expect(createLinkSerializer('human-readable').encode(decoded)).toBe(PINNED_LOCATION_HUMAN_READABLE);
		expect([...treeRuleEngine.getResultIndices()]).toEqual(passing);
		expect(passingAfterLoading(decoded)).toEqual(passing);
	});
});
