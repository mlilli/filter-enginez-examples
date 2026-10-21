/**
 * The real-estate results header's "Clear all" is one engine action.
 *
 * @remarks
 * Every dataset in every app clears through the shared `clearAllFilters(engine, markUserAction)`:
 * the busy mark, then ONE `core.clearRules()`. So a rule under an id no panel lists (a hand-edited
 * `?f=` link) is cleared too, the devtools log records one `RULES_CLEARED`, and one Undo brings the
 * whole state back. A loop of `removeRule` calls over a hard-coded id list would miss the first and
 * split the other two into one step per rule.
 *
 * Over a slice of the real listings, booted the way the route boots them, so the view renders every
 * section it renders in the app.
 *
 * @packageDocumentation
 */

import { createFilterEngine, inSet, range } from '@filter-enginez/core';
import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	deriveMetroCenters,
	deriveRealEstateVocabularies,
	SLIDER_CLAMPS,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureCurrentVersion } from './realEstateBusy.js';
import RealEstateView from './RealEstateView.svelte';

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	vi.restoreAllMocks();
});

describe('<RealEstateView> Clear all', () => {
	it('drops every rule with one clearRules, after the busy mark', async () => {
		const corpus: readonly Listing[] = listings.slice(0, 40);
		const engine = createSignalsEngine(createFilterEngine<Listing>({ sourceData: [...corpus]}));
		const locationTree = buildListingLocationTree(corpus);

		engine.core.addRule('status', inSet<string>('status', ['for-sale']));
		engine.core.addRule('price', range('priceUsd', { max: 2_000_000, min: 100_000 }));
		// A rule no panel section writes: Clear all must drop it too.
		engine.core.addRule('hand-edited', range('bedrooms', { max: 9, min: 0 }));

		const { getByRole } = render(RealEstateView, {
			props: {
				baselines: SLIDER_CLAMPS,
				engine,
				locationSpecs: buildLocationNodeSpecs(locationTree),
				locationTree,
				metroCenters: deriveMetroCenters(corpus),
				vocabularies: deriveRealEstateVocabularies(corpus),
			},
		});
		const clearRules = vi.spyOn(engine.core, 'clearRules');
		const removeRule = vi.spyOn(engine.core, 'removeRule');
		const versionBefore = captureCurrentVersion();

		await fireEvent.click(getByRole('button', { name: 'Clear all' }));

		expect(clearRules).toHaveBeenCalledOnce();
		expect(removeRule).not.toHaveBeenCalled();
		expect(engine.core.getRules().size).toBe(0);
		expect(captureCurrentVersion()).toBeGreaterThan(versionBefore);

		engine.dispose();
	});
});
