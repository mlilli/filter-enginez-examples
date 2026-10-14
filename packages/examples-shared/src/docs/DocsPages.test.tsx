/**
 * Render tests for the docs page templates — home, API reference, the layout shell + nav + header,
 * the param-routed rule + algorithm pages (including their not-found redirects), and the CodeBlock.
 *
 * @packageDocumentation
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { AppVerticalContext } from '../app-header/appVerticalContext.js';
import { HEADER_PAGE_LABELS, SITE_HOME_LABEL } from '../app-header/core.js';
import { verticalSubtitle } from '../verticals/verticals.js';
import { AlgorithmDocPage } from './AlgorithmDocPage.js';
import { CodeBlock } from './CodeBlock.js';
import { DocsApiPage } from './DocsApiPage.js';
import { DocsHomePage } from './DocsHomePage.js';
import { DocsLayout } from './DocsLayout.js';
import { RuleDocPage } from './RuleDocPage.js';

afterEach(cleanup);

/** Render a param-routed page at `path` behind a `routePath`, with a `/docs` fallback for redirects. */
function renderRoute(path: string, routePath: string, element: React.ReactElement): void {
	render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path={routePath} element={element} />
				<Route path="/docs" element={<div>docs-home-fallback</div>} />
			</Routes>
		</MemoryRouter>,
	);
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
