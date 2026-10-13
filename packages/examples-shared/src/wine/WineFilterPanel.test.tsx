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

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { type Wine, wines } from '@filter-enginez/mock-data/wine';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

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

/**
 * Mount the panel over a real engine.
 *
 * @param seed - Optional callback to apply rules before mounting.
 * @returns The engine core, so a test can assert against it.
 */
function renderPanel(seed?: (core: ReturnType<typeof createFilterEngine<Wine>>) => void): void {
	const core = createFilterEngine<Wine>({ sourceData: CORPUS });

	seed?.(core);

	render(
		<FilterEngineProvider engine={createSignalsEngine(core)}>
			<WineFilterPanel />
		</FilterEngineProvider>,
	);
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
		// `isHeaderVisible={false}` is what the mobile drawer passes, because `<FilterDrawer />`
		// supplies its own titled header and two would stack.
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
