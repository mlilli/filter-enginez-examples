/**
 * Render test for the Vue 404 page — parity with the shared `notfound` core + the React/Svelte
 * verticals.
 *
 * @remarks
 * The copy + chip vocabulary + toggle logic are framework-free (covered by `examples-shared`'s own unit
 * tests); this proves the Vue shell renders them and that toggling a dead-end chip presses it WITHOUT
 * moving the count off zero — the whole gag of the page — and that the app header every page carries
 * sits above it. Mounts over a memory router (the page uses `useRoute` for the offending path +
 * `<RouterLink>` for the CTA and the header's hub link).
 */

import { appHeaderLinks, SITE_HOME_LABEL } from '@filter-enginez/examples-shared/app-header-core';
import { NOT_FOUND_CHIPS, NOT_FOUND_COPY } from '@filter-enginez/examples-shared/notfound-core';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import NotFoundPage from './NotFoundPage.vue';

/** A router with a catch-all so mounting at an unknown path resolves to the 404. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: NotFoundPage, path: '/:pathMatch(.*)*' },
		],
	});
}

async function mountNotFound() {
	const router = makeRouter();
	const wrapper = mount(NotFoundPage, { global: { plugins: [router]}});

	await router.isReady();
	await flushPromises();

	return wrapper;
}

describe('Vue 404 page', () => {
	it('carries the app header, with the way home to the landing site and back to this app’s hub', async () => {
		const wrapper = await mountNotFound();
		const header = wrapper.find('header.fe-books-app__header');

		expect(header.find(`a[aria-label="${SITE_HOME_LABEL}"]`).attributes('href')).toBe(
			appHeaderLinks(window.location).homeHref,
		);
		expect(header.find('.fe-books-app__hub').attributes('href')).toBe('/');
		expect(header.find('.fe-books-app__subtitle').element.textContent).toBe('Not found · Vue');
	});

	it('renders the pinned-zero count, heading, dead-end chips, and CTA home', async () => {
		const wrapper = await mountNotFound();

		expect(wrapper.find('.fe-notfound__count').text()).toBe(NOT_FOUND_COPY.count);
		expect(wrapper.text()).toContain(NOT_FOUND_COPY.heading);
		expect(wrapper.findAll('.fe-notfound__chip')).toHaveLength(NOT_FOUND_CHIPS.length);
		expect(wrapper.find('.fe-notfound__cta').attributes('href')).toBe('/');
	});

	it('toggling a dead-end chip presses it without moving the count off zero', async () => {
		const wrapper: VueWrapper = await mountNotFound();
		const chip = wrapper.find('.fe-notfound__chip');

		expect(chip.attributes('aria-pressed')).toBe('false');

		await chip.trigger('click');

		expect(chip.attributes('aria-pressed')).toBe('true');
		// The count is the joke: it never leaves zero no matter what you toggle.
		expect(wrapper.find('.fe-notfound__count').text()).toBe('0');
	});
});
