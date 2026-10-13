/**
 * The composed app shell — header, sidebar, results column, footer, and the mobile filter drawer.
 *
 * @remarks
 * Everything here is dataset-neutral. Books and real estate need the same header, the same footer,
 * the same brand link and the same drawer over a different panel and a different grid; a second copy
 * would be the file where one route's "Filters" button quietly stops matching the other's.
 *
 * ### The `fe-books-app__*` prefix is a documented misnomer
 *
 * Header, footer, brand and filters-toggle are the SHARED app chrome every vertical composes, and
 * `ui-styles` says so at the class definitions. Do not copy them under a per-dataset prefix. What
 * genuinely differs between the two datasets is the MAIN layout, which is why {@link AppShellLayout}
 * exists: books is a flex row (`.fe-books-app__main`), real estate is a two-column grid whose filter
 * column is a sticky card capped at `calc(100vh - 2rem)` (`.fe-sidebar-app__main`).
 *
 * ### The drawer wrapper is toggled by ATTRIBUTE, and that is not a style choice
 *
 * `.fe-filter-collapse` is authored in `ui-styles` as `:not([hidden])` — deliberately, because an
 * unconditional `display` would beat the `hidden` attribute, which is only a UA rule. So the wrapper
 * MUST be driven with `toggleAttribute('hidden', …)`.
 *
 * **It must NOT use this app's `setHidden()` helper**, which is the opposite convention and exists
 * for the opposite reason: `setHidden` writes an inline `display` precisely BECAUSE the `[hidden]`
 * UA rule loses to any authored class `display`. Used here it would set `display: none` and, when
 * cleared, leave the wrapper as a plain block — severing the flex height chain from the aside's
 * `max-height` down to the panel scroller, so the scroller never bounds and the bottom sections
 * become unreachable — the same unbounded-scroller failure a missing class produces, arrived at from
 * the other direction.
 *
 * @packageDocumentation
 */

import { el, svg } from '../dom.js';
import { type DesktopBreakpoint } from '../viewport/desktopBreakpoint.js';

/** Which main-column layout the route wants. */
export type AppShellLayout = 'books' | 'sidebar';

/** The mounted shell. */
export interface AppShell {
	/** The app root element. */
	readonly element: HTMLElement;
	/** Re-read the breakpoint and repaint the drawer. Wire this to the breakpoint's `subscribe`. */
	readonly syncPanelVisibility: () => void;
}

/** Construction options for {@link createAppShell}. */
export interface AppShellOptions {
	/** The breakpoint tracker driving the drawer. */
	readonly breakpoint: DesktopBreakpoint;
	/** Footer caption — spells out the wiring, so routes are distinguishable at a glance. */
	readonly footnote: string;
	/** Extra nodes for the header's right-hand control cluster (URL-format toggle, copy link). */
	readonly headerControls?: readonly HTMLElement[];
	/** Which main-column layout to use. */
	readonly layout: AppShellLayout;
	/** The filter panel's root element. */
	readonly panelElement: HTMLElement;
	/** The results header (pills + count). */
	readonly resultsHeaderElement: HTMLElement;
	/**
	 * An optional element between the results header and the grid.
	 *
	 * @remarks
	 * The devtools panel, in practice. It belongs in the document FLOW rather than over the grid: the
	 * point of scrubbing the timeline is watching the results change, and an overlay hides the thing
	 * you are scrubbing to see.
	 */
	readonly resultsInsetElement?: HTMLElement;
	/** The scrollable results grid. */
	readonly resultsGridElement: HTMLElement;
	/** Subtitle under the wordmark — names the dataset and the surface driving this route. */
	readonly subtitle: string;
}

/**
 * The hamburger glyph on the mobile filters toggle.
 *
 * @internal
 */
function filtersIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			fill: 'none',
			height: 18,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 18,
		},
		[svg('path', { d: 'M3 5h18M6 12h12M10 19h4' })],
	);
}

/**
 * Build the app shell around a panel and a results region.
 *
 * @param options - Layout, labelling, and the elements to compose.
 * @returns The mounted shell plus the drawer sync callback.
 */
export function createAppShell(options: AppShellOptions): AppShell {
	const {
		breakpoint,
		footnote,
		headerControls = [],
		layout,
		panelElement,
		resultsGridElement,
		resultsHeaderElement,
		resultsInsetElement,
		subtitle,
	} = options;

	const toggleLabel = el('span', { text: 'Filters' });
	const filtersToggle = el('button', {
		attrs: { type: 'button' },
		children: [filtersIcon(), toggleLabel],
		className: 'fe-books-app__filters-toggle',
		on: {
			click: () => {
				breakpoint.toggleFilters();
			},
		},
	});

	// See the class remarks: ATTRIBUTE, never `setHidden`.
	const collapse = el('div', { children: [panelElement], className: 'fe-filter-collapse' });

	const syncPanelVisibility = (): void => {
		const isDesktop = breakpoint.isDesktop();

		filtersToggle.style.display = isDesktop ? 'none' : '';
		filtersToggle.setAttribute('aria-expanded', String(breakpoint.isFilterOpen()));
		toggleLabel.textContent = breakpoint.isFilterOpen() ? 'Hide filters' : 'Filters';
		collapse.toggleAttribute('hidden', !breakpoint.shouldShowPanel());
	};

	syncPanelVisibility();

	const element = el('div', {
		children: [
			el('header', {
				children: [
					el('a', {
						attrs: { 'aria-label': 'Filter EngineZ — back to the dataset hub', href: '/' },
						children: [
							el('img', {
								attrs: { alt: '', height: 36, src: '/mark.svg', width: 36 },
								className: 'fe-books-app__mark',
							}),
							el('span', {
								children: [
									el('span', { className: 'fe-books-app__name', text: 'Filter EngineZ' }),
									el('span', { className: 'fe-books-app__subtitle', text: subtitle }),
								],
								className: 'fe-books-app__wordmark',
							}),
						],
						className: 'fe-books-app__brand',
					}),
					el('div', { children: [...headerControls], className: 'fe-books-app__url-controls' }),
				],
				className: 'fe-books-app__header',
			}),
			el('main', {
				children: [
					el('aside', {
						children: [filtersToggle, collapse],
						className: layout === 'sidebar' ? 'fe-sidebar-app__filters' : 'fe-books-app__sidebar',
					}),
					el('section', {
						children: [resultsHeaderElement, resultsInsetElement, resultsGridElement],
						className: layout === 'sidebar' ? 'fe-sidebar-app__results' : 'fe-books-app__results',
					}),
				],
				className:
					layout === 'sidebar' ? 'fe-books-app__main fe-sidebar-app__main' : 'fe-books-app__main',
			}),
			el('footer', {
				children: [
					el('span', { text: footnote }),
					el('span', { children: ['data via ', el('code', { text: '@filter-enginez/mock-data' })]}),
				],
				className: 'fe-books-app__footer',
			}),
		],
		className: 'fe-books-app',
	});

	return { element, syncPanelVisibility };
}
