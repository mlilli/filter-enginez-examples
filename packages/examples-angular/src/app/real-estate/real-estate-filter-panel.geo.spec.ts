/**
 * The real-estate panel renders its Distance section in its first render, with the rest of the panel.
 *
 * @remarks
 * The section sat in a `@defer (on immediate)` block, which inserted it a tick after the other
 * thirteen sections and moved the ones below it down 140px: a layout shift of 0.011 at a desktop
 * width, where the React and vanilla apps, which render it at once, shift nothing. Leaflet stays out
 * of the first load either way: the section's map imports it, and the map renders only once the
 * distance filter is on, which this render never does.
 *
 * Its own file because `real-estate-filter-panel.spec.ts` is at the line limit. Over a slice of the
 * real listings, booted the way the route boots them.
 *
 * @packageDocumentation
 */

import { TestBed } from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { buildRealEstateEngine } from '@filter-enginez/examples-shared/real-estate-core';
import { listings } from '@filter-enginez/mock-data/real-estate';
import { createEngineBusyStream, createRxJsEngine } from '@filter-enginez/reactive-rxjs';
import { describe, expect, it } from 'vitest';

import { deriveRealEstateFacets, REAL_ESTATE_FACETS } from './real-estate-facets.js';
import { RealEstateFilterPanelComponent } from './real-estate-filter-panel.component.js';

describe('RealEstateFilterPanelComponent Distance section', () => {
	it('is in the first render, with its filter off and so no map', async () => {
		const corpus = listings.slice(0, 40);
		const busy = createEngineBusyStream();

		await TestBed.configureTestingModule({
			imports: [RealEstateFilterPanelComponent],
			providers: [
				provideFilterEngine(createRxJsEngine(buildRealEstateEngine(corpus))),
				provideEngineBusy(busy),
				{ provide: REAL_ESTATE_FACETS, useValue: deriveRealEstateFacets(corpus) },
			],
		}).compileComponents();

		const fixture = TestBed.createComponent(RealEstateFilterPanelComponent);

		fixture.componentRef.setInput('isPanelVisible', true);
		fixture.detectChanges();

		const panel = fixture.nativeElement as HTMLElement;

		expect(panel.querySelector('fe-geo-radius-section .fe-geo')).not.toBeNull();
		expect(panel.querySelector('fe-leaflet-radius-map')).toBeNull();

		busy.dispose();
	});
});
