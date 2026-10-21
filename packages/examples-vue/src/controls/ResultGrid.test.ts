/**
 * Tests for the generic `<ResultGrid>` — the shared window and the shared words, for every dataset.
 *
 * @remarks
 * The grid starts at `RESULT_GRID_WINDOW.initial` cards, grows by `batch` each time the bottom
 * sentinel scrolls into view, stops at `cap`, and shows the cap notice ONLY when the cap is what
 * stopped it. Its empty state, list name and scroller name are `RESULT_COPY[dataset]`. jsdom has no
 * `IntersectionObserver`, so the cases install a stand-in that hands the grid's callback back to them.
 */

import { RESULT_COPY, RESULT_GRID_WINDOW, type ResultDataset } from '@filter-enginez/examples-shared/verticals';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ResultGrid from './ResultGrid.vue';

/** One result row; only its id matters to the grid. */
interface Row {
	readonly id: string;
}

/**
 * `count` rows with distinct ids.
 *
 * @param count - How many.
 * @returns The rows.
 */
function rows(count: number): Row[] {
	return Array.from({ length: count }, (_unused, index) => ({ id: `r${String(index)}` }));
}

/** The callback the grid gave the most recent observer. */
let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

/** Every wrapper mounted by a case, unmounted after it. */
const mounted: VueWrapper[] = [];

beforeEach(() => {
	intersect = null;
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			/** Nothing to release. */
			readonly disconnect = (): void => undefined;

			/** The case drives intersections by hand. */
			readonly observe = (): void => undefined;

			constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
				intersect = callback;
			}
		},
	);
});

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
	vi.unstubAllGlobals();
});

/**
 * Mount the grid over some rows.
 *
 * @param results - The rows.
 * @param dataset - Whose copy to use.
 * @returns The wrapper.
 */
async function mountGrid(results: readonly Row[], dataset: ResultDataset = 'wine') {
	const wrapper = mount(ResultGrid, {
		// `mount` cannot infer a `generic="T"` component's `T`, so the key reads the row back as one.
		props: { dataset, itemKey: (row: unknown) => (row as Row).id, results },
		slots: { item: '<template #item="{ item }"><div class="row" role="listitem">{{ item.id }}</div></template>' },
	});

	mounted.push(wrapper);
	await flushPromises();

	return wrapper;
}

/**
 * Report the sentinel in view, as scrolling to the end of the grid does.
 */
async function scrollToEnd(): Promise<void> {
	intersect?.([{ isIntersecting: true }]);
	await flushPromises();
}

describe('<ResultGrid>', () => {
	it.each(['books', 'real-estate', 'wine'] as const)('shows the %s empty state from RESULT_COPY', async (dataset) => {
		const wrapper = await mountGrid([], dataset);

		expect(wrapper.find('.fe-result-grid__empty-title').text()).toBe(RESULT_COPY[dataset].emptyTitle);
		expect(wrapper.find('.fe-result-grid__empty-hint').text()).toBe(RESULT_COPY[dataset].emptyHint);
	});

	it('names the list and the scroller from RESULT_COPY', async () => {
		const wrapper = await mountGrid(rows(1204));

		expect(wrapper.find('[role="list"]').attributes('aria-label')).toBe(RESULT_COPY.wine.listLabel(1204));
		expect(wrapper.find('.fe-result-grid__scroller').attributes('aria-label')).toBe(RESULT_COPY.wine.scrollerLabel);
		expect(wrapper.find('.fe-result-grid__scroller').attributes('tabindex')).toBe('0');
	});

	it('renders the first batch, then grows by a batch each time the end scrolls into view', async () => {
		const wrapper = await mountGrid(rows(200));

		expect(wrapper.findAll('.row')).toHaveLength(RESULT_GRID_WINDOW.initial);
		await scrollToEnd();
		expect(wrapper.findAll('.row')).toHaveLength(RESULT_GRID_WINDOW.initial + RESULT_GRID_WINDOW.batch);
		await scrollToEnd();
		await scrollToEnd();
		expect(wrapper.findAll('.row')).toHaveLength(200);
	});

	it('ignores an observer report that the sentinel left the view', async () => {
		const wrapper = await mountGrid(rows(200));

		intersect?.([{ isIntersecting: false }]);
		await flushPromises();

		expect(wrapper.findAll('.row')).toHaveLength(RESULT_GRID_WINDOW.initial);
	});

	it('shows no cap notice when every result fits', async () => {
		const wrapper = await mountGrid(rows(RESULT_GRID_WINDOW.cap));

		while (wrapper.findAll('.row').length < RESULT_GRID_WINDOW.cap) {
			await scrollToEnd();
		}

		expect(wrapper.find('.fe-result-grid__cap-notice').exists()).toBe(false);
	});

	it('stops at the cap and says so', async () => {
		const total = RESULT_GRID_WINDOW.cap + 10;
		const wrapper = await mountGrid(rows(total));

		for (let step = 0; step < 40; step += 1) {
			await scrollToEnd();
		}

		expect(wrapper.findAll('.row')).toHaveLength(RESULT_GRID_WINDOW.cap);
		expect(wrapper.find('.fe-result-grid__cap-notice').text()).toBe(
			`Showing ${RESULT_GRID_WINDOW.cap.toLocaleString()} of ${total.toLocaleString()} matches · narrow your filters to surface the rest`,
		);
	});

	it('returns to the first batch when the result set changes', async () => {
		const wrapper = await mountGrid(rows(200));

		await scrollToEnd();
		await wrapper.setProps({ results: rows(200) });

		expect(wrapper.findAll('.row')).toHaveLength(RESULT_GRID_WINDOW.initial);
	});
});
