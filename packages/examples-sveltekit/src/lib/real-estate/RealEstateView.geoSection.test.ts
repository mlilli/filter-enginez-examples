/**
 * The real-estate view renders its Distance section in its first render, with the rest of the panel.
 *
 * @remarks
 * The section used to be imported from `onMount` and passed down once the import resolved, which
 * inserted it a frame after the panel's first paint and moved every section below it down 140px: a
 * layout shift of 0.011 at a desktop width, where the React and vanilla apps, which import it, shift
 * nothing. Leaflet stays out of the first load either way: the section's map imports it, and the map
 * renders only once the distance filter is on, which this render never does.
 *
 * @packageDocumentation
 */

import { createFilterEngine } from '@filter-enginez/core';
import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	deriveMetroCenters,
	deriveRealEstateVocabularies,
	SLIDER_CLAMPS,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import RealEstateView from './RealEstateView.svelte';

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
});

describe('<RealEstateView> Distance section', () => {
	it('is in the first render, with its filter off and so no map', () => {
		const corpus: readonly Listing[] = listings.slice(0, 40);
		const engine = createSignalsEngine(createFilterEngine<Listing>({ sourceData: [...corpus]}));
		const locationTree = buildListingLocationTree(corpus);
		const { container } = render(RealEstateView, {
			props: {
				baselines: SLIDER_CLAMPS,
				engine,
				locationSpecs: buildLocationNodeSpecs(locationTree),
				locationTree,
				metroCenters: deriveMetroCenters(corpus),
				vocabularies: deriveRealEstateVocabularies(corpus),
			},
		});

		expect(container.querySelector('.fe-geo')).not.toBeNull();
		expect(container.querySelector('.fe-geo__map')).toBeNull();

		engine.dispose();
	});
});
