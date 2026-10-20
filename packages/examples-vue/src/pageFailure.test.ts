/**
 * Tests that a page whose code does not load shows the shared page-error screen rather than a blank
 * page, and that the next successful navigation puts the router view back.
 *
 * @remarks
 * Over the app's real router and root component, with one extra route whose lazy component rejects the
 * way a chunk that did not arrive does.
 *
 * @packageDocumentation
 */

import { PAGE_ERROR_TITLE, PAGE_ERROR_UNKNOWN_DETAIL } from '@filter-enginez/examples-shared/page-error-core';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from './App.vue';
import { pageFailure, router } from './router.js';

/** The route whose code does not load. */
const UNLOADABLE = 'unloadable-for-test';

/** The route that throws something other than an error. */
const THROWS_NOTHING = 'throws-nothing-for-test';

let wrapper: VueWrapper | undefined;

beforeEach(async () => {
	router.addRoute({
		component: async () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/WinePage.js')),
		name: UNLOADABLE,
		path: '/unloadable',
	});
	router.addRoute({
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test: anything can be rejected.
		component: async () => Promise.reject(undefined),
		name: THROWS_NOTHING,
		path: '/throws-nothing',
	});
	await router.push('/');
	wrapper = mount(App, { global: { plugins: [router]}});
	await flushPromises();
});

afterEach(() => {
	wrapper?.unmount();
	router.removeRoute(UNLOADABLE);
	router.removeRoute(THROWS_NOTHING);
	pageFailure.value = null;
});

/**
 * Navigate, letting a failed navigation fail the way a click on a link does: reported, not thrown.
 *
 * @param path - Where to go.
 */
async function go(path: string): Promise<void> {
	await router.push(path).catch(() => undefined);
	await flushPromises();
}

describe('a page whose code does not load', () => {
	it('shows the page-error screen, one main landmark around an alert naming what failed', async () => {
		await go('/unloadable');

		const mains = wrapper?.findAll('main') ?? [];

		expect(mains).toHaveLength(1);
		expect(mains[0]?.classes()).toContain('fe-page-error');
		expect(mains[0]?.find('[role="alert"]').text()).toContain(PAGE_ERROR_TITLE);
		expect(mains[0]?.text()).toContain('Failed to fetch dynamically imported module: /assets/WinePage.js');
	});

	it('shows the shared line for a failure with no message', async () => {
		await go('/throws-nothing');

		expect(wrapper?.text()).toContain(PAGE_ERROR_UNKNOWN_DETAIL);
	});

	it('gives the page back to the router once a navigation succeeds', async () => {
		await go('/unloadable');
		expect(wrapper?.find('.fe-page-error').exists()).toBe(true);

		await go('/no-such-page');

		expect(pageFailure.value).toBeNull();
		expect(wrapper?.find('.fe-page-error').exists()).toBe(false);
		expect(wrapper?.find('.fe-notfound').exists()).toBe(true);
	});

	it('keeps the failure on screen through a navigation that is aborted rather than completed', async () => {
		await go('/unloadable');
		// Already at `/`: Vue Router reports a duplicated navigation as a failure, not a success.
		await go('/');
		await go('/');

		expect(router.currentRoute.value.path).toBe('/');
		expect(wrapper?.find('.fe-page-error').exists()).toBe(true);
	});
});
