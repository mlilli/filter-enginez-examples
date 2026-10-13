/**
 * Render test for the Vue landing hub — parity with the React/Svelte landing. Confirms the hero
 * wordmark + tagline, the "How the engine works" CTA, and one linked card per dataset route all mount
 * over a test router.
 */

import { howItWorksUrl } from '@filter-enginez/examples-shared/compare-core';
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
	it('renders the hero wordmark, tagline, and the "how it works" CTA', async () => {
		const wrapper = await mountLanding();

		await flushPromises();

		expect(wrapper.find('.fe-landing__wordmark').text()).toBe('Filter EngineZ');
		expect(wrapper.text()).toContain('This is the Vue vertical.');
		expect(wrapper.find('.fe-landing__about').text()).toContain('How the engine works');
	});

	it('links "How the engine works" to the landing site, resolved for this deployment layout', async () => {
		const wrapper = await mountLanding();

		await flushPromises();

		// jsdom serves from a loopback host, so this is the development layout: the local site server.
		expect(wrapper.find('.fe-landing__about').attributes('href')).toBe(howItWorksUrl(window.location, 'dev'));
		expect(wrapper.find('.fe-landing__about').attributes('href')).toBe('http://127.0.0.1:5181/how-it-works');
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
