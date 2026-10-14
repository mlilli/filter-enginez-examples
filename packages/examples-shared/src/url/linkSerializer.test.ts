/**
 * One origin selection, one `?f=` value, in every app.
 *
 * @remarks
 * The comparison page hands one `?f=` to all six apps, so an origin selection has to encode to the
 * identical value whichever app made it, and decode to the identical state in whichever app opens it.
 * Every app's origin section writes through `writeOriginSelection` / `commitOriginSelection`, and
 * every app's URL layer reads and writes through {@link createLinkSerializer};
 * `tests/tooling/winePanelFacetParity.test.ts` holds the six to that statically. This suite pins what
 * those two shared paths produce, against a real engine:
 *
 * - the exact `?f=` an origin selection encodes to, in each format;
 * - that it decodes back to the exported state;
 * - that a link carrying the same selection as the engine's tree rule (`HierarchicalRule`) decodes to
 *   that same state, re-encodes to that same `?f=`, and filters the same wines.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngineConfig, hierarchical } from '@filter-enginez/core';
import { type BuiltInSerializerName, createTaggedSerializer } from '@filter-enginez/url-state-router/serializers';
import { describe, expect, it } from 'vitest';

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
