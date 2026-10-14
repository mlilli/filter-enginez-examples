/**
 * Tests for `<nav fe-app-header-brand>` — the header brand every page of this app carries.
 *
 * @remarks
 * The same assertions as the vanilla app's `shell/appHeader.test.ts`, the reference rendering of the
 * shared markup, so the two apps are held to one contract.
 *
 * jsdom serves from a loopback host, so the two links to the landing site resolve to the local site
 * server; the expected URLs come from the shared resolver, whose own suite pins the literals.
 *
 * ### A real router over two routes
 *
 * The hub link's `aria-current` comes from `routerLinkActive`, which reads the router's state, not
 * the address bar. So these navigate a real `Router` between the hub and a dataset route rather than
 * stubbing it — a stub would let the component and the test agree on a state the router never
 * reaches.
 *
 * @packageDocumentation
 */

import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	appHeaderSubtitle,
	appHubLabel,
	BRAND_NAV_LABEL,
	HEADER_PAGE_LABELS,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { type EngineTier } from '@filter-enginez/examples-shared/verticals';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppHeaderBrandComponent } from './app-header-brand.component.js';

/** The landing-site links for the test page's location. */
const LINKS = appHeaderLinks(window.location);

/** A routed page with nothing on it — the routes exist only to put the router somewhere. */
@Component({ template: '' })
class BlankPageComponent {}

/**
 * Host rendering the brand from bindings, so one host serves both the dataset-route shape (a dataset
 * and a tier) and the hub's (a page label alone).
 */
@Component({
	imports: [AppHeaderBrandComponent],
	template: `<nav fe-app-header-brand [page]="page()" [tier]="tier()"></nav>`,
})
class HostComponent {
	/** The page the brand names. */
	public readonly page = signal<string>('Wine');

	/** The engine tier the brand names, if any. */
	public readonly tier = signal<EngineTier | undefined>('worker');
}

let router: Router;

beforeEach(() => {
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([
				{ component: BlankPageComponent, path: '' },
				{ component: BlankPageComponent, path: 'wine' },
			]),
		],
	});

	router = TestBed.inject(Router);
});

/**
 * Navigate to `url`, then render the brand for `page` and `tier` and let it settle.
 *
 * @param url - Where the router should be when the brand renders.
 * @param page - The page the brand names.
 * @param tier - The engine tier the brand names, if any.
 * @returns The rendered brand `<nav>`.
 */
async function renderBrandAt(url: string, page: string, tier?: EngineTier): Promise<HTMLElement> {
	await router.navigateByUrl(url);

	const fixture: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);

	fixture.componentInstance.page.set(page);
	fixture.componentInstance.tier.set(tier);
	await fixture.whenStable();
	fixture.detectChanges();

	const brand = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('nav');

	expect(brand, 'the host rendered no <nav> at all').not.toBeNull();

	return brand as HTMLElement;
}

/** Render the brand as the wine route does, on the wine route. */
async function renderWineBrand(): Promise<HTMLElement> {
	return renderBrandAt('/wine', 'Wine', 'worker');
}

describe('<nav fe-app-header-brand>', () => {
	it('is the named navigation landmark itself, with no element wrapped around its links', async () => {
		const brand = await renderWineBrand();

		expect(brand.className).toBe('fe-books-app__brand');
		expect(brand.getAttribute('aria-label')).toBe(BRAND_NAV_LABEL);
		expect([...brand.children].map((child) => child.className)).toEqual([
			'fe-books-app__home',
			'fe-books-app__wordmark',
			'fe-books-app__nav-link fe-books-app__all-demos',
		]);
	});

	it('links the logomark home by name, and the wordmark home for the pointer only', async () => {
		const brand = await renderWineBrand();
		const home = brand.querySelector(`a[aria-label="${SITE_HOME_LABEL}"]`);
		const wordmark = brand.querySelector('.fe-books-app__name');

		expect(home?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(home?.querySelector('img')?.getAttribute('src')).toBe('/mark.svg');
		expect(home?.querySelector('img')?.getAttribute('alt')).toBe('');
		expect(wordmark?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(wordmark?.getAttribute('tabindex')).toBe('-1');
		expect(wordmark?.getAttribute('aria-hidden')).toBe('true');
		expect(wordmark?.textContent).toBe('Filter EngineZ');
	});

	it('links the app name in the subtitle to the hub, keeping the subtitle text whole', async () => {
		const brand = await renderWineBrand();
		const hub = brand.querySelector('.fe-books-app__hub');

		expect(hub?.getAttribute('href')).toBe('/');
		expect(hub?.getAttribute('aria-label')).toBe(appHubLabel('angular'));
		expect(hub?.textContent).toBe('Angular');
		expect(hub?.hasAttribute('aria-current')).toBe(false);
		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			appHeaderSubtitle('Wine', 'angular', 'worker').text,
		);
	});

	it('marks the hub link as the current page on the hub', async () => {
		const brand = await renderBrandAt('/', HEADER_PAGE_LABELS.hub);

		expect(brand.querySelector('.fe-books-app__hub')?.getAttribute('aria-current')).toBe('page');
		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'angular').text,
		);
	});

	it('offers "All demos" on the landing page’s demo list', async () => {
		const link = (await renderWineBrand()).querySelector('.fe-books-app__all-demos');

		expect(link?.textContent).toBe(ALL_DEMOS_LABEL);
		expect(link?.getAttribute('href')).toBe(LINKS.allDemosHref);
	});
});
