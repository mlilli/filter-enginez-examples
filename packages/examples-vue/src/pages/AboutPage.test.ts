/**
 * Render test for the Vue About page — parity with the SvelteKit `about/page.test.ts` and the React
 * `AboutPage.test.tsx`.
 *
 * @remarks
 * Confirms the hero, every algorithm band title (from the shared `about-core` content), the act-two
 * divider, and all eight figures (`role="img"`) mount. The figures' `v-in-view` directive + the
 * scroll-spy both guard `IntersectionObserver` (absent in jsdom), so the page renders its completed
 * static frame without throwing. The heavy benchmark workload is mocked so mounting the embedded
 * `<BenchmarkWidget>` never loads the wine corpus.
 */

import type * as AboutCore from '@filter-enginez/examples-shared/about-core';

import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

vi.mock('@filter-enginez/examples-shared/about-core', async (importActual) => {
	const actual = await importActual<typeof AboutCore>();

	return {
		...actual,
		loadWineCorpus: async (): Promise<readonly unknown[]> => {
			await Promise.resolve();

			return [];
		},
		measureConfig: async (): Promise<{ resultCount: number; samples: number[] }> => {
			await Promise.resolve();

			return { resultCount: 0, samples: []};
		},
	};
});

// Imported AFTER the mock so the embedded widget picks up the stubbed workload.
const { default: AboutPage } = await import('./AboutPage.vue');

/** A router with the routes the page links to so `<RouterLink>` resolves. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: { template: '<div />' }, path: '/books' },
		],
	});
}

async function mountAbout() {
	const router = makeRouter();
	// Mount first (installs the router plugin, kicking off the memory-history initial navigation), THEN
	// await `isReady` — awaiting before install would hang forever.
	const wrapper = mount(AboutPage, { global: { plugins: [router]}});

	await router.isReady();
	await flushPromises();

	return wrapper;
}

describe('Vue About page', () => {
	it('renders the hero, every algorithm band title, and the act-two divider', async () => {
		const wrapper = await mountAbout();

		expect(wrapper.text()).toContain('How the engine works');
		for (const section of ABOUT_SECTIONS) {
			expect(wrapper.text()).toContain(section.title);
		}
		expect(wrapper.text()).toContain('Beyond filtering');
	});

	it('renders one figure per section (role=img)', async () => {
		const wrapper = await mountAbout();

		expect(wrapper.findAll('[role="img"]')).toHaveLength(ABOUT_SECTIONS.length);
	});
});
