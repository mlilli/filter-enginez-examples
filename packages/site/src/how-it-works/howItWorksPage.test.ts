/**
 * Tests for `howItWorksPage.ts` — enhancing the statically rendered how-it-works page.
 *
 * @remarks
 * The fixture is the REAL build-time markup: the page's frame is assembled from `prerender.ts`'s own
 * renderers, so these tests prove the two halves agree on every `data-*` hook between them. A renamed
 * hook on either side fails here rather than leaving a deployed page with silent empty frames.
 *
 * The heavy benchmark workload is mocked so the widget never loads the wine corpus. jsdom has no
 * `IntersectionObserver`, which exercises the scroll-spy's, the figures' and the benchmark's
 * no-observer paths; their observer paths are driven with a fake below.
 *
 * @packageDocumentation
 */

import type * as HowItWorks from '@filter-enginez/examples-shared/how-it-works';

import { HOW_IT_WORKS_DEMO_LINKS, HOW_IT_WORKS_SECTIONS, loadWineCorpus, measureConfig } from '@filter-enginez/examples-shared/how-it-works';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderBands, renderBenchmarkReference, renderTableOfContents } from './prerender.js';

vi.mock('@filter-enginez/examples-shared/how-it-works', async (importActual) => {
	const actual = await importActual<typeof HowItWorks>();

	return {
		...actual,
		loadWineCorpus: vi.fn(async (): Promise<readonly unknown[]> => {
			await Promise.resolve();

			return [];
		}),
		measureConfig: vi.fn(async (): Promise<{ resultCount: number; samples: number[] }> => {
			await Promise.resolve();

			return { resultCount: 0, samples: []};
		}),
	};
});

// Imported AFTER the mock so the embedded widget picks up the stubbed workload.
const { enhanceHowItWorksPage } = await import('./howItWorksPage.js');

/** A developer's machine: loopback, so cross-app links resolve to the dev servers. */
const DEV_LOCATION = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:24617' };

/** The deployed site. */
const PRODUCTION_LOCATION = { hostname: 'filterenginez.com', origin: 'https://filterenginez.com' };

/**
 * Mount the page's frame, as `how-it-works.html` holds it after the build, into the document.
 *
 * @returns The page root.
 */
function mountPrerenderedPage(): HTMLElement {
	const main = document.createElement('main');

	main.innerHTML = [
		`<nav class="fe-about__toc" aria-label="On this page">${renderTableOfContents()}</nav>`,
		`<div class="fe-about__bands">${renderBands()}`,
		`<section id="benchmark"><div data-benchmark>${renderBenchmarkReference()}</div></section>`,
		'</div>',
	].join('');
	document.body.append(main);

	return main;
}

/** A controllable `IntersectionObserver` stand-in, recording what it observes. */
interface FakeObserver {
	/** Deliver entries to the observer's callback. */
	readonly emit: (entries: readonly { readonly id: string; readonly ratio: number }[]) => void;
	/** The ids of the elements observed so far. */
	readonly observedIds: string[];
	/** How many times `disconnect` was called. */
	disconnectCount: number;
}

/**
 * Install a fake `IntersectionObserver` global.
 *
 * @returns Every observer constructed while installed, in order.
 */
function installObserver(): FakeObserver[] {
	const observers: FakeObserver[] = [];

	vi.stubGlobal(
		'IntersectionObserver',
		class {
			/** This instance's record. */
			private readonly _record: FakeObserver;

			/**
			 * @param callback - The observer callback.
			 */
			public constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
				const elements = new Map<string, Element>();
				const record: FakeObserver = {
					disconnectCount: 0,
					emit: (entries) => {
						callback(
							entries.map(({ id, ratio }) => ({
								intersectionRatio: ratio,
								isIntersecting: ratio > 0,
								target: elements.get(id) ?? document.createElement('div'),
							}) as unknown as IntersectionObserverEntry),
						);
					},
					observedIds: [],
				};

				this._record = record;
				this.observe = (element: Element): void => {
					elements.set(element.id, element);
					record.observedIds.push(element.id);
				};
				observers.push(record);
			}

			/** Record a target. Assigned in the constructor, where the record is in scope. */
			public observe: (element: Element) => void = () => undefined;

			/** Count a disconnect. */
			public disconnect(): void {
				this._record.disconnectCount += 1;
			}
		},
	);

	return observers;
}

beforeEach(() => {
	document.body.replaceChildren();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('enhanceHowItWorksPage', () => {
	it('mounts one figure into every band placeholder', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		expect(page.querySelectorAll('.fe-about__figure [role="img"]')).toHaveLength(HOW_IT_WORKS_SECTIONS.length);
		for (const section of HOW_IT_WORKS_SECTIONS) {
			expect(page.querySelector(`#${section.id} .fe-about__figure .fe-fig`), section.id).not.toBeNull();
		}
	});

	it('rests every figure on its completed frame when there is no IntersectionObserver', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		for (const figure of page.querySelectorAll('.fe-fig')) {
			expect(figure.classList.contains('is-playing')).toBe(true);
		}
	});

	it('leaves a placeholder naming no known figure empty rather than failing the page', () => {
		const page = mountPrerenderedPage();
		const stray = document.createElement('div');

		stray.dataset['figure'] = 'constructor';
		page.append(stray);

		expect(() => enhanceHowItWorksPage(page, DEV_LOCATION)).not.toThrow();
		expect(stray.childNodes).toHaveLength(0);
	});

	it('replaces the reference sentence with the live widget and its three acceleration switches', () => {
		const page = mountPrerenderedPage();

		expect(page.querySelector('.fe-about__bench-reference')).not.toBeNull();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		expect(page.querySelector('.fe-about__bench-reference')).toBeNull();
		expect(page.querySelector('[data-benchmark] .fe-bench')).not.toBeNull();
		expect(page.querySelectorAll('[role="switch"]')).toHaveLength(3);
		expect(page.textContent).toContain('faster than naive scan');
	});

	it('flips a switch when pressed', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		const roaring = page.querySelector<HTMLButtonElement>('[role="switch"]');

		expect(roaring?.getAttribute('aria-checked')).toBe('true');
		roaring?.click();
		expect(roaring?.getAttribute('aria-checked')).toBe('false');
	});

	it('points the demo links at the local plain-React app in development', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		const links = [...page.querySelectorAll<HTMLAnchorElement>('.fe-about__demo-link')];

		expect(links).toHaveLength(Object.keys(HOW_IT_WORKS_DEMO_LINKS).length);
		for (const link of links) {
			expect(link.getAttribute('href')).toBe('http://127.0.0.1:24613/lab');
		}
	});

	it('keeps the demo links on the deployed app in production', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, PRODUCTION_LOCATION);

		for (const link of page.querySelectorAll<HTMLAnchorElement>('.fe-about__demo-link')) {
			expect(link.getAttribute('href')).toBe('https://react.filterenginez.com/lab');
		}
	});

	it.each([
		['naming no known vertical', 'cobol', '/lab'],
		['whose path is not a path', 'react-plain', 'https://example.com/'],
	])('leaves alone a demo link %s', (_case, verticalId, path) => {
		const page = mountPrerenderedPage();
		const link = document.createElement('a');

		link.href = 'https://filterenginez.com/';
		link.dataset['vertical'] = verticalId;
		link.dataset['path'] = path;
		page.append(link);

		enhanceHowItWorksPage(page, DEV_LOCATION);

		expect(link.getAttribute('href')).toBe('https://filterenginez.com/');
	});

	it('tears down cleanly, more than once', () => {
		const teardown = enhanceHowItWorksPage(mountPrerenderedPage(), DEV_LOCATION);

		expect(() => {
			teardown();
			teardown();
		}).not.toThrow();
	});

	it('tolerates a page with no benchmark slot', () => {
		const page = mountPrerenderedPage();

		page.querySelector('[data-benchmark]')?.remove();

		expect(() => enhanceHowItWorksPage(page, DEV_LOCATION)()).not.toThrow();
	});
});

describe('the scroll-spy', () => {
	it('observes every band and the benchmark the table of contents links to', () => {
		const observers = installObserver();

		enhanceHowItWorksPage(mountPrerenderedPage(), DEV_LOCATION);

		// The last observer constructed is the scroll-spy; the ones before it gate the figures.
		expect(observers.at(-1)?.observedIds).toEqual([...HOW_IT_WORKS_SECTIONS.map((section) => section.id), 'benchmark']);
	});

	it('marks only the most visible band active, and keeps the mark while nothing is visible', () => {
		const observers = installObserver();
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		const spy = observers.at(-1);
		const activeIds = (): (string | undefined)[] =>
			[...page.querySelectorAll<HTMLAnchorElement>('.fe-about__toc a.is-active')].map((link) => link.hash.slice(1));

		spy?.emit([
			{ id: 'roaring', ratio: 0.3 },
			{ id: 'exclusion', ratio: 0.6 },
		]);
		expect(activeIds()).toEqual(['exclusion']);

		spy?.emit([{ id: 'exclusion', ratio: 0 }]);
		expect(activeIds()).toEqual(['roaring']);

		spy?.emit([{ id: 'roaring', ratio: 0 }]);
		expect(activeIds(), 'nothing in view: the last mark stays').toEqual(['roaring']);
	});

	it('disconnects on teardown', () => {
		const observers = installObserver();
		const teardown = enhanceHowItWorksPage(mountPrerenderedPage(), DEV_LOCATION);

		teardown();

		expect(observers.every((observer) => observer.disconnectCount === 1)).toBe(true);
	});

	it('does nothing without a table of contents', () => {
		const observers = installObserver();
		const page = mountPrerenderedPage();

		page.querySelector('.fe-about__toc')?.remove();
		enhanceHowItWorksPage(page, DEV_LOCATION);

		// One per figure, and the benchmark's: no scroll-spy.
		expect(observers).toHaveLength(HOW_IT_WORKS_SECTIONS.length + 1);
	});
});

describe('the live benchmark’s engine', () => {
	beforeEach(async () => {
		// Widgets mounted by earlier tests (never torn down) finish measuring a macrotask after they go
		// live; let them, so the counts below are this test's alone.
		await new Promise((resolve) => setTimeout(resolve, 10));
		vi.mocked(loadWineCorpus).mockClear();
		vi.mocked(measureConfig).mockClear();
	});

	/**
	 * Enhance the page with a fake `IntersectionObserver` installed.
	 *
	 * @returns The page, and the observer the benchmark widget watches the viewport with.
	 */
	function enhanceWatched(): { readonly page: HTMLElement; readonly watcher: FakeObserver | undefined } {
		const observers = installObserver();
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		// Constructed after the figures' observers and before the scroll-spy's.
		return { page, watcher: observers.at(-2) };
	}

	it('is not fetched while the widget is far from the viewport', async () => {
		const { watcher } = enhanceWatched();

		expect(watcher?.observedIds).toEqual(['']);
		await Promise.resolve();
		expect(loadWineCorpus).not.toHaveBeenCalled();
	});

	it('is fetched once the widget nears the viewport, and measures the configuration on screen', async () => {
		const { watcher } = enhanceWatched();

		watcher?.emit([{ id: '', ratio: 1 }]);

		await vi.waitFor(() => {
			expect(measureConfig).toHaveBeenCalledTimes(1);
		});
		expect(loadWineCorpus).toHaveBeenCalledTimes(1);
		expect(vi.mocked(measureConfig).mock.calls[0]?.[1]).toEqual({ bitmap: true, exclusionGraph: true, memoization: true });
	});

	it('is fetched as soon as the widget is used, before it nears the viewport', async () => {
		const { page } = enhanceWatched();

		page.querySelector<HTMLButtonElement>('[role="switch"]')?.click();

		await vi.waitFor(() => {
			expect(loadWineCorpus).toHaveBeenCalledTimes(1);
		});
	});

	it('is fetched at once where there is no IntersectionObserver', async () => {
		enhanceHowItWorksPage(mountPrerenderedPage(), DEV_LOCATION);

		await vi.waitFor(() => {
			expect(loadWineCorpus).toHaveBeenCalledTimes(1);
		});
	});

	it('leaves the reference numbers standing when it fails to load, and "retry live" fetches it again', async () => {
		vi.mocked(loadWineCorpus).mockRejectedValueOnce(new Error('offline'));

		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);
		await vi.waitFor(() => {
			expect(loadWineCorpus).toHaveBeenCalledTimes(1);
		});
		// Let the rejection settle (a macrotask runs after every pending microtask).
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(page.querySelector('.fe-bench__status')?.textContent).toContain('reference bench');
		expect(page.querySelector<HTMLElement>('.fe-bench__retry')?.hidden).toBe(false);

		page.querySelector<HTMLButtonElement>('.fe-bench__retry')?.click();

		await vi.waitFor(() => {
			expect(loadWineCorpus).toHaveBeenCalledTimes(2);
		});
	});

	it('places the live bar by transform, never by width', () => {
		const page = mountPrerenderedPage();

		enhanceHowItWorksPage(page, DEV_LOCATION);

		const liveBar = page.querySelector<HTMLElement>('.fe-bench__bar.is-live');

		expect(liveBar?.style.width).toBe('');
		expect(liveBar?.style.transform).toMatch(/^translateX\(-\d+(?:\.\d+)?%\)$/u);
		expect(liveBar?.style.opacity).toBe('1');
	});
});
