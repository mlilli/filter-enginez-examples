/**
 * Tests for `<LabPage />` — the `/lab` shell.
 *
 * @remarks
 * All three panes are stubbed here: this file is about the chrome, the framing copy and the ORDER
 * the panes compose in, and mounting the real ones would need an engine provider the shell does not
 * otherwise require. Each pane has its own spec against a real engine.
 *
 * ⚠ **Stubbing is a standing cost, and this file is where it gets paid.** Adding a real pane to
 * `LabPage` without adding its stub here turns four cases red with
 * `useFilterEngine called outside a <FilterEngineProvider>` — which is the gate working.
 *
 * @packageDocumentation
 */

import { appHeaderLinks, HEADER_PAGE_LABELS, SITE_HOME_LABEL } from '@filter-enginez/examples-shared/app-header';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./SimulationPane.js', () => ({
	SimulationPane: (): React.ReactElement => <section>projections</section>,
}));

vi.mock('./SimilarityPane.js', () => ({
	SimilarityPane: (): React.ReactElement => <section>neighbors</section>,
}));

vi.mock('./SuggestionPane.js', () => ({
	SuggestionPane: (): React.ReactElement => <section>suggestions</section>,
}));

const { LabPage } = await import('./LabPage.js');

// 🔴 EXPLICIT, because the root `vitest.config.ts` does not set `globals: true` — so Testing
// Library never registers its automatic cleanup and every render accumulates in the same document.
// The symptom is not an obvious leak: the FIRST case in a file passes and every later one fails
// with "Found multiple elements", which reads like an ambiguous query rather than like stale DOM.
// `react-ui`'s suites all carry this line for the same reason; reading two of them first would have
// saved the discovery.
afterEach(cleanup);

/** Mount the page inside a router, since its chrome is all links. */
function mountPage(): void {
	render(
		<MemoryRouter>
			<LabPage />
		</MemoryRouter>,
	);
}

describe('LabPage', () => {
	it('composes all three panes, in escalating order', () => {
		// The order is a decision, not an accident: projections first because it needs no attach step
		// and no corpus, then similarity, then suggestions — which is the only one that has to explain
		// where its numbers came from. Same "escalating in cleverness" shape the how-it-works page
		// uses for its bands. Asserting mere PRESENCE would pass against any permutation.
		mountPage();

		const panes = screen.getAllByText(/^(projections|neighbors|suggestions)$/u).map((node) => node.textContent);

		expect(panes).toEqual(['projections', 'neighbors', 'suggestions']);
	});

	it('titles the surface as a heading rather than as styled text', () => {
		// Heading levels are structure, not size. A visitor navigating by heading needs this to
		// be an `h1`, and the pane titles below it to be `h2`s.
		mountPage();

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Engine capabilities, running');
	});

	it('carries the shared header, naming the page and linking home and back to the hub', () => {
		// The compact header every page without dataset controls carries. The brand component has its
		// own suite; this pins that the lab renders it, as this app, under the page's own label.
		mountPage();

		const header = screen.getByRole('banner');

		expect(within(header).getByRole('link', { name: SITE_HOME_LABEL }).getAttribute('href')).toBe(
			appHeaderLinks(window.location).homeHref,
		);
		expect(within(header).getByRole('link', { name: 'React plain dataset hub' }).getAttribute('href')).toBe('/');
		expect(header.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			verticalSubtitle(HEADER_PAGE_LABELS.lab, 'react-plain'),
		);
	});

	it('puts everything below the header in one main landmark: the hero and the three panes', () => {
		// The header is the banner; the rest is the page's content. Outside a landmark, the hero's title
		// and lead would be content no landmark navigation reaches (axe's `region`).
		mountPage();

		const [main, ...others] = screen.getAllByRole('main');

		expect(others).toEqual([]);
		expect(within(main as HTMLElement).getByRole('heading', { level: 1 })).toBeDefined();
		expect(within(main as HTMLElement).getByText('suggestions')).toBeDefined();
		expect(main?.contains(screen.getByRole('banner'))).toBe(false);
	});

	it('links back to /books, which is where the shared engine state comes from', () => {
		mountPage();

		const back = screen.getByRole('link', { name: '← books' });

		expect(back.getAttribute('href')).toBe('/books');
	});
});
