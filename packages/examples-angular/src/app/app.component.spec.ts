/**
 * Tests that the root component keeps the document head on the route the router shows.
 *
 * @remarks
 * `examples-shared/page-meta` decides each route's title, description and canonical URL and has its own
 * suite; this pins that the root component applies them after every navigation, the not-found route's
 * `noindex` included, and reads the path without its query.
 *
 * @packageDocumentation
 */

import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppComponent } from './app.component.js';

/** A route with nothing to render. */
@Component({ selector: 'fe-blank', template: '' })
class BlankComponent {}

beforeEach(() => {
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([
				{ component: BlankComponent, path: '', pathMatch: 'full' },
				{ component: BlankComponent, path: 'wine' },
				{ component: BlankComponent, path: '**' },
			]),
		],
	});
	TestBed.createComponent(AppComponent);
});

afterEach(() => {
	document.head.querySelector('link[rel="canonical"]')?.remove();
	document.head.querySelector('meta[name="robots"]')?.remove();
});

describe('<fe-root>', () => {
	it('writes each route’s title and canonical URL after the navigation, ignoring the query', async () => {
		await TestBed.inject(Router).navigateByUrl('/wine?f=h~%7B%7D');

		expect(document.title).toBe(verticalPageMeta('angular', '/wine').title);
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://angular.filterenginez.com/wine');
	});

	it('marks the not-found route noindex, with no canonical', async () => {
		await TestBed.inject(Router).navigateByUrl('/no-such-route');

		expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
	});
});
