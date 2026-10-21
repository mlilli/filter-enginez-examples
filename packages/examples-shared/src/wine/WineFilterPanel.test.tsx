/**
 * Rendering tests for the shared wine filter panel.
 *
 * @remarks
 * Both React apps render this one shared panel and its twelve sections, so these tests cover the
 * surface once for both.
 *
 * The panel is an assembler: it derives vocabularies from the corpus, provides the predictive-disable
 * bundle, and stacks the sections. So the assertions are about ASSEMBLY, not about any one control —
 * that every section mounts against a real engine, that chips reflect real corpus values rather than
 * a hardcoded list, and that predictive disable reaches the chips. Individual control behavior
 * belongs to `react-ui`'s own suite.
 */

import { createFilterEngine, inSet, numCompare, range } from '@filter-enginez/core';
import { type Wine, wines } from '@filter-enginez/mock-data/wine';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { deriveSelectedPresetIds } from './smartFilters.js';
import { deriveWineFacets, rankWineVarietals } from './wine-domain/facets.js';
import { BODY_ORDER, COLOR_ORDER, VARIETAL_CHIP_LIMIT, visibleVarietalChips } from './wine-domain/filterConfig.js';
import { WINE_ORIGIN_TREE, WINE_SEARCHES, WINE_SLIDER_COPY, wineSearchRule } from './wine-domain/panelCopy.js';
import { WineFilterPanel } from './WineFilterPanel.js';

beforeAll(() => {
	// The panel mounts range sliders, and Radix's `react-use-size` observes the thumb with a
	// ResizeObserver that jsdom does not implement — without the stub every test here dies at mount
	// with `ResizeObserver is not defined`. Same shim as `react-ui`'s own RangeSlider suite; the
	// no-op is enough because these tests assert structure, not geometry.
	globalThis.ResizeObserver = class {
		disconnect = (): void => undefined;
		observe = (): void => undefined;
		unobserve = (): void => undefined;
	};
	HTMLElement.prototype.hasPointerCapture = () => false;
	HTMLElement.prototype.setPointerCapture = () => undefined;
	HTMLElement.prototype.releasePointerCapture = () => undefined;
});

// No auto-cleanup in this workspace (no `globals: true`), so trees would otherwise accumulate.
afterEach(cleanup);

/** A small deterministic slice — the panel derives vocabularies, so it needs real-shaped rows. */
const CORPUS: readonly Wine[] = wines.slice(0, 400);

/** The synchronous wine engine core. */
type WineCore = ReturnType<typeof createFilterEngine<Wine>>;

/**
 * Mount the panel over a real engine.
 *
 * @param seed - Optional callback to apply rules before mounting.
 * @returns The engine core, so a test can assert against it.
 */
function renderPanel(seed?: (core: WineCore) => void): WineCore {
	const core = createFilterEngine<Wine>({ sourceData: CORPUS });

	seed?.(core);

	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<WineFilterPanel />
		</FilterEngineProvider>,
	);

	return core;
}

/**
 * The first chip button carrying a label, from the facet sections.
 *
 * @param label - The chip's visible label, e.g. `red`.
 * @returns The chip button.
 */
function facetChip(label: string): HTMLButtonElement {
	const button = screen.getAllByText(label)[0]?.closest('button');

	expect(button).not.toBeNull();

	return button as HTMLButtonElement;
}

describe('<WineFilterPanel />', () => {
	it('mounts every section against a real engine', () => {
		// The assembly assertion. Twelve sections each subscribe to engine state and derive their own
		// vocabulary; a throw in any one takes the whole panel down, and nothing else in the suite
		// would catch it.
		renderPanel();

		// Chip facets render through `<SectionHeader />`.
		for (const label of ['Color', 'Body', 'Sweetness']) {
			expect(screen.getByText(label, { selector: 'h3, h4' })).toBeDefined();
		}

		// Slider facets label themselves inside the control rather than with a section heading, so
		// they are asserted by presence rather than by element. Checking both kinds matters: the
		// sliders are the sections that need the ResizeObserver stub, so a regression there would
		// otherwise look like a passing test.
		for (const label of ['Points', 'Price', 'Vintage']) {
			expect(screen.getAllByText(new RegExp(label, 'i')).length).toBeGreaterThan(0);
		}
	});

	it('renders its own header by default and suppresses it on request', () => {
		// `isHeaderVisible={false}` is for a host that supplies its own titled header, where two would
		// stack. Every app's sidebar keeps the default.
		renderPanel();
		expect(screen.queryByText('Filters')).not.toBeNull();

		cleanup();
		render(
			<FilterEngineProvider engine={createSignalsEngine(createFilterEngine<Wine>({ sourceData: CORPUS }))}>
				<WineFilterPanel isHeaderVisible={false} />
			</FilterEngineProvider>,
		);
		expect(screen.queryByText('Filters')).toBeNull();
	});

	it('derives chip vocabularies from the corpus rather than a hardcoded list', () => {
		// Every color present in the slice must appear as a chip. A hardcoded vocabulary would drift
		// silently the moment the dataset changed.
		renderPanel();

		for (const color of new Set(CORPUS.map((w) => w.color))) {
			expect(screen.getAllByText(color).length).toBeGreaterThan(0);
		}
	});

	it('disables a chip made unreachable by a DIFFERENT facet', () => {
		// The constraint has to come from another facet, which is the whole point of the
		// disjunctive/conjunctive distinction: an `inSet` group excludes its OWN rule when
		// projecting, so selecting `red` can never disable `white` — they widen the same set.
		// Sweetness does constrain color: no red or rosé wine in this slice is sweet.
		renderPanel((core) => {
			core.addRule('sweetness', inSet<string>('sweetness', ['sweet']));
		});

		// The chip is still RENDERED — never removed, only disabled, so the vocabulary stays
		// stable as the user filters — but it must not be selectable.
		const red = screen.getAllByText('red')[0]?.closest('button');

		expect(red).not.toBeNull();
		expect((red as HTMLButtonElement).disabled).toBe(true);
	});

	it('leaves reachable chips in the same group enabled', () => {
		// Guards the opposite failure: a panel that disabled everything would pass the test above.
		renderPanel((core) => {
			core.addRule('sweetness', inSet<string>('sweetness', ['sweet']));
		});

		const white = screen.getAllByText('white')[0]?.closest('button');

		expect((white as HTMLButtonElement).disabled).toBe(false);
	});

	it('leaves the already-selected chip clickable so the user can escape', () => {
		// The escape-hatch invariant: whatever else is active, the selected value must remain
		// clickable or a user can filter into a corner with no way out.
		renderPanel((core) => {
			core.addRule('sweetness', inSet<string>('sweetness', ['sweet']));
		});

		const sweet = screen.getAllByText('sweet')[0]?.closest('button');

		expect((sweet as HTMLButtonElement).disabled).toBe(false);
	});
});

describe('<WineFilterPanel /> — a smart-filter preset replaces the manual filters', () => {
	it('clears every manual facet rule before setting the expression, and the sections adopt the removal', () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('color', inSet<string>('color', ['red']));
			seeded.addRule('price', range('priceUsd', { max: 40, min: 10 }));
		});

		expect(facetChip('red').getAttribute('aria-pressed')).toBe('true');

		fireEvent.click(screen.getByRole('button', { name: 'Bold reds' }));

		// Only the expression is left: no dormant rule waiting behind it in `?f`, the action log, or the
		// facet controls.
		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds']);
		// The color section adopted its rule's removal on its own; nothing blanked it by hand.
		expect(facetChip('red').getAttribute('aria-pressed')).toBe('false');
	});

	it('drops the active preset before a facet edit commits, so the engine accepts the flat rule', async () => {
		// The window this closes: on the worker tier the sections lock (`inert`) only once the engine's
		// MODE reports expression, a round trip after the preset click. jsdom dispatches the click even
		// though the body is already inert here, which is what lets the test reach the same state on a
		// synchronous engine. Without the leave, `addRule` would throw MODE_EXPRESSION_ACTIVE.
		const core = renderPanel();

		fireEvent.click(screen.getByRole('button', { name: 'Bold reds' }));
		expect(core.getExpression()).not.toBeNull();

		fireEvent.click(facetChip('white'));

		expect(core.getExpression()).toBeNull();
		expect(screen.getByRole('button', { name: 'Bold reds' }).getAttribute('aria-pressed')).toBe('false');
		await waitFor(() => {
			expect((core.getRule('color') as { config: { set: readonly string[] }} | undefined)?.config.set).toEqual(['white']);
		});
	});

	it('writes no expression at all when a facet is edited with no preset lit', async () => {
		// The guard keeps a flat-map panel's every slider drag off the action log.
		const core = renderPanel();
		const setExpression = vi.spyOn(core, 'setExpression');

		fireEvent.click(facetChip('white'));

		await waitFor(() => {
			expect(core.getRule('color')).toBeDefined();
		});
		expect(setExpression).not.toHaveBeenCalled();
	});
});

describe('<WineFilterPanel /> — the behavior every app shares', () => {
	it('removes the rule when the last chip is deselected, rather than writing an empty set', async () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('color', inSet<string>('color', ['red']));
		});
		const removeRule = vi.spyOn(core, 'removeRule');

		fireEvent.click(facetChip('red'));

		// Painted at once, ahead of the engine.
		expect(facetChip('red').getAttribute('aria-pressed')).toBe('false');
		await waitFor(() => {
			expect(core.getRule('color')).toBeUndefined();
		});
		expect(removeRule).toHaveBeenCalledWith('color');
	});

	it('labels chips with the raw values, in the design order, keeping only values the corpus carries', () => {
		renderPanel();

		const bodies = new Set(CORPUS.map((wine) => wine.body));
		const bodyChips = [...(screen.getByText('Body', { selector: 'h3' }).closest('section')?.querySelectorAll('.fe-chip') ?? [])]
			.map((chip) => chip.textContent);

		expect(bodyChips).toEqual(BODY_ORDER.filter((value) => bodies.has(value)));
		expect(bodyChips.some((label) => label.includes(' '))).toBe(false);
	});

	it('renders varietals as a scrollable chip group headed by the full varietal count, without counts', () => {
		renderPanel();

		const ranked = rankWineVarietals(CORPUS);
		const section = screen.getByText(`Varietal (${ranked.length})`, { selector: 'h3' }).closest('section') as HTMLElement;
		const group = section.querySelector('.fe-chip-toggle') as HTMLElement;

		expect(group.className).toContain('fe-chip-toggle--capped');
		expect(section.querySelector('input[type="checkbox"]')).toBeNull();
		expect(section.querySelector('.fe-chip__count')).toBeNull();
		expect([...group.querySelectorAll('.fe-chip')].map((chip) => chip.textContent)).toEqual(visibleVarietalChips(ranked, []));
	});

	it('keeps a selected varietal beyond the shortlist on screen, and removes the rule when it is cleared', async () => {
		const ranked = rankWineVarietals(CORPUS);
		const rare = ranked.at(-1) as string;

		expect(ranked.indexOf(rare)).toBeGreaterThanOrEqual(VARIETAL_CHIP_LIMIT);

		const core = renderPanel((seeded) => {
			seeded.addRule('varietal', inSet<string>('varietal', [rare]));
		});

		fireEvent.click(facetChip(rare));

		await waitFor(() => {
			expect(core.getRule('varietal')).toBeUndefined();
		});
	});

	it('names the slider thumbs from the shared copy', () => {
		renderPanel();

		for (const copy of Object.values(WINE_SLIDER_COPY)) {
			expect(screen.getByRole('slider', { name: `${copy.sliderLabel} lower bound` })).toBeDefined();
			expect(screen.getByRole('slider', { name: `${copy.sliderLabel} upper bound` })).toBeDefined();
		}
	});

	it('commits an open price maximum when the top thumb reaches the top of the track', async () => {
		const core = renderPanel();
		const field = screen.getByLabelText<HTMLInputElement>(`${WINE_SLIDER_COPY.price.label} lower bound (editable)`);
		const priceBaseline = deriveWineFacets(CORPUS).baselines.price;

		fireEvent.change(field, { target: { value: String(priceBaseline.min + 5) }});
		fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => {
			expect((core.getRule('price') as { config: { max: number; min: number }} | undefined)?.config).toEqual({
				max: Number.POSITIVE_INFINITY,
				min: priceBaseline.min + 5,
			});
		});
	});

	it('makes the origin tree a named group at the shared height', () => {
		renderPanel();

		const tree = screen.getByRole('group', { name: WINE_ORIGIN_TREE.groupLabel });

		expect(tree.style.getPropertyValue('--fe-tree-max-height')).toBe(WINE_ORIGIN_TREE.maxHeight);
	});

	it('paints a picked operator at once, then commits the comparison', async () => {
		const core = renderPanel();
		const operator = screen.getByLabelText<HTMLSelectElement>('Points comparison operator');

		fireEvent.change(operator, { target: { value: '>=' }});

		// Before the engine has been called: the pick is already on screen.
		expect(operator.value).toBe('>=');
		expect(core.getRule('points-compare')).toBeUndefined();
		await waitFor(() => {
			expect(core.getRule('points-compare')).toBeDefined();
		});
		expect(operator.value).toBe('>=');
	});

	it('commits the comparison threshold on change, not per keystroke', async () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('points-compare', numCompare('points', { op: '>=', value: 90 }));
		});
		const threshold = screen.getByLabelText<HTMLInputElement>('Points comparison threshold');
		const addRule = vi.spyOn(core, 'addRule');

		fireEvent.input(threshold, { target: { value: '9' }});
		fireEvent.input(threshold, { target: { value: '95' }});
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		expect(addRule).not.toHaveBeenCalled();

		fireEvent.blur(threshold);
		await waitFor(() => {
			expect((core.getRule('points-compare') as { config: { value: number }} | undefined)?.config.value).toBe(95);
		});
		expect(addRule).toHaveBeenCalledTimes(1);
	});

	it('offers the corpus colors in the single-color menu and paints a pick at once', async () => {
		const core = renderPanel();
		const menu = screen.getByLabelText<HTMLSelectElement>('Filter by exact wine color');
		const colors = new Set(CORPUS.map((wine) => wine.color));

		expect([...menu.options].slice(1).map((option) => option.value)).toEqual(COLOR_ORDER.filter((color) => colors.has(color)));

		fireEvent.change(menu, { target: { value: 'white' }});

		expect(menu.value).toBe('white');
		await waitFor(() => {
			expect(core.getRule('color-value')).toBeDefined();
		});
	});

	it('words the searches from the shared copy and removes the rule when a search is cleared', async () => {
		const core = renderPanel((seeded) => {
			seeded.addRule('notes', wineSearchRule('notes', 'oak'));
		});
		const notes = screen.getByLabelText<HTMLInputElement>(WINE_SEARCHES.notes.ariaLabel);

		expect(notes.placeholder).toBe(WINE_SEARCHES.notes.placeholder);
		expect(screen.getByLabelText(WINE_SEARCHES.winery.ariaLabel)).toBeDefined();
		expect(notes.value).toBe('oak');

		fireEvent.change(notes, { target: { value: '' }});
		fireEvent.blur(notes);

		await waitFor(() => {
			expect(core.getRule('notes')).toBeUndefined();
		});
	});

	it('writes the shared fuzzy rule for a non-empty search', async () => {
		const core = renderPanel();
		const winery = screen.getByLabelText<HTMLInputElement>(WINE_SEARCHES.winery.ariaLabel);

		fireEvent.change(winery, { target: { value: 'caruso' }});
		fireEvent.keyDown(winery, { key: 'Enter' });

		await waitFor(() => {
			expect((core.getRule('winery') as { config: { query: string; threshold: number }} | undefined)?.config).toMatchObject({
				query: 'caruso',
				threshold: WINE_SEARCHES.winery.threshold,
			});
		});
	});
});
