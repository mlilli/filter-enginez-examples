/**
 * Tests for `<AppHeaderBrand>` — the brand every header of the Vue app carries, at parity with the
 * vanilla `appHeader.test.ts`.
 *
 * @remarks
 * jsdom serves from a loopback host, so the two links to the landing site resolve to the local site
 * server; the expected URLs come from the shared resolver, whose own suite pins the literals.
 *
 * The hub link's `aria-current` is the router's, not this component's, so it is asserted over a real
 * memory-history router at three locations: the hub itself, a dataset route, and an unmatched path the
 * catch-all answers, where a prefix match on `/` would wrongly mark the hub current.
 *
 * @packageDocumentation
 */

import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	BRAND_NAV_LABEL,
	HEADER_PAGE_LABELS,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import AppHeaderBrand from './AppHeaderBrand.vue';

/** The landing-site links for the test page's location. */
const LINKS = appHeaderLinks(window.location);

/** A router with the hub, one dataset route and the catch-all, like the app's own. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: { template: '<div />' }, path: '/wine' },
			{ component: { template: '<div />' }, path: '/:pathMatch(.*)*' },
		],
	});
}

/**
 * Mount the brand with the router at `path`.
 *
 * @param path - The location the router is at when the brand renders.
 * @param props - The brand's props.
 * @returns The mounted brand.
 */
async function mountBrand(
	path: string,
	props: InstanceType<typeof AppHeaderBrand>['$props'],
): Promise<VueWrapper> {
	const router = makeRouter();

	await router.push(path);

	const wrapper = mount(AppHeaderBrand, { global: { plugins: [router]}, props });

	await router.isReady();
	await flushPromises();

	return wrapper;
}

describe('<AppHeaderBrand>', () => {
	it('is a named navigation landmark', async () => {
		const wrapper = await mountBrand('/wine', { page: 'Wine', tier: 'worker' });
		const nav = wrapper.find('nav');

		expect(nav.classes()).toContain('fe-books-app__brand');
		expect(nav.attributes('aria-label')).toBe(BRAND_NAV_LABEL);
	});

	it('links the logomark home by name, and the wordmark home for the pointer only', async () => {
		const wrapper = await mountBrand('/wine', { page: 'Wine', tier: 'worker' });
		const home = wrapper.find(`a[aria-label="${SITE_HOME_LABEL}"]`);
		const wordmark = wrapper.find('.fe-books-app__name');

		expect(home.classes()).toContain('fe-books-app__home');
		expect(home.attributes('href')).toBe(LINKS.homeHref);
		// Decorative: the link's own name says where it goes. (`src` is not asserted — the Vue SFC
		// compiler rewrites the static `/mark.svg` into an asset reference the test transform inlines.)
		expect(home.find('img').classes()).toContain('fe-books-app__mark');
		expect(home.find('img').attributes('alt')).toBe('');
		expect(wordmark.element.tagName).toBe('A');
		expect(wordmark.attributes('href')).toBe(LINKS.homeHref);
		expect(wordmark.attributes('tabindex')).toBe('-1');
		expect(wordmark.attributes('aria-hidden')).toBe('true');
	});

	it('links the app name in the subtitle to the hub, keeping the subtitle text whole', async () => {
		const wrapper = await mountBrand('/wine', { page: 'Wine', tier: 'worker' });
		const hub = wrapper.find('.fe-books-app__hub');

		expect(hub.attributes('href')).toBe('/');
		expect(hub.attributes('aria-label')).toBe('Vue dataset hub');
		expect(hub.text()).toBe('Vue');
		expect(hub.attributes('aria-current')).toBeUndefined();
		// `element.textContent`, not `text()`: the wrapper trims, and the point is that the three parts
		// join with no whitespace of their own.
		expect(wrapper.find('.fe-books-app__subtitle').element.textContent).toBe('Wine · Vue (worker)');
	});

	it('marks the hub link as the current page on the hub', async () => {
		const wrapper = await mountBrand('/', { page: HEADER_PAGE_LABELS.hub });

		expect(wrapper.find('.fe-books-app__hub').attributes('aria-current')).toBe('page');
		expect(wrapper.find('.fe-books-app__subtitle').element.textContent).toBe('Datasets · Vue');
	});

	it('does not mark the hub link current on a path the catch-all answers', async () => {
		const wrapper = await mountBrand('/no/such/page', { page: HEADER_PAGE_LABELS.notFound });

		expect(wrapper.find('.fe-books-app__hub').attributes('aria-current')).toBeUndefined();
	});

	it('offers "All demos" on the landing page’s demo list', async () => {
		const wrapper = await mountBrand('/wine', { page: 'Wine', tier: 'worker' });
		const link = wrapper.find('.fe-books-app__all-demos');

		expect(link.classes()).toContain('fe-books-app__nav-link');
		expect(link.text()).toBe(ALL_DEMOS_LABEL);
		expect(link.attributes('href')).toBe(LINKS.allDemosHref);
	});
});
