/**
 * Tests for `<ResultsHeaderView />` — the prop-driven results strip (active-filter chips + ticking
 * result count + computing indicator).
 *
 * @remarks
 * jsdom render via `createElement`. The `useTickingNumber` rAF animation is driven deterministically
 * by stubbing `requestAnimationFrame` (capturing the frame callbacks) + `performance.now` (a manual
 * clock), then flushing frames inside `act()`. All other paths are plain prop-driven renders. The
 * `NeuralCluster` / `SynapticOrbit` icons come from `@filter-enginez/brand` (already covered there).
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type FilterSummary, ResultsHeaderView, type ResultsHeaderViewProps } from './ResultsHeaderView.js';

afterEach(cleanup);

/** Two active-filter summaries: one text chip, one numeric chip. */
const SUMMARIES: readonly FilterSummary[] = [
	{ isNumeric: false, label: 'Region', ruleId: 'region', value: 'Napa' },
	{ isNumeric: true, label: 'Price', ruleId: 'price', value: '$20+' },
];

/** A full, valid prop set with the supplied overrides (fresh callback spies each call). */
function props(overrides: Partial<ResultsHeaderViewProps> = {}): ResultsHeaderViewProps {
	return {
		isFetching: false,
		onClearAll: vi.fn(),
		onRemoveRule: vi.fn(),
		resultCount: 100,
		summaries: SUMMARIES,
		totalCount: 100,
		...overrides,
	};
}

/** Render with base props + overrides. */
function renderHeader(overrides: Partial<ResultsHeaderViewProps> = {}): ReturnType<typeof render> {
	return render(createElement(ResultsHeaderView, props(overrides)));
}

/** The big result-count number element. */
function numberEl(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>('.fe-result-count__number');
}

describe('ResultsHeaderView', () => {
	it('shows the empty-state message when no filters are active', () => {
		renderHeader({ summaries: []});

		expect(screen.getByText(/No filters active/)).not.toBeNull();
	});

	it('pluralizes the active-filter count (plural vs singular)', () => {
		const { rerender } = renderHeader();

		expect(screen.getByText('2 filters')).not.toBeNull();

		rerender(
			createElement(
				ResultsHeaderView,
				props({ summaries: [{ isNumeric: false, label: 'Region', ruleId: 'region', value: 'Napa' }]}),
			),
		);
		expect(screen.getByText('1 filter')).not.toBeNull();
	});

	it('flags the numeric + recently-changed chip and leaves the others plain', () => {
		renderHeader({ recentlyChangedRuleId: 'price' });

		// Price chip: numeric value + recent emphasis.
		const priceValue = screen.getByText('$20+');

		expect(priceValue.className).toContain('fe-filter-chip__value--numeric');
		expect(priceValue.closest('.fe-filter-chip')?.className).toContain('fe-filter-chip--recent');

		// Region chip: neither numeric nor recent.
		const regionValue = screen.getByText('Napa');

		expect(regionValue.className).not.toContain('fe-filter-chip__value--numeric');
		expect(regionValue.closest('.fe-filter-chip')?.className).not.toContain('fe-filter-chip--recent');
	});

	it('fires onRemoveRule and onClearAll from the chip × and the Clear all link', () => {
		const onClearAll = vi.fn();
		const onRemoveRule = vi.fn();

		renderHeader({ onClearAll, onRemoveRule });
		fireEvent.click(screen.getByRole('button', { name: 'Remove Region filter' }));
		fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

		expect(onRemoveRule).toHaveBeenCalledWith('region');
		expect(onClearAll).toHaveBeenCalledTimes(1);
	});

	it('hides the delta pill at zero and renders down / up variants with the right sign', () => {
		const { container: zero } = renderHeader({ resultCount: 100, totalCount: 100 });

		expect(zero.querySelector('.fe-result-count__delta')).toBeNull();

		const { container: down } = renderHeader({ resultCount: 40, totalCount: 100 });
		const downPill = down.querySelector('.fe-result-count__delta');

		expect(downPill?.className).toContain('fe-result-count__delta--down');
		expect(downPill?.textContent).toBe('-60');

		const { container: up } = renderHeader({ resultCount: 150, totalCount: 100 });
		const upPill = up.querySelector('.fe-result-count__delta');

		expect(upPill?.className).toContain('fe-result-count__delta--up');
		expect(upPill?.textContent).toBe('+50');
	});

	it('renders the redux-mirror badge (right after Clear all) only when mirrorActiveCount is supplied', () => {
		const { container: without } = renderHeader();

		expect(without.querySelector('.fe-active-filters__mirror')).toBeNull();

		const { container: withBadge } = renderHeader({ mirrorActiveCount: 3 });
		const badge = withBadge.querySelector('.fe-active-filters__mirror');

		expect(badge?.textContent).toContain('3 active');
		// It lives in the active-filters row, immediately following the "Clear all" button.
		expect(badge?.previousElementSibling?.textContent).toBe('Clear all');
	});

	it('places "filtered from N total" as its own count-row element, not inside the status', () => {
		const { container } = renderHeader({ resultCount: 40, totalCount: 100 });
		const total = container.querySelector('.fe-result-count__total');

		expect(total?.textContent).toBe('filtered from 100 total');
		// It's a direct child of the count row (a sibling of the status), so the CSS can float it
		// onto its own line beneath the count rather than tucking it beside the engine indicator.
		expect(total?.parentElement?.className).toBe('fe-result-count');
		expect(container.querySelector('.fe-result-count__status .fe-result-count__total')).toBeNull();
	});

	it('names the count with the default noun, or the one the dataset passes', () => {
		const { container: plain } = renderHeader();

		expect(plain.querySelector('.fe-result-count__label')?.textContent).toBe('results');

		cleanup();
		const { container: wine } = renderHeader({ noun: 'bottles' });

		expect(wine.querySelector('.fe-result-count__label')?.textContent).toBe('bottles');
	});

	it('draws the computing indicator icon at 30px, as the other apps do', () => {
		const { container: idle } = renderHeader({ isFetching: false });

		expect(idle.querySelector('.fe-computing-indicator__icon svg')?.getAttribute('width')).toBe('30');

		cleanup();
		const { container: busy } = renderHeader({ isFetching: true });

		expect(busy.querySelector('.fe-computing-indicator__icon svg')?.getAttribute('width')).toBe('30');
	});

	it('drives the computing indicator from isFetching (idle vs computing)', () => {
		const { container: idle } = renderHeader({ isFetching: false, resultCount: 100, totalCount: 100 });

		expect(numberEl(idle)?.className).not.toContain('fe-result-count__number--computing');
		expect(screen.getByLabelText('Engine idle')).not.toBeNull();

		cleanup();
		const { container: busy } = renderHeader({ isFetching: true, resultCount: 100, totalCount: 100 });

		expect(numberEl(busy)?.className).toContain('fe-result-count__number--computing');
		expect(screen.getByLabelText('Engine computing')).not.toBeNull();
	});

	it('rolls the count toward a new target across animation frames', () => {
		const frames: FrameRequestCallback[] = [];

		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => frames.push(cb));
		vi.stubGlobal('cancelAnimationFrame', () => undefined);
		let clock = 1000;
		const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

		const { container, rerender } = render(
			createElement(ResultsHeaderView, props({ resultCount: 100, summaries: [], totalCount: 500 })),
		);

		// Mount: from === target → no animation scheduled.
		expect(numberEl(container)?.textContent).toBe('100');
		expect(frames).toHaveLength(0);

		// Retarget → the effect schedules the first frame.
		act(() => {
			rerender(createElement(ResultsHeaderView, props({ resultCount: 200, summaries: [], totalCount: 500 })));
		});
		expect(frames).toHaveLength(1);

		// Frame at +300ms (p = 0.5 < 1): the number moves and stays "computing", schedules the next frame.
		act(() => {
			clock = 1300;
			frames.shift()?.(clock);
		});
		const mid = Number(numberEl(container)?.textContent);

		expect(mid).toBeGreaterThan(100);
		expect(mid).toBeLessThan(200);
		expect(numberEl(container)?.className).toContain('fe-result-count__number--computing');

		// Frame at +600ms (p = 1): lands on the target and clears "computing".
		act(() => {
			clock = 1600;
			frames.shift()?.(clock);
		});
		expect(numberEl(container)?.textContent).toBe('200');
		expect(numberEl(container)?.className).not.toContain('fe-result-count__number--computing');

		nowSpy.mockRestore();
		vi.unstubAllGlobals();
	});

	it('ends the roll when the target returns to the displayed value before the first frame', () => {
		// A → B → A with no frame in between: the screen still shows A, so there is nothing to roll to.
		// The computing indicator must clear rather than stay lit with no frame left to clear it.
		const frames: FrameRequestCallback[] = [];

		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => frames.push(cb));
		vi.stubGlobal('cancelAnimationFrame', () => undefined);

		const { container, rerender } = render(
			createElement(ResultsHeaderView, props({ resultCount: 100, summaries: [], totalCount: 500 })),
		);

		act(() => {
			rerender(createElement(ResultsHeaderView, props({ resultCount: 200, summaries: [], totalCount: 500 })));
		});
		expect(numberEl(container)?.className).toContain('fe-result-count__number--computing');

		act(() => {
			rerender(createElement(ResultsHeaderView, props({ resultCount: 100, summaries: [], totalCount: 500 })));
		});
		expect(numberEl(container)?.textContent).toBe('100');
		expect(numberEl(container)?.className).not.toContain('fe-result-count__number--computing');

		vi.unstubAllGlobals();
	});

	it('lands on the new count immediately when reduced motion is requested', () => {
		// The branch of useTickingNumber that matters most to the person it serves. jsdom has no
		// matchMedia, so without a stub `prefersReducedMotion()` is always false and this path is
		// unreachable from the suite. A regression here would keep animating for somebody who
		// explicitly asked their OS not to.
		//
		// A real matchMedia stub is used rather than mocking the brand module, so the actual predicate
		// runs — this covers the wiring between the two packages, not just the branch.
		const frames: FrameRequestCallback[] = [];

		vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => frames.push(cb));
		vi.stubGlobal('cancelAnimationFrame', () => undefined);

		const { container, rerender } = render(
			createElement(ResultsHeaderView, props({ resultCount: 100, summaries: [], totalCount: 500 })),
		);

		act(() => {
			rerender(createElement(ResultsHeaderView, props({ resultCount: 200, summaries: [], totalCount: 500 })));
		});

		// Snaps straight to the target...
		expect(numberEl(container)?.textContent).toBe('200');
		// ...without scheduling a single frame, and without ever entering the "computing" state.
		expect(frames).toHaveLength(0);
		expect(numberEl(container)?.className).not.toContain('fe-result-count__number--computing');

		vi.unstubAllGlobals();
	});
});
