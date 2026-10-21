/**
 * Every screen a route shows before, or instead of, its booted view has exactly one main landmark,
 * holding what the screen says.
 *
 * @remarks
 * The screens: the books and real-estate boot captions, the wine boot loader, and the three boot
 * failures (each the shared `BOOT_FAILURE_COPY` in a `role="alert"`), plus the not-found page. An accessibility audit often runs while one of
 * them is up — the 150,000-wine tier takes a while to generate — and a page with no `<main>` fails it
 * however good the booted view is. Each booted view carries its own `<main>` in its markup.
 *
 * The boots are replaced with promises the case settles, or never settles: what is under test is the
 * markup each state renders, not the engines.
 *
 * @packageDocumentation
 */

import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
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
	it('/wine shows BOOT_FAILURE_COPY.wine and the Vite tier sentence in an alert inside one main landmark', async () => {
		boots.wine.mockRejectedValue(new Error('the worker died'));
		const alert = onlyMain(await mountPage(WinePage)).querySelector('[role="alert"]');

		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.wine.title);
		expect(alert?.textContent).toContain('the worker died');
		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.wine.hint);
		expect(alert?.textContent).toContain('VITE_WINE_TIER=default');
	});

	it('/real-estate shows BOOT_FAILURE_COPY[\'real-estate\'] in an alert inside one main landmark', async () => {
		boots.realEstate.mockRejectedValue(new Error('corpus fetch returned 503'));
		const alert = onlyMain(await mountPage(RealEstatePage)).querySelector('[role="alert"]');

		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY['real-estate'].title);
		expect(alert?.textContent).toContain('corpus fetch returned 503');
		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY['real-estate'].hint);
	});

	it('/books shows BOOT_FAILURE_COPY.books in an alert inside one main landmark, not a stuck caption', async () => {
		boots.books.mockRejectedValue(new Error('books corpus 404'));
		const main = onlyMain(await mountPage(BooksPage));
		const alert = main.querySelector('[role="alert"]');

		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.books.title);
		expect(alert?.textContent).toContain('books corpus 404');
		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.books.hint);
		expect(main.querySelector('.fe-boot-caption')).toBeNull();
	});

	it('/books reports a non-Error rejection by its string form', async () => {
		boots.books.mockRejectedValue('offline');

		expect(onlyMain(await mountPage(BooksPage)).querySelector('[role="alert"]')?.textContent).toContain('offline');
	});
});

describe('the not-found page', () => {
	it('puts its message in one main landmark', async () => {
		expect(onlyMain(await mountPage(NotFoundPage)).classList.contains('fe-notfound')).toBe(true);
	});
});
