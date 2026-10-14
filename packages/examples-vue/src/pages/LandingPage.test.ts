/**
 * Render test for the Vue landing hub — parity with the React/Svelte landing. Confirms the app
 * header, the hero wordmark + tagline, and one linked card per dataset route all mount over a test
 * router.
 */

import { appHeaderLinks, SITE_HOME_LABEL } from '@filter-enginez/examples-shared/app-header-core';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { landingDatasets } from '../landing.js';
import LandingPage from './LandingPage.vue';

/** A router with the routes the landing links to so `<RouterLink>` resolves. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: { template: '<div />' }, path: '/books' },
		],
	});
}

async function mountLanding() {
	const router = makeRouter();
	// Mount first (installs the router plugin, which kicks off the memory-history initial navigation),
	// THEN await `isReady` — awaiting before install would hang forever.
	const wrapper = mount(LandingPage, { global: { plugins: [router]}});

	await router.isReady();

	return wrapper;
}

describe('Vue LandingPage', () => {
	it('carries the app header, with the way home to the landing site and the hub marked current', async () => {
		const wrapper = await mountLanding();

		await flushPromises();

		const header = wrapper.find('header.fe-books-app__header');

		expect(header.find(`a[aria-label="${SITE_HOME_LABEL}"]`).attributes('href')).toBe(
			appHeaderLinks(window.location).homeHref,
		);
		expect(header.find('.fe-books-app__subtitle').element.textContent).toBe('Datasets · Vue');
		expect(header.find('.fe-books-app__hub').attributes('aria-current')).toBe('page');
	});

	it('renders the hero wordmark and tagline', async () => {
		const wrapper = await mountLanding();

		await flushPromises();

		expect(wrapper.find('.fe-landing__wordmark').text()).toBe('Filter EngineZ');
		expect(wrapper.text()).toContain('This is the Vue vertical.');
	});

	it('renders one linked card per dataset route the app serves', async () => {
		const wrapper = await mountLanding();

		await flushPromises();

		// Counted from `landingDatasets` rather than written as literals, so a new route changes the
		// expectation and the rendering together.
		expect(wrapper.findAll('.fe-landing__card')).toHaveLength(landingDatasets.length);
		expect(wrapper.findAll('.fe-landing__card--live')).toHaveLength(landingDatasets.length);

		// Every card links to its own route.
		expect(wrapper.findAll('.fe-landing__card--live').map((card) => card.attributes('href'))).toEqual(
			landingDatasets.map((dataset) => dataset.href),
		);
	});
});
