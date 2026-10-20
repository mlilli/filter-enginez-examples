/**
 * Functional-parity tests for the framework-less wine view and its thirteen-section panel.
 *
 * @remarks
 * Mirrors `books/view.test.ts` and `real-estate/view.test.ts`: mount the real view over a mini
 * corpus and drive the REAL engine through the same write path the app uses, so a green run means
 * the hand-written DOM commits and reads the same engine state the other five verticals do.
 *
 * ### What is different here, and it is the point of the file
 *
 * The other two vanilla panels hold no state — they repaint from the engine's rule map, so a test
 * that clicks and then asserts is testing one thing. **This panel paints locally and adopts the
 * engine's value separately**, because `/wine` is worker-backed and the rule map lags a round trip.
 * That is two mechanisms, and the interesting failures live in the seam between them:
 *
 *   - a click that paints but does not commit looks right and filters nothing;
 *   - a repaint that adopts unconditionally snaps the control back to the pre-click value, which is
 *     invisible on the main thread and glaring over a worker.
 *
 * The engine here IS main-thread, so the second failure cannot be reproduced by mounting alone. It
 * is covered directly against the adopter in `facetState.test.ts`, and the cases below assert the
 * half a mounted panel can see: that a click reaches the engine, and that a repaint carrying a
 * STALE rule map does not undo it.
 *
 * ### The clear-to-remove contract
 *
 * Deselecting the last chip must REMOVE the rule, not write an empty one. An `InSetRule` with an
 * empty set still participates in the AND and matches nothing, so the wrong version filters to zero
 * on deselect-everything and looks, on screen, exactly like a filter that works — until the count
 * hits zero with no chip to explain it.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, type InSetRule } from '@filter-enginez/core';
import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { describe, expect, it } from 'vitest';

import { makeWine } from '../test-support/wineFixture.js';
import { createWineView, type WineView } from './view.js';
import { wineCard } from './wineCard.js';

/** Four wines across two colors, two bodies and a price spread, so the facets bite. */
const DATA: readonly Wine[] = [
	makeWine({ id: 'a', priceUsd: 20 }),
	makeWine({ body: 'light', color: 'white', id: 'b', points: 85, priceUsd: 40, vintage: 2020 }),
	makeWine({ id: 'c', points: 95, priceUsd: 60, varietal: 'Nebbiolo' }),
	makeWine({ color: 'white', id: 'd', priceUsd: 80, vintage: 2015, winery: 'Caruso' }),
];

/** The engine, the mounted view, and a repaint the caller can drive by hand. */
interface MountedWineView {
	readonly core: FilterEngine<Wine>;
	/** Repaint the panel from the engine, as the route's bundle-settle handler does. */
	readonly repaint: () => void;
	readonly root: HTMLElement;
	/** The view itself, so a case can push a state the engine would not currently produce. */
	readonly view: WineView;
}

/**
 * Mount the view over a fresh engine.
 *
 * @remarks
 * The repaint is NOT subscribed to the engine, deliberately. The route repaints on the bundle
 * fetch's terminal outcome rather than on `activeRules`, and driving it by hand is what lets a case
 * repaint with a stale rule map — the worker-lag shape this panel exists to survive.
 *
 * The bundle is `null` throughout: predictive disable is an ENHANCEMENT, and every control must
 * render all-enabled without one.
 *
 * @param data - The corpus to boot over.
 * @returns The mounted handle.
 */
function mountView(data: readonly Wine[] = DATA): MountedWineView {
	const core = createFilterEngine<Wine>({ sourceData: data });
	const view = createWineView(core, { footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);

	const repaint = (): void => {
		const expression = core.getExpression();

		view.setCount(core.getResultCount(), data.length);
		view.setResults(core.getResults());
		view.setRules(core.getRules(), null, expression !== null);
		view.setPanelState({ bundle: null, expression, isComputing: false, rules: core.getRules() });
	};

	repaint();

	return { core, repaint, root, view };
}

/** The chip button whose visible text starts with `label` (throws if absent, so callers avoid `!`). */
function chipByText(root: HTMLElement, label: string): HTMLElement {
	const node = [...root.querySelectorAll<HTMLElement>('.fe-chip')].find((chip) =>
		chip.textContent.trim().startsWith(label),
	);

	if (node === undefined) {
		throw new Error(`No chip labelled ${label}`);
	}

	return node;
}

/** Every section heading rendered in the panel body, in order. */
function sectionLabels(root: HTMLElement): readonly string[] {
	return [
		...root.querySelectorAll<HTMLElement>('.fe-filter-panel__body .fe-filter-section-label'),
	].map((node) => node.textContent.trim());
}

describe('vanilla wine panel', () => {
	it('renders the thirteen sections in the canonical order', () => {
		const { root } = mountView();
		const labels = sectionLabels(root);
		// The four sliders draw their own labels rather than a section `<h3>`, so the headings below
		// are the nine that carry one. Counted against the SECTION elements as well, because a slider
		// that lost its wrapper would leave this list unchanged.
		const sections = root.querySelectorAll('.fe-filter-panel__body > section');

		expect(sections).toHaveLength(13);
		expect(labels).toEqual([
			'Score comparison',
			'Color',
			'Single color (exact)',
			'Varietal (2)',
			'Origin',
			'Body',
			'Sweetness',
			'Tasting notes search',
			'Winery (typo-tolerant)',
		]);
	});

	it('puts the smart filters inside the scroller but OUTSIDE the dimmable body', () => {
		// The one structural rule of this panel: the presets must stay interactive while the sections
		// dim and lock, because they are the only way back out of expression mode.
		const { root } = mountView();
		const strip = root.querySelector('.fe-filter-panel__scroller > .fe-filter-panel__section--divided');

		expect(strip).not.toBeNull();
		expect(strip?.closest('.fe-filter-panel__body')).toBeNull();
	});

	it('commits a chip click to the engine and keeps it painted across a repaint', () => {
		const { core, repaint, root } = mountView();

		chipByText(root, 'white').click();

		expect((core.getRules().get('color') as InSetRule<string>).config.set).toEqual(['white']);
		expect(core.getResultCount()).toBe(2);

		repaint();

		expect(chipByText(root, 'white').getAttribute('aria-pressed')).toBe('true');
	});

	it('does not un-paint a click when a repaint carries a STALE rule map', () => {
		// The worker-lag shape, reproduced on a main-thread engine: paint, then repaint from the rule
		// map as it was BEFORE the click. An adopter that took the committed value unconditionally
		// would clear the chip here — which over a worker is what EVERY click would look like, since
		// the settle in flight when the user clicks always carries the pre-click state.
		const { core, root, view } = mountView();
		// Copied, not aliased: `getRules()` may hand back the engine's live map, and a live map would
		// contain the click by the time it is read back — the test would then pass without asserting
		// anything.
		const stale = new Map(core.getRules());

		chipByText(root, 'white').click();
		view.setPanelState({ bundle: null, expression: null, isComputing: false, rules: stale });

		expect(stale.has('color')).toBe(false);
		expect(chipByText(root, 'white').getAttribute('aria-pressed')).toBe('true');
	});

	it('REMOVES the rule when the last chip is deselected', () => {
		// Not an empty `InSetRule` — that matches nothing, so the corpus would not come back. This is
		// the only way that bug shows up in a test.
		const { core, repaint, root } = mountView();

		chipByText(root, 'white').click();
		repaint();
		chipByText(root, 'white').click();

		expect(core.getRules().has('color')).toBe(false);
		expect(core.getResultCount()).toBe(DATA.length);
	});

	it('applies a smart-filter preset as an expression and pauses the manual sections', () => {
		const { core, repaint, root } = mountView();
		const body = root.querySelector('.fe-filter-panel__body');

		chipByText(root, 'Bold reds').click();
		repaint();

		expect(core.getExpression()).not.toBeNull();
		expect(body?.classList.contains('fe-filter-panel__body--expression')).toBe(true);
		expect(body?.hasAttribute('inert')).toBe(true);
	});

	it('leaves expression mode when a facet is edited', () => {
		// Editing a facet is a statement that the user is back in flat-map mode. An expression left
		// installed alongside would AND with the new rule, narrowing the results below what either
		// describes with nothing on screen explaining why.
		const { core, repaint, root } = mountView();

		chipByText(root, 'Bold reds').click();
		repaint();
		chipByText(root, 'white').click();
		repaint();

		expect(core.getExpression()).toBeNull();
		expect((core.getRules().get('color') as InSetRule<string>).config.set).toEqual(['white']);
	});

	it('a preset applied over a manual facet leaves only the expression, and the facet adopts the removal', () => {
		const { core, repaint, root } = mountView();

		chipByText(root, 'white').click();
		repaint();
		expect(chipByText(root, 'white').getAttribute('aria-pressed')).toBe('true');

		chipByText(root, 'Bold reds').click();
		repaint();

		expect([...core.getRules().keys()]).toEqual([]);
		expect(core.getExpression()).not.toBeNull();
		expect(chipByText(root, 'white').getAttribute('aria-pressed')).toBe('false');
	});

	it('the smart-filter pill\'s × leaves expression mode, where removing a rule by its id would do nothing', () => {
		const { core, repaint, root } = mountView();

		chipByText(root, 'Bold reds').click();
		repaint();
		root.querySelector<HTMLElement>('.fe-filter-chip__remove')?.click();
		repaint();

		expect(core.getExpression()).toBeNull();
		expect(chipByText(root, 'Bold reds').getAttribute('aria-pressed')).toBe('false');
	});

	it('a facet pill\'s × removes only that facet\'s rule', () => {
		const { core, repaint, root } = mountView();

		chipByText(root, 'white').click();
		repaint();
		root.querySelector<HTMLElement>('.fe-filter-chip__remove')?.click();

		expect(core.getRules().has('color')).toBe(false);
	});

	it('"Clear all" drops every flat facet AND expression mode', () => {
		const { core, repaint, root } = mountView();

		chipByText(root, 'white').click();
		repaint();
		root.querySelector<HTMLElement>('.fe-active-filters__clear')?.click();
		expect([...core.getRules().keys()]).toEqual([]);

		chipByText(root, 'Bold reds').click();
		repaint();
		root.querySelector<HTMLElement>('.fe-active-filters__clear')?.click();

		expect(core.getExpression()).toBeNull();
	});

	it('does not dim the body for a recompute while a preset is driving the results', () => {
		// `--busy` and `--expression` mean different things — one is transient, one is chosen — and
		// stacking them reads as a recompute that never ends.
		const { core, root, view } = mountView();

		view.setPanelState({ bundle: null, expression: null, isComputing: true, rules: core.getRules() });

		const body = root.querySelector('.fe-filter-panel__body');

		expect(body?.classList.contains('fe-filter-panel__body--busy')).toBe(true);
		// `inert` is expression-mode ONLY: it blurs whatever is focused inside, which on a transient
		// state would drop a keyboard user at the top of the document mid-filter.
		expect(body?.hasAttribute('inert')).toBe(false);
	});

	it('repaints the drawer when the breakpoint notifies', () => {
		// The view subscribes the shell's `syncPanelVisibility` to the breakpoint, and nothing
		// exercised that wiring: every assertion above reads the panel at its boot state. jsdom has no
		// `matchMedia`, so the tracker boots desktop — the toggle is the one channel that still
		// notifies, and it is the same subscriber either way.
		const { root } = mountView();
		const collapse = root.querySelector('.fe-filter-collapse');
		const toggle = root.querySelector<HTMLElement>('.fe-books-app__filters-toggle');

		expect(collapse?.hasAttribute('hidden')).toBe(false);

		toggle?.click();

		// Desktop plus the drawer flag flipped off still shows the panel — `shouldShowPanel` is a
		// disjunction — so what this proves is that the subscriber RAN and repainted from live state.
		expect(toggle?.getAttribute('aria-expanded')).toBe('false');
		expect(collapse?.hasAttribute('hidden')).toBe(false);
	});
});

describe('wineCard', () => {
	it('omits the tasting-notes row entirely when a wine carries none', () => {
		// Every wine in the fixture above has notes, so the empty arm was unreachable from the
		// mounted suite. An empty `<div>` here would still take its grid row and its margin.
		const withNotes = wineCard(makeWine({ id: 'n', tastingNotes: ['cherry', 'oak']}));
		const without = wineCard(makeWine({ id: 'm', tastingNotes: []}));

		expect(withNotes.querySelectorAll('.fe-wine-card__note')).toHaveLength(2);
		expect(withNotes.querySelector('.fe-wine-card__notes')).not.toBeNull();
		expect(without.querySelector('.fe-wine-card__notes')).toBeNull();
	});
});
