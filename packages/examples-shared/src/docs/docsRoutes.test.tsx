/**
 * Test for the shared `/docs` route subtree — its shape, that every page loads the component its
 * module exports, and what a visit sees while the code arrives.
 *
 * @remarks
 * The loaders are the part a typo breaks silently: a loader resolving to `undefined` (a misspelled
 * export) type-checks as a missing component and renders an empty outlet in the browser. So each
 * loader is called here and must resolve to the very component its page module exports, compared by
 * identity rather than by name.
 *
 * @packageDocumentation
 */

import { cleanup, render, screen } from '@testing-library/react';
import { isValidElement } from 'react';
import { MemoryRouter, useRoutes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AlgorithmDocPage } from './AlgorithmDocPage.js';
import { DocsApiPage } from './DocsApiPage.js';
import { DocsHomePage } from './DocsHomePage.js';
import { DocsLayout } from './DocsLayout.js';
import { DocsPlaygroundPage } from './DocsPlaygroundPage.js';
import { DOCS_PAGE_ROUTES, docsPageFor, type DocsPageRoute, docsRoute, loadDocsLayout } from './docsRoutes.js';
import { RuleDocPage } from './RuleDocPage.js';

// No `globals: true`, so Testing Library registers no auto-cleanup.
afterEach(cleanup);

/**
 * The docs section alone, at a path.
 *
 * @returns The matched routes.
 */
const DocsOnly = (): React.ReactElement | null => useRoutes([docsRoute]);

/**
 * Render the docs section at a path.
 *
 * @param path - Where the visit starts.
 */
function renderDocsAt(path: string): void {
	render(
		<MemoryRouter initialEntries={[path]}>
			<DocsOnly />
		</MemoryRouter>,
	);
}

describe('docsRoute', () => {
	it('defines the /docs layout route with its five children, the overview as its index', () => {
		expect(docsRoute.path).toBe('/docs');
		expect(docsRoute.children).toHaveLength(5);
		expect(docsRoute.children?.filter((child) => child.index === true)).toHaveLength(1);
		expect(docsRoute.children?.[0]?.index).toBe(true);
	});

	it('renders each page through its lazy component, so no page is in an app’s startup bundle', () => {
		// A page component imported statically here would put that page back into every app's startup bundle.
		const types = docsRoute.children?.map((child) => (isValidElement(child.element) ? child.element.type : undefined));

		expect(types).toEqual(DOCS_PAGE_ROUTES.map((page) => page.Page));
		expect(docsRoute.children?.every((child) => child.Component === undefined && child.lazy === undefined)).toBe(true);
	});

	it.each([
		['the overview', '', DocsHomePage],
		['a rule page', 'rules/:ruleId', RuleDocPage],
		['an algorithm page', 'algorithms/:algoId', AlgorithmDocPage],
		['the playground', 'playground', DocsPlaygroundPage],
		['the API reference', 'api', DocsApiPage],
	])('loads %s', async (_name, path, page) => {
		const route = DOCS_PAGE_ROUTES.find((entry) => entry.path === path);

		expect(await route?.load()).toBe(page);
		expect(docsRoute.children?.some((child) => (child.path ?? '') === path)).toBe(true);
	});
});

describe('docsPageFor', () => {
	it.each([
		['/docs', ''],
		['/docs/', ''],
		['/docs/rules/value', 'rules/:ruleId'],
		['/docs/algorithms/bitmap-index', 'algorithms/:algoId'],
		['/docs/playground', 'playground'],
		['/docs/api', 'api'],
	])('matches %s to its page', (pathname, path) => {
		expect(docsPageFor(pathname)?.path).toBe(path);
	});

	it.each(['/docs/nope', '/docs/rules', '/wine', '/'])('matches no page for %s', (pathname) => {
		expect(docsPageFor(pathname)).toBeUndefined();
	});
});

describe('a visit that opens the docs', () => {
	it('shows the docs loading screen, one main landmark, until the layout and the page have arrived', async () => {
		renderDocsAt('/docs/api');

		// The first frame: the loader, nothing of the layout.
		expect(screen.getAllByRole('main')).toHaveLength(1);
		expect(screen.getByLabelText('Loading the documentation')).toBeDefined();

		expect(await screen.findByRole('heading', { level: 1, name: 'API reference' })).toBeDefined();
		expect(screen.queryByLabelText('Loading the documentation')).toBeNull();
		expect(screen.getAllByRole('main')).toHaveLength(1);
	});

	it('asks for the page’s code as it mounts, alongside the layout’s, not after it', () => {
		const api = DOCS_PAGE_ROUTES.find((entry) => entry.path === 'api');

		expect(api).toBeDefined();
		// The lazy page holds its own reference to the loader, so this spy sees only the section's request.
		const load = vi.spyOn(api as DocsPageRoute, 'load');

		renderDocsAt('/docs/api');

		// Called as the section mounts, before any chunk could have arrived to render the outlet.
		expect(load).toHaveBeenCalledTimes(1);
		load.mockRestore();
	});

	it('shows the layout, and fetches no page, where the section is mounted over a path no docs page answers', async () => {
		// In an app such a path never reaches the section (the router matches no child and falls through
		// to the 404), so the section is mounted bare here to see that it asks for nothing it cannot show.
		const BareSection = (): React.ReactElement | null => useRoutes([{ element: docsRoute.element, path: '/docs/*' }]);

		render(
			<MemoryRouter initialEntries={['/docs/nope']}>
				<BareSection />
			</MemoryRouter>,
		);

		expect(await screen.findByRole('navigation', { name: 'Documentation' })).toBeDefined();
		expect(screen.queryByLabelText('Loading the documentation')).toBeNull();
	});

	it('lays the pages out in the documentation’s own layout', async () => {
		expect(await loadDocsLayout()).toBe(DocsLayout);
	});
});
