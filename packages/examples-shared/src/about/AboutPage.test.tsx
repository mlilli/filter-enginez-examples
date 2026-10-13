/**
 * Render test for `<AboutPage />` — the hero, every algorithm band, and the benchmark widget mount.
 *
 * @remarks
 * The benchmark widget's engine workload is mocked so the test doesn't load the 10k corpus; the pure
 * timing logic is covered by `benchmarkTiming.test.ts`.
 *
 * @packageDocumentation
 */

import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ABOUT_SECTIONS } from './aboutContent.js';
import { AboutPage } from './AboutPage.js';

vi.mock('./benchmark/benchmarkWorkload.js', () => ({
	DEFAULT_TIMED_PASSES: 7,
	DEFAULT_WARMUP_PASSES: 2,
	HEAVY_TIMED_PASSES: 20,
	loadWineCorpus: async () => Promise.resolve([]),
	measureConfig: async () => Promise.resolve({ resultCount: 0, samples: []}),
	toAcceleration: (config: unknown) => config,
}));

afterEach(cleanup);

describe('AboutPage', () => {
	it('renders the hero, every algorithm band, and the benchmark widget', () => {
		const { container } = render(
			<MemoryRouter>
				<AboutPage />
			</MemoryRouter>,
		);

		expect(container.textContent).toContain('How the engine works');
		for (const section of ABOUT_SECTIONS) {
			expect(container.textContent).toContain(section.title);
		}
		expect(container.querySelector('#benchmark')).not.toBeNull();
		expect(container.querySelector('.fe-bench')).not.toBeNull();
		expect(container.textContent).toContain('Beyond filtering');
	});

	it('renders NO demo links when the host app supplies none', () => {
		// 🔴 The case that protects the apps without a `/lab`. `ABOUT_SECTIONS` is shared by all six
		// verticals; `/lab` exists on one. A default link — or a link baked into the content array —
		// would render on every other app, pointing at a route its router answers with a 404. The
		// absence is the feature.
		const { container } = render(
			<MemoryRouter>
				<AboutPage />
			</MemoryRouter>,
		);

		expect(container.querySelectorAll('.fe-about__demo-link').length).toBe(0);
	});

	it('renders a demo link on exactly the sections the host app names', () => {
		const { container } = render(
			<MemoryRouter>
				<AboutPage demoLinks={{ similarity: { label: 'See it running', to: '/lab' }}} />
			</MemoryRouter>,
		);

		const links = [...container.querySelectorAll('.fe-about__demo-link')];

		expect(links.length).toBe(1);
		expect(links[0]?.getAttribute('href')).toBe('/lab');
		expect(links[0]?.textContent).toContain('See it running');
		// And it landed in the section it names rather than merely somewhere on the page.
		expect(container.querySelector('#similarity')?.querySelector('.fe-about__demo-link')).not.toBeNull();
	});

	it('ignores a key that names no section rather than failing the whole page', () => {
		// Deliberate leniency: a documentation route should not go blank over a mistyped key. The
		// typo is caught in the app that supplies the links, where it is cheap — see
		// `examples-react-plain/src/lab/labAboutLinks.test.ts`.
		const { container } = render(
			<MemoryRouter>
				<AboutPage demoLinks={{ 'not-a-section': { label: 'Nowhere', to: '/lab' }}} />
			</MemoryRouter>,
		);

		expect(container.querySelectorAll('.fe-about__demo-link').length).toBe(0);
		expect(container.textContent).toContain('How the engine works');
	});
});
