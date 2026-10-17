/**
 * Tests that the root component keeps the document head on the route the router shows, and draws a
 * booting route's caption until that route can render.
 *
 * @remarks
 * `examples-shared/page-meta` decides each route's title, description and canonical URL and has its own
 * suite; this pins that the root component applies them after every navigation, the not-found route's
 * `noindex` included, and reads the path without its query.
 *
 * The boot caption cases drive a route whose resolver is held open by the test, which is the state a
 * direct visit to `/books` is in while its engine downloads and boots: recognized, not yet activated.
 * They pin the three things the caption must do — appear while the outlet is empty, leave once the
 * page activates, never appear beside a page already on screen — plus the routes that name none.
 *
 * @packageDocumentation
 */

import { Component, provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppComponent } from './app.component.js';
import { routes as appRoutes, ROUTE_BOOT_CAPTION_KEY } from './app.routes.js';

/** A route with nothing to render. */
@Component({ selector: 'fe-blank', template: '' })
class BlankComponent {}

/** A page that marks itself, so a test can see which route is on screen. */
@Component({ selector: 'fe-booted', template: '<p class="booted-page">booted</p>' })
class BootedComponent {}

/** The caption the booting test route names. */
const TEST_CAPTION = 'Booting the test engine…';

/** Releases the booting route's resolver; replaced for every test. */
let releaseBoot: () => void = () => undefined;

/** Rejects the failing route's resolver; replaced for every test. */
let failBoot: () => void = () => undefined;

let fixture: ComponentFixture<AppComponent>;

beforeEach(() => {
	TestBed.configureTestingModule({
		providers: [
			provideZonelessChangeDetection(),
			provideRouter([
				{ component: BlankComponent, path: '', pathMatch: 'full' },
				{ component: BlankComponent, path: 'wine' },
				{
					component: BootedComponent,
					data: { [ROUTE_BOOT_CAPTION_KEY]: TEST_CAPTION },
					path: 'booting',
					resolve: {
						booted: async () =>
							new Promise<boolean>((resolve) => {
								releaseBoot = () => {
									resolve(true);
								};
							}),
					},
				},
				{
					component: BootedComponent,
					data: { [ROUTE_BOOT_CAPTION_KEY]: TEST_CAPTION },
					path: 'failing',
					resolve: {
						booted: async () =>
							new Promise<boolean>((_resolve, reject) => {
								failBoot = () => {
									reject(new Error('boot failed'));
								};
							}),
					},
				},
				{ component: BlankComponent, path: '**' },
			]),
		],
	});
	fixture = TestBed.createComponent(AppComponent);
});

afterEach(() => {
	document.head.querySelector('link[rel="canonical"]')?.remove();
	document.head.querySelector('meta[name="robots"]')?.remove();
});

/**
 * Let the router run as far as it can without the held resolver, then render.
 *
 * @remarks
 * A few macrotask turns and an explicit render rather than `fixture.whenStable()`: an unfinished
 * navigation is a pending task, so `whenStable()` would wait on the very resolver these cases hold open.
 *
 * @returns Once the router's pending work has run and the view reflects it.
 */
async function settle(): Promise<void> {
	for (let turn = 0; turn < 5; turn += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	fixture.detectChanges();
}

/**
 * The boot caption on screen, if any.
 *
 * @returns Its text, or `null` when none is drawn.
 */
function captionText(): string | null {
	const element = (fixture.nativeElement as HTMLElement).querySelector('.fe-boot-caption');

	return element === null ? null : element.textContent.trim();
}

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

describe('<fe-root> boot caption', () => {
	it('draws the route’s caption while its resolver works on an empty outlet, then gives way to the page', async () => {
		const navigation = TestBed.inject(Router).navigateByUrl('/booting');

		await settle();

		expect(captionText()).toBe(TEST_CAPTION);
		expect((fixture.nativeElement as HTMLElement).querySelector('.booted-page')).toBeNull();

		releaseBoot();
		await navigation;
		await settle();

		expect(captionText()).toBeNull();
		expect((fixture.nativeElement as HTMLElement).querySelector('.booted-page')).not.toBeNull();
	});

	it('renders the caption with the shared inline caption classes', async () => {
		void TestBed.inject(Router).navigateByUrl('/booting');
		await settle();

		const element = (fixture.nativeElement as HTMLElement).querySelector('p.fe-boot-caption');

		expect(element?.classList.contains('fe-boot-caption--inline')).toBe(true);
		releaseBoot();
	});

	it('never draws the caption beside a page already on screen', async () => {
		const router = TestBed.inject(Router);

		await router.navigateByUrl('/wine');
		await settle();

		const navigation = router.navigateByUrl('/booting');

		await settle();

		expect(captionText()).toBeNull();

		releaseBoot();
		await navigation;
	});

	it('clears the caption when the boot fails and the navigation errors', async () => {
		const navigation = TestBed.inject(Router).navigateByUrl('/failing');

		await settle();

		expect(captionText()).toBe(TEST_CAPTION);

		failBoot();
		await expect(navigation).rejects.toThrow('boot failed');
		await settle();

		expect(captionText()).toBeNull();
	});

	it('clears the caption when a newer navigation supersedes it', async () => {
		const router = TestBed.inject(Router);

		void router.navigateByUrl('/booting');
		await settle();

		expect(captionText()).toBe(TEST_CAPTION);

		await router.navigateByUrl('/wine');
		await settle();

		expect(captionText()).toBeNull();
	});

	it('draws nothing for a route that names no caption', async () => {
		await TestBed.inject(Router).navigateByUrl('/wine');
		await settle();

		expect(captionText()).toBeNull();
	});
});

describe('the app routes’ boot captions', () => {
	/**
	 * The static boot caption a top-level route names.
	 *
	 * @param path - The route's path.
	 * @returns Its caption, or `undefined`.
	 */
	function captionFor(path: string): unknown {
		return appRoutes.find((route) => route.path === path)?.data?.[ROUTE_BOOT_CAPTION_KEY];
	}

	it('names one for each route that boots an engine in a resolver', () => {
		expect(captionFor('books')).toBe('Booting the books engine…');
		expect(captionFor('real-estate')).toBe('Booting the real-estate engine…');
	});

	it('names none for the landing hub, which renders at once', () => {
		expect(captionFor('')).toBeUndefined();
	});
});
