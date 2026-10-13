/**
 * Render test for the Vue `/compare` page.
 *
 * @remarks
 * Same scope as the SvelteKit `CompareView.test.ts`, and deliberately not wider: `compare-core`'s
 * `core.test.ts` owns the link algebra and the state resolution, and re-asserting either through a
 * component is how a shared module's suite grows six-fold across a fan-out. What is left is the seam
 * — did THIS shell wire the shared module up, and does it put the same things on screen.
 *
 * ### The one thing this has to mock, and why it is a real risk rather than ceremony
 *
 * The page reads its parameters from `useRoute()`, so a bare `mount()` has no router and throws.
 * Mounting with the app's real router would drag in `BooksPage` and its engine boot, so the test
 * installs a **minimal router carrying only this route** — enough for `useRoute()` and
 * `<RouterLink>`, nothing else. `window.location` needs no mocking: jsdom supplies one, and the
 * shared `CompareLocation` is structural, so `origin` and `hostname` are all the page touches.
 *
 * jsdom's default origin is `http://localhost:3000`, which `deploymentLayout` classifies as `dev` —
 * so the links resolve to the registry's `devOrigin`s exactly as they do on a developer's machine.
 * That is asserted below rather than assumed, because a jsdom origin change would otherwise flip
 * these links to the production layout and the failure would name the wrong thing.
 *
 * @packageDocumentation
 */

import { COMPARE_PRESETS, DATASET_LABELS, URL_STATE_PARAM } from '@filter-enginez/examples-shared/compare-core';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createRouter, createWebHistory, type Router } from 'vue-router';

import ComparePage from './ComparePage.vue';

/**
 * Mount the page at a given query string, behind a router carrying only this route.
 *
 * @remarks
 * Returns the root ELEMENT rather than the wrapper. `VueWrapper.element` is typed loosely enough that
 * `element.querySelectorAll<HTMLAnchorElement>(…)` is an untyped call — `TS2347`, and `any` leaking
 * into every assertion downstream of it. Narrowing once, here, keeps the tests themselves typed.
 */
async function mountAt(query = ''): Promise<HTMLElement> {
	const router: Router = createRouter({
		history: createWebHistory(),
		routes: [
			{ component: ComparePage, path: '/compare' },
			// The footnote's "Back to the dataset hub" is a `<RouterLink to="/">`, and a router that
			// cannot resolve it logs "No match found" on every mount. A render-less stub rather than the
			// real `LandingPage`: the point is that the target RESOLVES, and importing the hub would pull
			// its dataset cards and their imports into a test about the comparison table.
			{ component: { render: (): null => null }, path: '/' },
		],
	});

	await router.push(`/compare${query}`);
	await router.isReady();

	const wrapper = mount(ComparePage, { global: { plugins: [router]}});

	await flushPromises();

	return wrapper.element as HTMLElement;
}

/** Every anchor the vertical list renders. */
function rowLinks(root: HTMLElement): readonly HTMLAnchorElement[] {
	return [...root.querySelectorAll<HTMLAnchorElement>('.fe-compare__list .fe-compare__row-name')];
}

describe('Vue /compare page', () => {
	it('renders one row per vertical, in registry order, naming each stack', async () => {
		const root = await mountAt();

		expect(rowLinks(root).map((link) => link.textContent.trim())).toEqual(
			VERTICALS.map((descriptor) => descriptor.name),
		);
	});

	it('points every row at that vertical, carrying the state it displays', async () => {
		const root = await mountAt();
		const serialized = root.querySelector('.fe-compare__state-value')?.textContent ?? '';

		// Non-empty first: an empty readout would render zero rows, and every per-row assertion below
		// would then pass vacuously over an empty list while reporting a working page.
		expect(serialized).not.toBe('');

		const parsed = rowLinks(root).map((link) => new URL(link.href));

		expect(parsed.map((url) => url.origin)).toEqual(VERTICALS.map((descriptor) => descriptor.devOrigin));
		expect(parsed.map((url) => url.searchParams.get(URL_STATE_PARAM))).toEqual(VERTICALS.map(() => serialized));
	});

	it('falls back to the first preset on a cold visit, and says so', async () => {
		const root = await mountAt();

		expect(root.querySelector('.fe-compare__state-label')?.textContent).toBe(
			`preset · ${COMPARE_PRESETS.books[0].label}`,
		);
	});

	it('honors a chosen preset over the default', async () => {
		const chosen = COMPARE_PRESETS.books[1];

		expect(chosen).toBeDefined();

		const root = await mountAt(`?preset=${chosen?.id ?? ''}`);

		expect(root.querySelector('.fe-compare__state-label')?.textContent).toBe(
			`preset · ${chosen?.label}`,
		);
	});

	it('passes an inbound ?f= through VERBATIM rather than re-encoding it', async () => {
		const inbound = 'h~{"version":1,"rules":[]}';
		const root = await mountAt(`?f=${encodeURIComponent(inbound)}`);

		expect(root.querySelector('.fe-compare__state-value')?.textContent).toBe(inbound);
		expect(root.querySelector('.fe-compare__state-label')?.textContent).toBe('from your link');

		for (const url of rowLinks(root).map((link) => new URL(link.href))) {
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(inbound);
		}
	});

	it('hides the preset picker when the visitor arrived with their own state', async () => {
		const withState = await mountAt(`?f=${encodeURIComponent('h~{"version":1,"rules":[]}')}`);

		expect(withState.querySelectorAll('.fe-compare__group')).toHaveLength(1);

		const cold = await mountAt();

		expect(cold.querySelectorAll('.fe-compare__group')).toHaveLength(2);
	});

	it('switches dataset from the query, marking the toggle for pointer and screen reader alike', async () => {
		const root = await mountAt('?dataset=real-estate');
		const selected = [...root.querySelectorAll('.fe-compare__toggle--selected')];
		const dataset = selected.find((toggle) => toggle.textContent.trim() === DATASET_LABELS['real-estate']);

		expect(dataset).toBeDefined();
		expect(dataset?.getAttribute('aria-current')).toBe('true');
		// And the rows follow the dataset, which is the half a toggle-only assertion would miss.
		expect(rowLinks(root).map((link) => new URL(link.href).pathname)).toEqual(
			VERTICALS.map(() => '/real-estate'),
		);
	});

	it('collapses a repeated query parameter rather than choking on the array', async () => {
		// Vue Router types every query value as `string | null | (string | null)[]` because `?a=1&a=2`
		// is legal. A shell that passed the array straight through would render `[object Object]` in the
		// state readout and six malformed links — visibly wrong, but only if someone produced such a URL.
		const root = await mountAt('?dataset=real-estate&dataset=books');

		expect(root.querySelector('.fe-compare__state-value')?.textContent).not.toContain('object');
		expect(rowLinks(root).map((link) => new URL(link.href).pathname)).toEqual(
			VERTICALS.map(() => '/real-estate'),
		);
	});
});
