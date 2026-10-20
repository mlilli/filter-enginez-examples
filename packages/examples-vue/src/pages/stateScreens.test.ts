/**
 * Every screen a route shows before, or instead of, its booted view has exactly one main landmark,
 * holding what the screen says.
 *
 * @remarks
 * The screens: the books and real-estate boot captions, the wine boot loader, and the wine and
 * real-estate boot failures, plus the not-found page. An accessibility audit often runs while one of
 * them is up — the 150,000-wine tier takes a while to generate — and a page with no `<main>` fails it
 * however good the booted view is. Each booted view carries its own `<main>` in its markup.
 *
 * The boots are replaced with promises the case settles, or never settles: what is under test is the
 * markup each state renders, not the engines.
 *
 * @packageDocumentation
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

/** The boots the pages call, each replaced by a case. */
const boots = vi.hoisted(() => ({
	books: vi.fn<() => Promise<never>>(),
	realEstate: vi.fn<() => Promise<never>>(),
	wine: vi.fn<() => Promise<never>>(),
}));

/** A boot that never settles: the page stays on its boot screen. */
const pending = async (): Promise<never> => new Promise<never>(() => undefined);

vi.mock('@filter-enginez/examples-shared/books-core', () => ({ bootBooksEngine: boots.books }));
vi.mock('@filter-enginez/examples-shared/real-estate-core', () => ({
	bootRealEstateEngine: boots.realEstate,
	subscribeRealEstateBootProgress: () => () => undefined,
}));
vi.mock('@filter-enginez/examples-shared/wine-core', () => ({
	bootWineEngine: boots.wine,
	describeWineCorpusTier: () => '',
	subscribeWineBootProgress: () => () => undefined,
}));
vi.mock('@filter-enginez/examples-shared/wine-worker-spawn', () => ({ spawnWineWorker: () => undefined }));

const { default: BooksPage } = await import('./BooksPage.vue');
const { default: RealEstatePage } = await import('./RealEstatePage.vue');
const { default: WinePage } = await import('./WinePage.vue');
const { default: NotFoundPage } = await import('./NotFoundPage.vue');

/** Every wrapper a case mounted, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
	vi.clearAllMocks();
});

/**
 * Mount a page attached to the document, inside a memory router (the not-found page reads the route,
 * and every page's header links through the router), and let its mount hooks run.
 *
 * @param page - The page component.
 * @returns The wrapper.
 */
async function mountPage(page: Parameters<typeof mount>[0]): Promise<VueWrapper> {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ component: { template: '<div />' }, path: '/:pathMatch(.*)*' }],
	});

	await router.push('/nope');
	const wrapper = mount(page, { attachTo: document.body, global: { plugins: [router]}});

	mounted.push(wrapper);
	await flushPromises();

	return wrapper;
}

/**
 * The one main landmark a page rendered.
 *
 * @param wrapper - The page.
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(wrapper: VueWrapper): Element {
	const mains = wrapper.findAll('main, [role="main"]');

	expect(mains).toHaveLength(1);

	return mains[0]?.element as Element;
}

describe('booting', () => {
	it('/books holds its boot caption in one main landmark', async () => {
		boots.books.mockImplementation(pending);

		expect(onlyMain(await mountPage(BooksPage)).querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('/real-estate holds its boot caption in one main landmark', async () => {
		boots.realEstate.mockImplementation(pending);

		expect(onlyMain(await mountPage(RealEstatePage)).querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('/wine holds its loader and caption in one main landmark', async () => {
		boots.wine.mockImplementation(pending);
		const main = onlyMain(await mountPage(WinePage));

		expect(main.querySelector('[aria-label="Loading wine reviews"]')).not.toBeNull();
		expect(main.querySelector('.fe-boot-caption')).not.toBeNull();
	});
});

describe('a failed boot', () => {
	it('/wine shows the failure in one main landmark', async () => {
		boots.wine.mockRejectedValue(new Error('the worker died'));

		expect(onlyMain(await mountPage(WinePage)).textContent).toContain('the worker died');
	});

	it('/real-estate shows the failure in one main landmark', async () => {
		boots.realEstate.mockRejectedValue(new Error('corpus fetch returned 503'));
		const main = onlyMain(await mountPage(RealEstatePage));

		expect(main.querySelector('[role="alert"]')?.textContent).toContain('corpus fetch returned 503');
	});
});

describe('the not-found page', () => {
	it('puts its message in one main landmark', async () => {
		expect(onlyMain(await mountPage(NotFoundPage)).classList.contains('fe-notfound')).toBe(true);
	});
});
