/**
 * Tests for `<fe-landing-page>` — the app's dataset hub.
 *
 * @remarks
 * Scoped to the hub's header: the brand component's own spec owns the brand's links and names, so
 * this pins only that the hub carries it, in the compact app header, naming itself as the current
 * page. The routes are this app's hub and a catch-all, navigated through a real `Router` by
 * `RouterTestingHarness`, because the hub link's `aria-current` comes from the router's state.
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appHeaderSubtitle, BRAND_NAV_LABEL, HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { LandingPageComponent } from './landing-page.component.js';
import { NotFoundPageComponent } from './not-found-page.component.js';

/** The rendered hub page. */
let page: HTMLElement;

beforeEach(async () => {
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([
				{ component: LandingPageComponent, path: '', pathMatch: 'full' },
				{ component: NotFoundPageComponent, path: '**' },
			]),
		],
	});

	const harness = await RouterTestingHarness.create();

	await harness.navigateByUrl('/', LandingPageComponent);
	page = harness.routeNativeElement as HTMLElement;
});

describe('<fe-landing-page>', () => {
	it('opens with the compact app header carrying the brand', () => {
		const header = page.firstElementChild;

		expect(header?.tagName).toBe('HEADER');
		expect(header?.className).toBe('fe-books-app__header');
		expect(header?.querySelector(`nav.fe-books-app__brand[aria-label="${BRAND_NAV_LABEL}"]`)).not.toBeNull();
	});

	it('names itself the dataset hub, and marks the hub link as the current page', () => {
		expect(page.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'angular').text,
		);
		expect(page.querySelector('.fe-books-app__hub')?.getAttribute('aria-current')).toBe('page');
	});
});
