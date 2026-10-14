/**
 * Tests for `<fe-not-found-page>` — the "filtered to zero" 404.
 *
 * @remarks
 * Scoped to the page's header: the brand component's own spec owns the brand's links and names, so
 * this pins only that the 404 carries it, in the compact app header, with the hub link offered and
 * not marked current. The page renders through a real `Router`'s catch-all, the way an unmatched URL
 * reaches it.
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

/** The rendered 404 page. */
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

	await harness.navigateByUrl('/no-such-route', NotFoundPageComponent);
	page = harness.routeNativeElement as HTMLElement;
});

describe('<fe-not-found-page>', () => {
	it('opens with the compact app header carrying the brand', () => {
		const header = page.firstElementChild;

		expect(header?.tagName).toBe('HEADER');
		expect(header?.className).toBe('fe-books-app__header');
		expect(header?.querySelector(`nav.fe-books-app__brand[aria-label="${BRAND_NAV_LABEL}"]`)).not.toBeNull();
	});

	it('names itself in the subtitle, and offers the hub without marking it current', () => {
		const hub = page.querySelector('.fe-books-app__hub');

		expect(page.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			appHeaderSubtitle(HEADER_PAGE_LABELS.notFound, 'angular').text,
		);
		expect(hub?.getAttribute('href')).toBe('/');
		expect(hub?.hasAttribute('aria-current')).toBe(false);
	});
});
