/**
 * Render tests for the docs page templates — home, API reference, the layout shell + nav + header,
 * the param-routed rule + algorithm pages (including their not-found redirects), the links between
 * them under either base path, and the CodeBlock.
 *
 * @packageDocumentation
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { AppVerticalContext } from '../app-header/appVerticalContext.js';
import { HEADER_PAGE_LABELS, SITE_HOME_LABEL } from '../app-header/core.js';
import { DOCS_SITE_BASE_PATH } from '../page-meta/pageMeta.js';
import { verticalSubtitle } from '../verticals/verticals.js';
import { AlgorithmDocPage } from './AlgorithmDocPage.js';
import { CodeBlock } from './CodeBlock.js';
import { DocsApiPage } from './DocsApiPage.js';
import { DocsBasePathContext } from './docsBasePath.js';
import { DocsHomePage } from './DocsHomePage.js';
import { DocsLayout } from './DocsLayout.js';
import { RuleDocPage } from './RuleDocPage.js';

afterEach(cleanup);

/**
 * Render a param-routed page at `path` behind a `routePath`, with a fallback at the docs home for
 * redirects: `/docs` by default, `/` on the documentation site.
 *
 * @param path - Where the visit starts.
 * @param routePath - The page's route pattern.
 * @param element - The page.
 * @param isOnDocsSite - Mount it at the documentation site's root rather than a demo app's `/docs`.
 */
function renderRoute(path: string, routePath: string, element: React.ReactElement, isOnDocsSite = false): void {
	render(
		<DocsBasePathContext value={isOnDocsSite ? DOCS_SITE_BASE_PATH : '/docs'}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path={routePath} element={element} />
					<Route path={isOnDocsSite ? '/' : '/docs'} element={<div>docs-home-fallback</div>} />
				</Routes>
			</MemoryRouter>
		</DocsBasePathContext>,
	);
}

/**
 * The `href` of every link in the document.
 *
 * @returns The hrefs, in document order.
 */
function linkTargets(): readonly string[] {
	return [...document.querySelectorAll('a')].map((link) => link.getAttribute('href') ?? '');
}

describe('DocsHomePage', () => {
	it('renders the overview, quick-start code, and section cards', () => {
		const { container } = render(
			<MemoryRouter>
				<DocsHomePage />
			</MemoryRouter>,
		);

		expect(container.textContent).toContain('Quick start');
		expect(container.querySelector('.fe-doc-code')).not.toBeNull();
		expect(container.querySelectorAll('.fe-doc-card').length).toBeGreaterThan(0);
	});
});

describe('the links between pages', () => {
	it.each([
		['/docs', '/docs', '/docs/', true],
		[DOCS_SITE_BASE_PATH, '/', '/', false],
	] as const)('follow the base path %j: the home at %s, every other page under %s', (basePath, home, prefix, isUnderDocs) => {
		render(
			<DocsBasePathContext value={basePath}>
				<MemoryRouter initialEntries={[home]}>
					<Routes>
						<Route path={home} element={<DocsLayout />}>
							<Route index element={<DocsHomePage />} />
						</Route>
					</Routes>
				</MemoryRouter>
			</DocsBasePathContext>,
		);
		const nav = screen.getByRole('navigation', { name: 'Documentation' });
		const navTargets = within(nav).getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
		const cardTargets = [...document.querySelectorAll('.fe-doc-card')].map((card) => card.getAttribute('href') ?? '');

		expect(navTargets.length).toBeGreaterThan(20);
		expect(navTargets[0]).toBe(home);
		expect(navTargets.slice(1).filter((href) => !href.startsWith(prefix))).toEqual([]);
		expect(cardTargets).toHaveLength(4);
		expect(cardTargets.filter((href) => !href.startsWith(prefix))).toEqual([]);
		// Every link of the section sits under `/docs` in an app, and none of them does on the site.
		const targets = [...navTargets, ...cardTargets];

		expect(targets.filter((href) => href.startsWith('/docs'))).toEqual(isUnderDocs ? targets : []);
	});
});

describe('DocsApiPage', () => {
	it('renders API groups with signature entries', () => {
		const { container } = render(<DocsApiPage />);

		expect(container.textContent).toContain('API reference');
		expect(container.querySelectorAll('.fe-api__entry').length).toBeGreaterThan(0);
	});
});

describe('DocsLayout', () => {
	it('renders the nav + outlet, and the mobile drawer toggles + closes on nav', () => {
		const { container } = render(
			<MemoryRouter initialEntries={['/docs']}>
				<Routes>
					<Route path="/docs" element={<DocsLayout />}>
						<Route index element={<div>outlet-content</div>} />
						<Route path="rules/:ruleId" element={<div>rule-page</div>} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText('Overview')).toBeTruthy();
		expect(screen.getByText('outlet-content')).toBeTruthy();
		expect(screen.getAllByText('InSetRule').length).toBeGreaterThan(0);

		// The toggle is display:none until the mobile breakpoint (jsdom applies the <style>, and a
		// hidden element has no accessible name), so query it by class. Toggle open then closed.
		const toggle = container.querySelector('.fe-docs__nav-toggle') as HTMLButtonElement;

		expect(toggle.textContent).toBe('Menu');
		fireEvent.click(toggle);
		expect(toggle.textContent).toBe('Close');
		fireEvent.click(toggle);
		expect(toggle.textContent).toBe('Menu');

		// Clicking a nav link fires closeNav + navigates the outlet.
		fireEvent.click(screen.getAllByText('InSetRule')[0] as HTMLElement);
		expect(screen.getByText('rule-page')).toBeTruthy();
	});

	it('names the app it is mounted in, and links back to that app’s hub', () => {
		const { container } = render(
			<AppVerticalContext value="react-plain">
				<MemoryRouter initialEntries={['/docs']}>
					<Routes>
						<Route path="/docs" element={<DocsLayout />} />
					</Routes>
				</MemoryRouter>
			</AppVerticalContext>,
		);
		const topbar = screen.getByRole('banner');

		expect(within(topbar).getByRole('link', { name: SITE_HOME_LABEL })).toBeTruthy();
		expect(within(topbar).getByRole('link', { name: 'React plain dataset hub' }).getAttribute('href')).toBe('/');
		expect(container.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			verticalSubtitle(HEADER_PAGE_LABELS.docs, 'react-plain'),
		);
	});

	it('names the page alone on the documentation site, which has no hub to link back to', () => {
		const { container } = render(
			<MemoryRouter initialEntries={['/docs']}>
				<Routes>
					<Route path="/docs" element={<DocsLayout />} />
				</Routes>
			</MemoryRouter>,
		);
		const topbar = screen.getByRole('banner');

		expect(within(topbar).getByRole('link', { name: SITE_HOME_LABEL })).toBeTruthy();
		expect(container.querySelector('.fe-books-app__subtitle')?.textContent).toBe(HEADER_PAGE_LABELS.docs);
		expect(container.querySelector('.fe-books-app__hub')).toBeNull();
	});
});

describe('RuleDocPage', () => {
	it('renders a rule by route param, with its figure', () => {
		renderRoute('/docs/rules/in-set', '/docs/rules/:ruleId', <RuleDocPage />);

		expect(screen.getByRole('heading', { name: 'InSetRule' })).toBeTruthy();
		expect(document.querySelector('.fe-rulefig')).not.toBeNull();
	});

	it('redirects an unknown rule to /docs', () => {
		renderRoute('/docs/rules/nope', '/docs/rules/:ruleId', <RuleDocPage />);

		expect(screen.getByText('docs-home-fallback')).toBeTruthy();
	});

	it('redirects an unknown rule to the documentation site’s home, at its root', () => {
		renderRoute('/rules/nope', '/rules/:ruleId', <RuleDocPage />, true);

		expect(screen.getByText('docs-home-fallback')).toBeTruthy();
	});

	it.each([
		[false, '/docs/rules/in-set', '/docs/rules/:ruleId', '/docs'],
		[true, '/rules/in-set', '/rules/:ruleId', ''],
	])('links within the documentation under its base path (on the documentation site: %s)', (isOnDocsSite, path, routePath, base) => {
		renderRoute(path, routePath, <RuleDocPage />, isOnDocsSite);
		const internal = linkTargets().filter((href) => href.startsWith('/'));

		expect(internal).toContain(`${base}/playground`);
		expect(internal.some((href) => href.startsWith(`${base}/rules/`))).toBe(true);
		expect(internal.filter((href) => !href.startsWith(`${base}/`))).toEqual([]);
	});
});

describe('AlgorithmDocPage', () => {
	it('renders an algorithm by route param', () => {
		renderRoute('/docs/algorithms/roaring-bitmaps', '/docs/algorithms/:algoId', <AlgorithmDocPage />);

		expect(screen.getByRole('heading', { name: 'Roaring bitmaps' })).toBeTruthy();
	});

	it('redirects an unknown algorithm to /docs', () => {
		renderRoute('/docs/algorithms/nope', '/docs/algorithms/:algoId', <AlgorithmDocPage />);

		expect(screen.getByText('docs-home-fallback')).toBeTruthy();
	});

	it('redirects an unknown algorithm to the documentation site’s home, and links its neighbors at the root', () => {
		renderRoute('/algorithms/nope', '/algorithms/:algoId', <AlgorithmDocPage />, true);

		expect(screen.getByText('docs-home-fallback')).toBeTruthy();
		cleanup();
		renderRoute('/algorithms/roaring-bitmaps', '/algorithms/:algoId', <AlgorithmDocPage />, true);
		expect(linkTargets().filter((href) => href.startsWith('/algorithms/')).length).toBeGreaterThan(0);
		expect(linkTargets().filter((href) => href.startsWith('/docs'))).toEqual([]);
	});
});

describe('CodeBlock', () => {
	it('is a focusable, scrollable code region', () => {
		const { container } = render(<CodeBlock code="const x = 1" ariaLabel="sample" />);
		const pre = container.querySelector('pre.fe-doc-code');

		expect(pre?.getAttribute('role')).toBe('group');
		expect(pre?.getAttribute('tabindex')).toBe('0');
		expect(pre?.getAttribute('aria-label')).toBe('sample');
		expect(pre?.textContent).toBe('const x = 1');
	});
});
